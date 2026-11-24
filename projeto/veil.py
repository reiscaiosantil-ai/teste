"""Physical veil (backscatter) removal for the AI paths (0.3.14).

Turbid water adds a veil to every pixel: I = J·t + A·(1 − t), where A is the
colour of the water lit by the lamps and t the fraction of the scene light
that survives the path. The inversion J = (I − A)/t + A is a pointwise affine
map with smooth coefficients, so it is stored like the network correction
([a − 1, b] per channel on a small grid) and applied by rov_ai.apply_affine
with the same noise protection. Nothing is drawn: each output pixel depends
only on the same input pixel and two smooth maps.

t comes from the dark-channel prior on blue/green (red is absorbed by the
water itself and would defeat the prior), refined by a guided filter and
bounded below so the gain never exceeds `max_gain`. A is the colour of the
most veiled region, smoothed in time. Both come from the CURRENT frame, so
there is no temporal lag (no trail) by construction.
"""
import cv2
import numpy as np

GRID = (256, 144)


def _box(image, radius):
    return cv2.boxFilter(image, cv2.CV_32F, (2 * radius + 1, 2 * radius + 1),
                         borderType=cv2.BORDER_REFLECT)


class VeilRemover:
    def __init__(self, tau=1., max_gain=2.5, max_exposure=1.6):
        self.tau, self.max_gain, self.max_exposure = tau, max_gain, max_exposure
        self.reset()

    def reset(self):
        self.air = None
        self.exposure = None
        self.level = 0.  # mean veil fraction removed (for the status line)

    def correction(self, frame, amount, dt=1 / 30):
        """6-channel affine map (a − 1, b) for `frame`, or None when off."""
        amount = float(np.clip(amount, 0, 1))
        if amount <= 0:
            return None
        small = cv2.resize(frame, GRID, interpolation=cv2.INTER_AREA).astype(np.float32)
        return self._estimate(small, amount, dt)

    def merged(self, frame, first, strength, amount, dt=1 / 30):
        """One affine map equal to: network correction `first` (at `strength`)
        followed by the veil removal estimated on that result. Apply it with
        strength 1. The veil is estimated on a small copy, so the frame is
        filtered only once at working resolution."""
        small = cv2.resize(frame, GRID, interpolation=cv2.INTER_AREA).astype(np.float32)
        gain1 = offset1 = None
        if first is not None and first.ndim == 3 and first.shape[2] == 6 and strength > 0:
            if first.shape[:2] != small.shape[:2]:
                first = np.dstack([cv2.resize(first[:, :, :3], GRID, interpolation=cv2.INTER_LINEAR),
                                   cv2.resize(first[:, :, 3:], GRID, interpolation=cv2.INTER_LINEAR)])
            gain1 = first[:, :, :3] * np.float32(strength)
            offset1 = first[:, :, 3:] * np.float32(strength)
            small = np.clip(small * (1 + gain1) + offset1, 0, 255)
        second = self._estimate(small, float(np.clip(amount, 0, 1)), dt)
        if gain1 is None:
            return second
        out = np.empty_like(second)
        out[:, :, :3] = (1 + gain1) * (1 + second[:, :, :3]) - 1
        out[:, :, 3:] = (1 + second[:, :, :3]) * offset1 + second[:, :, 3:]
        return out

    def _estimate(self, small, amount, dt):
        h, w = small.shape[:2]
        kernel = np.ones((7, 7), np.uint8)
        dark = cv2.erode(cv2.min(small[:, :, 0], small[:, :, 1]), kernel)
        # HUD bands (text, logos) never define the water colour.
        top, bottom, side = round(h * .12), round(h * .1), round(w * .06)
        region = dark[top:h - bottom, side:w - side]
        colors = small[top:h - bottom, side:w - side].reshape(-1, 3)
        count = max(1, region.size // 100)
        index = np.argpartition(region.ravel(), -count)[-count:]
        air = np.clip(np.median(colors[index], axis=0), 24., 255.)
        if self.air is None:
            self.air = air
        else:
            self.air += (1 - np.exp(-min(max(dt, .001), .25) / self.tau)) * (air - self.air)
        a0, a1 = float(self.air[0]), float(self.air[1])
        normalized = cv2.erode(cv2.min(small[:, :, 0] * (1 / a0), small[:, :, 1] * (1 / a1)), kernel)
        veil = np.clip(normalized, 0, 1) * (.95 * amount)
        # Edge-aware refinement: the veil follows object outlines, not blocks.
        guide = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY) * (1 / 255)
        mean_g, mean_v = _box(guide, 8), _box(veil, 8)
        slope = (_box(guide * veil, 8) - mean_g * mean_v) / (_box(guide * guide, 8) - mean_g * mean_g + 1e-3)
        veil = _box(slope, 8) * guide + _box(mean_v - slope * mean_g, 8)
        t = np.clip(1 - veil, 1 / self.max_gain, 1)
        self.level = float(1 - t.mean())
        gain = 1 / t - 1                       # a − 1
        # Removing a veil darkens the picture. One global exposure factor
        # (smoothed, bounded) brings the median luminance back; being a single
        # number for the whole frame it changes no local relation.
        air_y = .114 * float(self.air[0]) + .587 * float(self.air[1]) + .299 * float(self.air[2])
        y = guide[top:h - bottom] * 255
        restored = y + gain[top:h - bottom] * (y - air_y)
        before, after = float(np.median(y)), float(np.median(restored))
        exposure = float(np.clip(before / max(after, 8.), 1., self.max_exposure))
        # Never push the bright end into clipping: a blown-out target is lost.
        bright = float(np.percentile(restored[::2, ::2], 99))
        exposure = max(1., min(exposure, 235. / max(bright, 1.)))
        if self.exposure is None:
            self.exposure = exposure
        else:
            self.exposure += (1 - np.exp(-min(max(dt, .001), .25) / self.tau)) * (exposure - self.exposure)
        k = np.float32(self.exposure)
        out = np.empty((h, w, 6), np.float32)
        for c in range(3):
            out[:, :, c] = k * (1 + gain) - 1
            out[:, :, 3 + c] = -k * gain * float(self.air[c])   # b = k·A·(1 − 1/t)
        return out


def restore(remover, frame, correction, strength, amount, dt=1 / 30):
    """Network correction plus optional veil removal on the working frame.
    Returns (output, correction for the fine-detail stage, its strength).
    With amount 0 this is exactly the 0.3.13 path."""
    from rov_ai import RovAI, apply_affine
    if amount <= 0 or strength <= 0 or (correction is not None and correction.shape[2] != 6):
        if correction is None:
            return frame, None, strength
        return RovAI.apply(frame, correction, strength), correction, strength
    merged = remover.merged(frame, correction, strength, amount * min(1., strength / .8), dt)
    return apply_affine(frame, merged, 1.), merged, 1.
