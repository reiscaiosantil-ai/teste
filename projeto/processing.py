"""Conservative, non-generative underwater enhancement. BGR uint8 in/out."""
from dataclasses import dataclass
import math
import threading
import cv2
import numpy as np


@dataclass(frozen=True)
class Settings:
    enabled: bool = True
    strength: float = 1.0
    exposure: float = 0.0
    color: float = 0.15
    contrast: float = 1.3
    haze: float = 0.80
    denoise: bool = False
    mode: str = "classic"
    quality: str = "fast"
    backend: str = "auto"
    device_id: int = 0  # DirectML adapter index; -1 = most dedicated memory
    ai_noise: float = 0.0
    ai_sharp: float = 0.0
    ai_realtime: bool = False
    ai_specks: float = 0.0
    ai_restore: float = 0.0
    ai_color: float = 0.3      # 0.3.6: chroma gain limit / network chroma share
    ai_contrast: float = 0.5   # 0.3.6: limited local contrast on luminance
    ai_auto: bool = False      # 0.3.9: fine controls follow the scene
    stabilize: float = 0.0     # 0.3.9: digital stabilization of the treated view
    perf_max: int = 3          # 0.3.12: highest automatic economy level (5 = extra levels)


class Enhancer:
    def __init__(self):
        self.ai = None
        self.temporal = None
        self.auto = None
        self.stabilizer = None
        self.ai_key = None
        self.ai_failure = None
        self.status = "Clássico"
        self.gains = None
        self.atmosphere = None
        self.previous_small = None
        self.clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))

    def reset(self):
        self.gains = self.atmosphere = None
        self.previous_small = None
        if self.temporal is not None:
            self.temporal.reset()
        if self.stabilizer is not None:
            self.stabilizer.reset()

    def process(self, frame, settings, dt=1 / 30):
        if frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] != 3:
            raise ValueError("Esperado um quadro BGR uint8 com três canais.")
        if not settings.enabled or settings.strength <= 0:
            if self.temporal is not None:
                self.temporal.reset()
            return frame.copy()
        if not np.any(frame):
            self.reset()
            return frame.copy()
        if settings.mode == "ai":
            key=(settings.quality,settings.backend,settings.device_id)
            if key != self.ai_key:
                self.ai_key=key; self.ai=None; self.ai_failure=None
                try:
                    from rov_ai import RovAI
                    self.ai=RovAI(settings.backend,settings.quality,settings.device_id)
                except Exception as exc:
                    self.ai_failure=str(exc)
            if self.ai_failure:
                self.status="IA indisponível; reconecte ou use Clássico"
                raise RuntimeError(self.ai_failure)
            self.status="IA WaterNet • " + (getattr(self.ai, "description", None) or "/".join(self.ai.providers)) + " • " + settings.quality
            try:
                from temporal_restore import TemporalRestorer, working_frame, lift_change, limit_added_chroma
                if self.temporal is None:
                    self.temporal = TemporalRestorer()
                work = working_frame(frame)
                if self.auto is None:
                    from auto_visual import AutoVisual
                    from stabilize import Stabilizer
                    self.auto, self.stabilizer = AutoVisual(), Stabilizer()
                settings = self.auto.apply(settings, work, dt,
                                           self.temporal.metrics.get('particle_fraction', 0.))
                cleaned = self.temporal.clean(work, settings.ai_restore, dt)
                if self.temporal.ceiling is not None:
                    frame = self.temporal.suppress(frame)
                    work = self.temporal.suppress(work)
                frame = self.temporal.denoise(frame, settings.ai_noise)
                correction = (self.stabilizer.update(work, dt, settings.stabilize)
                              if settings.stabilize > 0 else None)
                enhanced = self.ai.process(cleaned, settings.strength)
                enhanced = self.temporal.natural(work, enhanced, settings.ai_color,
                                                 settings.ai_contrast * settings.strength, dt)
                enhanced = self.temporal.clarify(enhanced, settings.ai_restore * settings.strength, dt)
                enhanced = finish_ai(enhanced, settings.ai_noise, 0., settings.ai_specks)
                result = sharpen_detail(lift_change(frame, work, enhanced), settings.ai_sharp)
                if correction is not None:
                    result = self.stabilizer.warp(result, correction,
                                                  min(self.stabilizer.width, work.shape[1]))
                return result
            except Exception as exc:
                self.ai_failure=str(exc)
                raise
        self.status="Clássico"
        if self.temporal is not None:
            self.temporal.reset()
        alpha = 1 - math.exp(-min(max(dt, 0.001), 0.5) / 0.4)
        small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
        # Reset estimators on cuts; never drag one scene's water color into another.
        if self.previous_small is not None and np.mean(cv2.absdiff(small, self.previous_small)) > 35:
            self.reset()
        self.previous_small = small
        means = small.mean(axis=(0, 1)).astype(np.float32)
        target = np.clip(means.mean() / np.maximum(means, 8), 0.85, 1.15)
        # Smooth correction parameters, never blend moving scene pixels.
        self.gains = target if self.gains is None else self.gains + alpha * (target - self.gains)
        gains = 1 + (self.gains - 1) * settings.color
        # Estimate the veil on received pixels before gamma/color/contrast changes.
        work = self._dehaze(frame, settings.haze, alpha) if settings.haze > 0 else frame
        if settings.color > 0 or settings.exposure != 0:
            x = np.arange(256, dtype=np.float32)
            # Lift shadows with a bounded gamma rather than saturating highlights.
            gamma = 2 ** (-settings.exposure * 0.45)
            luts = np.stack([np.clip((x / 255) ** gamma * 255 * g, 0, 255)
                             for g in gains], axis=1).astype(np.uint8).reshape(256, 1, 3)
            work = cv2.LUT(work, luts)
        if settings.contrast > 1.01:
            lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB)
            self.clahe.setClipLimit(min(settings.contrast, 2.0))
            lab[:, :, 0] = self.clahe.apply(lab[:, :, 0])
            work = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        if settings.denoise:
            work = cv2.bilateralFilter(work, 5, 18, 18)
        return cv2.addWeighted(frame, 1 - settings.strength, work, settings.strength, 0)

    def _dehaze(self, frame, amount, alpha):
        # UDCP-inspired blue/green prior + a guided transmission map. Heuristic
        # restoration, not calibrated radiometry or a learned/generative model.
        h, w = frame.shape[:2]
        sw = min(w, 320)
        sh = max(8, round(h * sw / w))
        small = cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        kernel = np.ones((11, 11), np.uint8)
        # OpenCV is BGR: omit red from transmission estimation because red is
        # often strongly attenuated underwater and defeats the RGB dark prior.
        dark = cv2.erode(small[:, :, :2].min(axis=2), kernel)
        # Exclude borders where timestamps/logos frequently occur. Erosion also
        # rejects isolated lamps/particles better than choosing brightest pixels.
        margin_y, margin_x = max(1, sh // 10), max(1, sw // 10)
        region = dark[margin_y:-margin_y, margin_x:-margin_x]
        colors = small[margin_y:-margin_y, margin_x:-margin_x].reshape(-1, 3)
        if not region.size:
            region, colors = dark, small.reshape(-1, 3)
        count = max(1, region.size // 100)
        indices = np.argpartition(region.ravel(), -count)[-count:]
        atmosphere = np.clip(np.median(colors[indices], axis=0), 0.04, 1.0)
        self.atmosphere = atmosphere if self.atmosphere is None else self.atmosphere + alpha * (atmosphere - self.atmosphere)
        normalized = small[:, :, :2] / self.atmosphere[:2]
        dark_normalized = cv2.erode(normalized.min(axis=2), kernel)
        # Bound the inversion to avoid unlimited noise amplification.
        omega = min(max(amount, 0.0), 1.0) * .98
        transmission = 1 - omega * np.clip(dark_normalized, 0, 1)
        guide = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        transmission = guided_filter(guide, transmission, radius=7, epsilon=.001)
        transmission = np.clip(transmission, .40, 1)
        inverse = cv2.resize(1 / transmission, (w, h), interpolation=cv2.INTER_LINEAR)
        air = tuple(float(value * 255) for value in self.atmosphere) + (0.0,)
        # OpenCV's SIMD operations avoid slow full-frame NumPy channel broadcasting.
        result = cv2.subtract(frame, air, dtype=cv2.CV_32F)
        cv2.multiply(result, cv2.merge([inverse, inverse, inverse]), dst=result)
        cv2.add(result, air, dst=result)
        cv2.max(result, 0, dst=result)
        restored = cv2.convertScaleAbs(result)
        # Dehaze changes luminance only: do not let the veil estimate invent
        # red/blue chroma in neutral walls, lamps or suspended particles.
        original_ycc = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        restored_ycc = cv2.cvtColor(restored, cv2.COLOR_BGR2YCrCb)
        original_ycc[:, :, 0] = restored_ycc[:, :, 0]
        return cv2.cvtColor(original_ycc, cv2.COLOR_YCrCb2BGR)


def guided_filter(guide, source, radius=7, epsilon=.001):
    """Grayscale guided filter, following He et al.; runs at estimation size."""
    size = (2 * radius + 1, 2 * radius + 1)
    def mean(image):
        return cv2.boxFilter(image, cv2.CV_32F, size, borderType=cv2.BORDER_REFLECT)
    mean_i, mean_p = mean(guide), mean(source)
    variance = np.maximum(mean(guide * guide) - mean_i * mean_i, 0)
    covariance = mean(guide * source) - mean_i * mean_p
    a = covariance / (variance + epsilon)
    b = mean_p - a * mean_i
    return mean(a) * guide + mean(b)


def finish_ai(frame, noise=0.0, sharp=0.0, specks=0.0):
    """Optional spatial finishing; no temporal mixing or generated detail.
    Zero controls return exactly the previous AI output.
    """
    if not (math.isfinite(noise) and math.isfinite(sharp) and math.isfinite(specks)):
        raise ValueError("Controles devem ser finitos.")
    noise,sharp=float(np.clip(noise,0,1)),float(np.clip(sharp,0,1))
    work=frame.copy()
    if noise>0:
        smooth=cv2.bilateralFilter(work,5,12+28*noise,2)
        work=cv2.addWeighted(work,1-noise,smooth,noise,0)
    specks = float(np.clip(specks, 0, 1))
    if specks > 0:
        # Only very small, locally bright connected regions are attenuated.
        # Edges/large highlights are excluded; real tiny targets remain a risk.
        gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
        median = cv2.medianBlur(gray, 3)
        opened = cv2.morphologyEx(gray, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        residual = cv2.min(cv2.subtract(gray, median), cv2.subtract(gray, opened))
        candidates = (residual > 20).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(candidates, 8)
        accept = np.zeros(count, np.uint8)
        if count > 1:
            accept[1:] = ((stats[1:, cv2.CC_STAT_AREA] <= 6) &
                          (stats[1:, cv2.CC_STAT_WIDTH] <= 4) &
                          (stats[1:, cv2.CC_STAT_HEIGHT] <= 4))
        mask = accept[labels].astype(np.float32)
        correction = np.minimum(residual, 40).astype(np.float32) * mask * specks
        work = cv2.subtract(work, cv2.merge([correction] * 3), dtype=cv2.CV_8U)
    if sharp>0:
        # Sharpen luminance transitions above a noise deadband; cap the change.
        gray=cv2.cvtColor(work,cv2.COLOR_BGR2GRAY).astype(np.float32)
        detail=cv2.subtract(gray,cv2.GaussianBlur(gray,(5,5),1.0))
        # Soft threshold: sign(d) * max(|d| - 2, 0), without NumPy temporaries.
        correction=cv2.add(cv2.max(cv2.subtract(detail,2),0),cv2.min(cv2.add(detail,2),0))
        correction=cv2.max(cv2.min(correction*sharp,10*sharp),-10*sharp)
        work=cv2.add(work, cv2.merge([correction] * 3), dtype=cv2.CV_8U)
    return work


def sharpen_detail(frame, amount=0.0):
    """Sharpen `frame` from its own luminance; see detail_layers()."""
    return apply_detail(frame, detail_layers(frame, amount))


def detail_layers(frame, amount=0.0):
    """Noise-aware, halo-free luminance sharpening layers (up, down) or None.

    Detail below a noise threshold estimated from the frame itself is not
    amplified. The sharpened value of each pixel is clamped to the minimum and
    maximum of its own 3 × 3 neighbourhood in the input, so edges get steeper
    but no halos, ringing or values absent from the neighbourhood appear.
    It increases contrast of existing transitions; it does not recover detail.
    """
    if not math.isfinite(amount):
        raise ValueError("Controles devem ser finitos.")
    amount = float(np.clip(amount, 0, 1))
    if amount == 0:
        return None
    h, w = frame.shape[:2]
    scratch = _scratch((h, w))
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY, dst=scratch[0])
    blur = cv2.GaussianBlur(gray, (7, 7), 1.2, dst=scratch[1])
    # Saturated uint8 arithmetic keeps every step on OpenCV's SIMD path:
    # positive and negative detail are handled as two separate layers.
    above = cv2.subtract(gray, blur, dst=scratch[2])
    below = cv2.subtract(blur, gray, dst=scratch[3])
    # Robust noise level (MAD) from a sparse sample of the detail layer.
    sample = cv2.max(above[::8, ::8], below[::8, ::8])
    sigma = 1.4826 * float(np.median(sample)) if sample.size else 0.
    threshold = max(1.5, 2.5 * sigma)
    gain = 3. * amount
    up = cv2.convertScaleAbs(cv2.subtract(above, threshold, dst=above), alpha=gain, dst=above)
    down = cv2.convertScaleAbs(cv2.subtract(below, threshold, dst=below), alpha=gain, dst=below)
    sharp = cv2.subtract(cv2.add(gray, up, dst=scratch[4]), down, dst=scratch[4])
    kernel = np.ones((3, 3), np.uint8)
    cv2.max(sharp, cv2.erode(gray, kernel, dst=scratch[1]), dst=sharp)
    cv2.min(sharp, cv2.dilate(gray, kernel, dst=scratch[1]), dst=sharp)
    # New arrays: the layers may be applied later on another thread.
    return cv2.subtract(sharp, gray), cv2.subtract(gray, sharp)


def apply_detail(frame, layers):
    """Add luminance layers from detail_layers() equally to B, G and R.

    The layers may come from the input frame of a restoration whose change is
    smooth (lifted from a small grid); the neighbourhood limit still holds
    approximately. Returns a new array; published frames are immutable.
    """
    if layers is None:
        return frame
    up, down = layers
    if up.shape[:2] != frame.shape[:2]:
        raise ValueError("Camadas de nitidez com tamanho diferente do quadro.")
    scratch = _scratch(frame.shape[:2])
    out = cv2.add(frame, cv2.merge([up, up, up], dst=scratch[5]))
    return cv2.subtract(out, cv2.merge([down, down, down], dst=scratch[5]), dst=out)


_local = threading.local()


def _scratch(shape):
    """Per-thread reusable buffers; avoids page faults of fresh 1080p arrays."""
    cached = getattr(_local, "buffers", None)
    if cached is None or cached[0] != shape:
        h, w = shape
        cached = (shape, [np.empty((h, w), np.uint8) for _ in range(5)] +
                  [np.empty((h, w, 3), np.uint8)])
        _local.buffers = cached
    return cached[1]
