"""Experimental motion-compensated restoration using observed frames only.

This is a conventional video restoration stage used with WaterNet, not new
trained weights. Rejected correspondences always keep the current pixels.
"""
import cv2
import numpy as np


def working_frame(frame, max_width=640, max_height=360):
    h, w = frame.shape[:2]
    scale = min(1., max_width / w, max_height / h)
    if scale == 1:
        return frame
    return cv2.resize(frame, (max(1, round(w * scale)), max(1, round(h * scale))),
                      interpolation=cv2.INTER_AREA)


def lift_change(original, work, restored):
    """Lift only the signed restoration difference, preserving source pixels."""
    if original.shape == work.shape:
        return restored
    difference = cv2.subtract(restored, work, dtype=cv2.CV_16S)
    h, w = original.shape[:2]
    difference = cv2.resize(difference, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.add(original, difference, dtype=cv2.CV_8U)


class TemporalRestorer:
    def __init__(self):
        self.reset()

    def reset(self):
        self.previous = None
        self.older = None
        self.previous_guide = None
        self.levels = None
        self.metrics = {'temporal_fraction': 0., 'particle_fraction': 0.}

    def clean(self, frame, amount, dt):
        work = working_frame(frame, 480, 270)
        result = self._clean_work(work, amount, dt)
        return lift_change(frame, work, result)

    def _clean_work(self, frame, amount, dt):
        if not np.isfinite(amount) or not np.isfinite(dt):
            raise ValueError('Controles temporais devem ser finitos.')
        amount = float(np.clip(amount, 0, 1))
        if amount == 0 or not np.any(frame):
            self.reset()
            return frame.copy()
        h, w = frame.shape[:2]
        sw = min(192, w)
        sh = max(8, round(h * sw / w))
        guide = cv2.cvtColor(cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA),
                             cv2.COLOR_BGR2GRAY)
        guide = cv2.GaussianBlur(guide, (5, 5), 1.2)
        restart = (self.previous is None or self.previous.shape != frame.shape or
                   dt <= 0 or dt > .25 or self.previous_guide.shape != guide.shape or
                   float(cv2.absdiff(guide, self.previous_guide).mean()) > 28)
        self.metrics = {'temporal_fraction': 0., 'particle_fraction': 0.}
        output = frame.copy()
        older = None
        if not restart:
            # Current-to-previous backward flow plus a forward consistency test.
            back = cv2.calcOpticalFlowFarneback(guide, self.previous_guide, None,
                                               .5, 2, 15, 2, 5, 1.1, 0)
            forward = cv2.calcOpticalFlowFarneback(self.previous_guide, guide, None,
                                                  .5, 2, 15, 2, 5, 1.1, 0)
            yy, xx = np.mgrid[:sh, :sw].astype(np.float32)
            mx, my = xx + back[:, :, 0], yy + back[:, :, 1]
            inside = (mx >= 1) & (my >= 1) & (mx < sw - 2) & (my < sh - 2)
            matched_flow = cv2.remap(forward, mx, my, cv2.INTER_LINEAR,
                                     borderMode=cv2.BORDER_REPLICATE)
            consistent = np.linalg.norm(back + matched_flow, axis=2) < 1.25
            matched = cv2.remap(self.previous_guide, mx, my, cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_REPLICATE)
            consistent &= cv2.absdiff(guide, matched) < 18
            valid = cv2.resize((inside & consistent).astype(np.uint8), (w, h),
                               interpolation=cv2.INTER_NEAREST).astype(bool)
            full = cv2.resize(back, (w, h), interpolation=cv2.INTER_LINEAR)
            fy, fx = np.mgrid[:h, :w].astype(np.float32)
            fx += full[:, :, 0] * w / sw
            fy += full[:, :, 1] * h / sh
            previous = cv2.remap(self.previous, fx, fy, cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)
            # Older remains a raw observation, aligned through each frame. It
            # never contains synthesized texture or an unbounded IIR history.
            older = previous
            normal_error = cv2.absdiff(frame, previous).max(axis=2)
            stable = valid & (normal_error <= 12)
            alpha = stable.astype(np.float32) * (.4 * amount)
            reference = previous
            particles = np.zeros((h, w), bool)
            if self.older is not None:
                prior = cv2.remap(self.older, fx, fy, cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_REPLICATE)
                particle_reference = cv2.addWeighted(previous, .5, prior, .5, 0)
                agreement = cv2.absdiff(previous, prior).max(axis=2) <= 9
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                reference_gray = cv2.cvtColor(particle_reference, cv2.COLOR_BGR2GRAY)
                opened = cv2.morphologyEx(gray, cv2.MORPH_OPEN,
                                          np.ones((5, 5), np.uint8))
                local_spot = cv2.subtract(gray, opened) > 14
                transient = cv2.subtract(gray, reference_gray) > 16
                candidates = (local_spot & transient & agreement & valid).astype(np.uint8)
                count, labels, stats, _ = cv2.connectedComponentsWithStats(candidates, 8)
                accept = np.zeros(count, np.uint8)
                if count > 1:
                    accept[1:] = ((stats[1:, cv2.CC_STAT_AREA] <= 36) &
                                  (stats[1:, cv2.CC_STAT_WIDTH] <= 9) &
                                  (stats[1:, cv2.CC_STAT_HEIGHT] <= 9))
                particles = accept[labels].astype(bool)
                # Bound the replacement even where both previous frames agree.
                limited = cv2.max(particle_reference, cv2.subtract(frame, (50, 50, 50, 0)))
                reference = cv2.copyTo(limited, particles.astype(np.uint8), reference.copy())
                alpha[particles] = .8 * amount
            # Do not blend HUD/time/depth characters from different moments.
            top, bottom = max(1, round(h * .12)), max(1, round(h * .1))
            alpha[:top] = 0
            alpha[-bottom:] = 0
            output = cv2.blendLinear(frame, reference, 1 - alpha, alpha)
            self.metrics = {'temporal_fraction': float(np.mean(alpha > 0)),
                            'particle_fraction': float(np.mean(particles & (alpha > 0)))}
        else:
            self.levels = None
        self.previous = frame.copy()
        self.older = older
        self.previous_guide = guide
        return output

    def clarify(self, frame, amount, dt):
        """Bounded, smoothed luminance stretch; no new textures or RGB gains."""
        amount = float(np.clip(amount, 0, 1))
        if amount == 0:
            return frame
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (160, 90), interpolation=cv2.INTER_AREA)[12:-10, 8:-8]
        low, high = np.percentile(small, (2, 98))
        if high - low < 24:
            return frame
        target = np.array([min(low, 70.), max(high, 185.)], np.float32)
        blend = 1 - np.exp(-min(max(dt, .001), .25) / .6)
        self.levels = target if self.levels is None else self.levels + blend * (target - self.levels)
        lo, hi = self.levels
        gain = min(1.8, 255 / max(hi - lo, 1.))
        x = np.arange(256, dtype=np.float32)
        change = np.clip(((x - lo) * gain - x) * amount, -32 * amount, 32 * amount)
        delta = cv2.LUT(gray, np.rint(change).astype(np.int16))
        return cv2.add(frame, cv2.merge([delta] * 3), dtype=cv2.CV_8U)


def limit_added_chroma(source, enhanced, amount):
    """Bound excessive newly added color, especially on originally gray water."""
    if amount <= 0:
        return enhanced
    original = cv2.cvtColor(source, cv2.COLOR_BGR2YCrCb)
    result = cv2.cvtColor(enhanced, cv2.COLOR_BGR2YCrCb)
    original_chroma = original[:, :, 1:].astype(np.int16) - 128
    result_chroma = result[:, :, 1:].astype(np.int16) - 128
    before = np.abs(original_chroma).sum(axis=2)
    after = np.abs(result_chroma).sum(axis=2)
    allowed = before + 10
    scale = np.minimum(1., allowed / np.maximum(after, 1)).astype(np.float32)
    # The restoration control sets how strongly the conservative cap is used.
    scale = 1 - min(1., amount * 2) * (1 - scale)
    result[:, :, 1:] = np.clip(np.rint(result_chroma * scale[:, :, None]) + 128, 0, 255).astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_YCrCb2BGR)
