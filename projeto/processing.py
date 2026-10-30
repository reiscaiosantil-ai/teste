"""Conservative, non-generative underwater enhancement. BGR uint8 in/out."""
from dataclasses import dataclass
import math
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
    device_id: int = 0
    ai_noise: float = 0.0
    ai_sharp: float = 0.0
    ai_realtime: bool = False
    ai_specks: float = 0.0
    ai_restore: float = 0.0


class Enhancer:
    def __init__(self):
        self.ai = None
        self.temporal = None
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
            self.status="IA WaterNet • " + "/".join(self.ai.providers) + " • " + settings.quality
            try:
                from temporal_restore import TemporalRestorer, working_frame, lift_change, limit_added_chroma
                if self.temporal is None:
                    self.temporal = TemporalRestorer()
                work = working_frame(frame)
                cleaned = self.temporal.clean(work, settings.ai_restore, dt)
                enhanced = self.ai.process(cleaned, settings.strength)
                enhanced = limit_added_chroma(work, enhanced, settings.ai_restore * settings.strength)
                enhanced = self.temporal.clarify(enhanced, settings.ai_restore * settings.strength, dt)
                enhanced = finish_ai(enhanced, settings.ai_noise, settings.ai_sharp, settings.ai_specks)
                return lift_change(frame, work, enhanced)
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
        detail=gray-cv2.GaussianBlur(gray,(5,5),1.0)
        correction=np.sign(detail)*np.maximum(np.abs(detail)-2,0)*sharp
        correction=np.clip(correction,-10*sharp,10*sharp)
        work=cv2.add(work, cv2.merge([correction] * 3), dtype=cv2.CV_8U)
    return work
