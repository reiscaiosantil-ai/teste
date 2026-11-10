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


_GRIDS = {}


def pixel_grid(h, w):
    """Cached float32 (x, y) coordinates for remap; avoids per-frame mgrid."""
    grid = _GRIDS.get((h, w))
    if grid is None:
        if len(_GRIDS) > 16:
            _GRIDS.clear()
        xx, yy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        grid = _GRIDS[(h, w)] = np.dstack([xx, yy])
        grid.setflags(write=False)
    return grid


def flow_map(flow, h, w):
    """Absolute remap coordinates at (h, w) from a flow estimated on a guide."""
    gh, gw = flow.shape[:2]
    if (gh, gw) != (h, w):
        # Resizing is linear, so scaling the small flow first is equivalent.
        flow = cv2.resize(cv2.multiply(flow, (w / gw, h / gh, 0, 0)), (w, h),
                          interpolation=cv2.INTER_LINEAR)
    return cv2.add(pixel_grid(h, w), flow)


def scene_flow(flow, cell=24):
    """Flow of the scene on a coarse grid (cell means, then a 3 × 3 median of
    cells), smoothly interpolated. One particle cannot dominate a cell."""
    h, w = flow.shape[:2]
    gw, gh = max(3, round(w / cell)), max(3, round(h / cell))
    coarse = cv2.resize(flow, (gw, gh), interpolation=cv2.INTER_AREA)
    coarse = cv2.merge([cv2.medianBlur(np.ascontiguousarray(coarse[:, :, c]), 3)
                        for c in range(2)])
    return cv2.resize(coarse, (w, h), interpolation=cv2.INTER_LINEAR)


def robust_reference(observations):
    """Reference from 2–4 aligned earlier observations, robust to ONE bright
    outlier (a particle still visible in one of them, e.g. a slow one).

    Returns (reference, spread): the mean of all but the brightest value per
    channel (both values when only two exist) and, as agreement measure, the
    gap between the lowest and the second-brightest value (|a - b| for two).
    Only real observed pixels are combined; nothing is synthesized.
    """
    if len(observations) == 2:
        a, b = observations
        return cv2.addWeighted(a, .5, b, .5, 0), cv2.absdiff(a, b)
    values = observations[:4]
    low = values[0]
    for value in values[1:]:
        low = cv2.min(low, value)
    if len(values) == 3:
        a, b, c = values
        high = cv2.max(cv2.max(a, b), c)
        second = cv2.max(cv2.min(a, b), cv2.min(cv2.max(a, b), c))
    else:
        a, b, c, d = values
        p, q, r, t = cv2.max(a, b), cv2.min(a, b), cv2.max(c, d), cv2.min(c, d)
        high = cv2.max(p, r)
        second = cv2.max(cv2.min(p, r), cv2.max(q, t))
    total = values[0].astype(np.int16)
    for value in values[1:]:
        total = cv2.add(total, value, dtype=cv2.CV_16S)
    total = cv2.subtract(total, high, dtype=cv2.CV_16S)
    reference = cv2.convertScaleAbs(total, alpha=1 / (len(values) - 1))
    return reference, cv2.subtract(second, low)


def within(a, b, limit):
    """Mask where every channel of |a - b| is <= limit (max over channels)."""
    return cv2.inRange(cv2.absdiff(a, b), (0, 0, 0), (limit, limit, limit)) > 0


def lift_change(original, work, restored):
    """Lift only the signed restoration difference, preserving source pixels."""
    if original.shape == work.shape:
        return restored
    difference = cv2.subtract(restored, work, dtype=cv2.CV_16S)
    h, w = original.shape[:2]
    low, high = cv2.minMaxLoc(difference.reshape(-1, 1))[:2]
    if -128 <= low and high <= 127:
        # Usual case: an offset 8-bit difference resizes with OpenCV's
        # fixed-point SIMD path (about half the cost of int16 at 1080p).
        # Interpolation rounding may differ by one level.
        offset = cv2.add(difference, 128, dtype=cv2.CV_8U)
        offset = cv2.resize(offset, (w, h), interpolation=cv2.INTER_LINEAR)
        return cv2.addWeighted(original, 1, offset, 1, -128, dtype=cv2.CV_8U)
    difference = cv2.resize(difference, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.add(original, difference, dtype=cv2.CV_8U)


class TemporalRestorer:
    def __init__(self):
        self.reset()

    def reset(self):
        self.previous = None
        self.older = None
        self.history = []          # earlier observations aligned to the last frame
        self.previous_guide = None
        self.flow = None           # guide flow current -> previous (last frame)
        self.previous_full = None  # raw full-resolution previous frame
        self.levels = None
        self.ceiling = None
        self.overlay = None
        self.tone = None
        self.metrics = {'temporal_fraction': 0., 'particle_fraction': 0.}

    def clean(self, frame, amount, dt):
        work = working_frame(frame, 480, 270)
        result = self._clean_work(work, amount, dt)
        return self.suppress(lift_change(frame, work, result))

    def suppress(self, image):
        """Clamp confirmed transient particles at any resolution.

        The ceiling holds, only at particles found in the current frame, the
        level observed at the same aligned place in the two previous frames
        (plus a margin). Elsewhere it is 255, so nothing else changes. Clamping
        at the output resolution removes the sharp particle core that a lifted
        low-resolution difference would leave as a halo. It never adds texture.
        """
        if self.ceiling is None:
            return image
        h, w = image.shape[:2]
        ceiling = self.ceiling
        if ceiling.shape[:2] != (h, w):
            ceiling = cv2.resize(ceiling, (w, h), interpolation=cv2.INTER_LINEAR)
        return cv2.min(image, ceiling)

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
        if self.overlay is not None and self.overlay.shape != (h, w):
            self.overlay = None
        restart = (self.previous is None or self.previous.shape != frame.shape or
                   dt <= 0 or dt > .25 or self.previous_guide.shape != guide.shape or
                   float(cv2.absdiff(guide, self.previous_guide).mean()) > 28)
        self.metrics = {'temporal_fraction': 0., 'particle_fraction': 0.}
        self.ceiling = None
        output = frame.copy()
        older = None
        if not restart:
            # Current-to-previous backward flow plus a forward consistency test.
            back = cv2.calcOpticalFlowFarneback(guide, self.previous_guide, None,
                                               .5, 2, 15, 2, 5, 1.1, 0)
            forward = cv2.calcOpticalFlowFarneback(self.previous_guide, guide, None,
                                                  .5, 2, 15, 2, 5, 1.1, 0)
            back_map = cv2.add(pixel_grid(sh, sw), back)
            mx, my = back_map[:, :, 0], back_map[:, :, 1]
            inside = (mx >= 1) & (my >= 1) & (mx < sw - 2) & (my < sh - 2)
            matched_flow = cv2.remap(forward, back_map, None, cv2.INTER_LINEAR,
                                     borderMode=cv2.BORDER_REPLICATE)
            loop = cv2.add(back, matched_flow)
            consistent = cv2.magnitude(loop[:, :, 0], loop[:, :, 1]) < 1.25
            matched = cv2.remap(self.previous_guide, back_map, None, cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_REPLICATE)
            consistent &= cv2.absdiff(guide, matched) < 18
            valid_guide = (inside & consistent).astype(np.uint8)
            valid = cv2.resize(valid_guide, (w, h), interpolation=cv2.INTER_NEAREST).astype(bool)
            full_map = flow_map(back, h, w)
            previous = cv2.remap(self.previous, full_map, None, cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)
            # Older remains a raw observation, aligned through each frame. It
            # never contains synthesized texture or an unbounded IIR history.
            older = previous
            stable = valid & within(frame, previous, 12)
            alpha = stable.astype(np.float32) * (.4 * amount)
            reference = previous
            particles = np.zeros((h, w), bool)
            self.flow = back
            if self.history:
                # Particle references follow the scene, not a single spot: a
                # large particle can drag the raw flow along with it, which
                # would carry the earlier particle onto the current one.
                robust_map = flow_map(scene_flow(back), h, w)
                seen = cv2.remap(self.previous, robust_map, None, cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)
                earlier = [cv2.remap(item, robust_map, None, cv2.INTER_LINEAR,
                                     borderMode=cv2.BORDER_REPLICATE) for item in self.history]
                # 0.3.9: up to four earlier observations; the brightest one is
                # discarded, so a slow particle still present in one of them
                # does not spoil the reference. The rest must agree (12 levels
                # tolerates the noise of turbid water).
                particle_reference, spread = robust_reference([seen] + earlier)
                agreement = within(spread, np.zeros_like(spread), 12)
                older = [seen] + earlier[:2]
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                reference_gray = cv2.cvtColor(particle_reference, cv2.COLOR_BGR2GRAY)
                opened = cv2.morphologyEx(gray, cv2.MORPH_OPEN,
                                          np.ones((7, 7), np.uint8))
                local_spot = cv2.subtract(gray, opened) > 14
                transient = cv2.subtract(gray, reference_gray) > 16
                # Overlay (HUD, depth, logos): small bright marks that stay at
                # the same screen position, unaligned, while the scene moves.
                # A remembered map also protects digits when they change.
                fixed = local_spot & within(frame, self.previous, 8)
                if self.overlay is None:
                    self.overlay = np.zeros((h, w), np.float32)
                cv2.accumulateWeighted(fixed.astype(np.float32), self.overlay, .1)
                protected = cv2.dilate((self.overlay > .25).astype(np.uint8),
                                       np.ones((9, 9), np.uint8)).astype(bool)
                protected |= fixed
                # A visible particle fails the photometric test by definition,
                # so its alignment is judged by the neighbourhood: most of the
                # surrounding 5 × 5 guide pixels must be well aligned.
                around = cv2.blur(valid_guide.astype(np.float32), (5, 5)) >= .6
                around = cv2.resize(around.astype(np.uint8), (w, h),
                                    interpolation=cv2.INTER_NEAREST).astype(bool)
                candidates = (local_spot & transient & agreement & around & ~protected).astype(np.uint8)
                # Include the soft rim of each spot (blur/compression) before
                # measuring size; the core must still satisfy every test.
                rim = cv2.subtract(gray, reference_gray) > 8
                candidates = cv2.dilate(candidates, np.ones((3, 3), np.uint8)) & rim & around & ~protected
                candidates = candidates.astype(np.uint8)
                count, labels, stats, _ = cv2.connectedComponentsWithStats(candidates, 8)
                accept = np.zeros(count, np.uint8)
                if count > 1:
                    width = stats[1:, cv2.CC_STAT_WIDTH]
                    height = stats[1:, cv2.CC_STAT_HEIGHT]
                    area = stats[1:, cv2.CC_STAT_AREA]
                    # Compact blobs only: a thin elongated piece is more likely
                    # a cable or edge slightly misaligned by the motion estimate.
                    accept[1:] = ((area <= 64) & (width <= 13) & (height <= 13) &
                                  (np.maximum(width, height) <= 2 * np.minimum(width, height) + 1) &
                                  (area * 3 >= width * height))
                particles = accept[labels].astype(bool)
                # Bound the replacement even where both previous frames agree.
                limited = cv2.max(particle_reference, cv2.subtract(frame, (70, 70, 70, 0)))
                reference = cv2.copyTo(limited, particles.astype(np.uint8), reference.copy())
                # Particle suppression is stronger than ordinary blending: the
                # spot is confirmed transient by two aligned earlier frames.
                weight = min(1., 2.4 * amount)
                alpha[particles] = weight
                if particles.any():
                    mask = cv2.dilate(particles.astype(np.uint8), np.ones((3, 3), np.uint8))
                    target = cv2.addWeighted(frame, 1 - weight,
                                             cv2.add(limited, (6, 6, 6, 0)), weight, 0)
                    self.ceiling = np.full_like(frame, 255)
                    cv2.copyTo(cv2.max(target, cv2.add(limited, (6, 6, 6, 0))), mask, self.ceiling)
            # Do not blend HUD/time/depth characters from different moments.
            top, bottom = max(1, round(h * .12)), max(1, round(h * .1))
            alpha[:top] = 0
            alpha[-bottom:] = 0
            if self.ceiling is not None:
                self.ceiling[:top] = 255
                self.ceiling[-bottom:] = 255
            output = cv2.blendLinear(frame, reference, 1 - alpha, alpha)
            self.metrics = {'temporal_fraction': float(np.mean(alpha > 0)),
                            'particle_fraction': float(np.mean(particles & (alpha > 0)))}
        else:
            self.levels = None
            self.flow = None
        self.previous = frame.copy()
        self.history = older if isinstance(older, list) else ([older] if older is not None else [])
        self.older = self.history[0] if self.history else None
        self.previous_guide = guide
        return output

    def denoise(self, frame, amount):
        """Full-resolution two-observation noise reduction (0.3.9).

        Averages the current frame with the previous RAW frame aligned by the
        motion just measured, only where every channel agrees within 10 levels
        (noise, not motion or particles). Non-recursive: one earlier
        observation, never an accumulated history, so no trails. HUD bands
        and remembered overlay marks are left untouched.
        """
        amount = float(np.clip(amount, 0, 1))
        previous, self.previous_full = self.previous_full, frame
        if (amount == 0 or self.flow is None or previous is None or
                previous.shape != frame.shape):
            return frame
        h, w = frame.shape[:2]
        # A global similarity fitted robustly to the measured flow aligns the
        # whole frame in one pass (a dense full-resolution map costs ~3× more).
        # Where it does not fit (parallax), the 10-level test below simply
        # leaves those pixels untouched.
        matrix = self._global_motion(w, h)
        if matrix is None:
            return frame
        aligned = cv2.warpAffine(previous, matrix, (w, h), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)
        keep = cv2.inRange(cv2.absdiff(frame, aligned), (11, 11, 11), (255, 255, 255))
        top, bottom = max(1, round(h * .12)), max(1, round(h * .1))
        keep[:top] = 255
        keep[-bottom:] = 255
        if self.overlay is not None:
            hud = cv2.resize((self.overlay > .25).astype(np.uint8), (w, h),
                             interpolation=cv2.INTER_NEAREST)
            keep[cv2.dilate(hud, np.ones((5, 5), np.uint8)) > 0] = 255
        weight = min(.5, 1.2 * amount)
        out = cv2.addWeighted(frame, 1 - weight, aligned, weight, 0)
        cv2.copyTo(frame, keep, out)
        return out

    def _global_motion(self, w, h):
        """Forward matrix for cv2.warpAffine that brings the previous frame
        onto the current one, fitted robustly to the guide flow."""
        flow = self.flow
        gh, gw = flow.shape[:2]
        step = max(1, gw // 24)
        ys, xs = np.mgrid[step // 2:gh:step, step // 2:gw:step]
        source = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float32)
        target = source + flow[ys.ravel(), xs.ravel()]
        matrix, inliers = cv2.estimateAffinePartial2D(source, target, method=cv2.RANSAC,
                                                      ransacReprojThreshold=.6, maxIters=100)
        if matrix is None or inliers is None or inliers.mean() < .5:
            return None
        # Scale guide coordinates to the frame: x' = S·M·S⁻¹·x.
        sx, sy = w / gw, h / gh
        matrix = matrix.copy()
        matrix[0, 1] *= sx / sy
        matrix[1, 0] *= sy / sx
        matrix[0, 2] *= sx
        matrix[1, 2] *= sy
        # The fit maps current -> previous; warpAffine expects previous -> current.
        return cv2.invertAffineTransform(matrix)

    def natural(self, source, enhanced, color, contrast, dt):
        """Final composition used by the AI paths (0.3.6).

        Luminance (veil removal, contrast) comes from the restoration. Color
        comes from the source frame: part of the average water tint is
        removed and saturation is raised by at most (1 + color); only a
        fraction `0.8 × color` of the network's own chroma is mixed in, so
        it cannot paint new violet/neon hues. `contrast` blends a limited
        CLAHE on luminance to open dark and veiled areas.
        """
        color = float(np.clip(color, 0, 1))
        contrast = float(np.clip(contrast, 0, 1))
        src = cv2.cvtColor(source, cv2.COLOR_BGR2YCrCb)
        out = cv2.cvtColor(enhanced, cv2.COLOR_BGR2YCrCb)
        y, cr_out, cb_out = cv2.split(out)
        _, cr, cb = cv2.split(src)
        sample = src[::8, ::8, 1:].reshape(-1, 2).astype(np.float32) - 128
        tone = np.median(sample, axis=0) if sample.size else np.zeros(2, np.float32)
        blend = 1 - np.exp(-min(max(dt, .001), .25) / .5)
        self.tone = tone if self.tone is None else self.tone + blend * (tone - self.tone)
        saturation, mix = 1 + color, .8 * color
        channels = [y]
        for index, (source_c, network_c) in enumerate(((cr, cr_out), (cb, cb_out))):
            # (c - 128 - 0.6·tone)·sat + 128, then mixed with the network chroma.
            offset = 128 - 128 * saturation - .6 * float(self.tone[index]) * saturation
            if mix:
                natural = cv2.addWeighted(source_c, saturation, source_c, 0, offset, dtype=cv2.CV_32F)
                channels.append(cv2.addWeighted(natural, 1 - mix, network_c.astype(np.float32),
                                                mix, 0, dtype=cv2.CV_8U))
            else:
                channels.append(cv2.addWeighted(source_c, saturation, source_c, 0, offset,
                                                dtype=cv2.CV_8U))
        if contrast > 0:
            clahe = getattr(self, '_clahe', None)
            if clahe is None:
                clahe = self._clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 5))
            channels[0] = cv2.addWeighted(y, 1 - contrast, clahe.apply(y), contrast, 0)
        return cv2.cvtColor(cv2.merge(channels), cv2.COLOR_YCrCb2BGR)

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
    # L1 chroma distance from neutral gray, computed with OpenCV SIMD
    # operations instead of full-frame int16 NumPy reductions.
    offset = (0, 128, 128, 0)
    _, cr0, cb0 = cv2.split(cv2.absdiff(original, offset))
    y, cr, cb = cv2.split(result)
    _, cr1, cb1 = cv2.split(cv2.absdiff(result, offset))
    before = cv2.add(cr0, cb0, dtype=cv2.CV_32F)
    after = cv2.add(cr1, cb1, dtype=cv2.CV_32F)
    scale = cv2.min(cv2.divide(cv2.add(before, 10), cv2.max(after, 1)), 1)
    # The restoration control sets how strongly the conservative cap is used.
    strength = min(1., amount * 2)
    scale = cv2.addWeighted(scale, strength, scale, 0, 1 - strength)
    channels = [y]
    for chroma in (cr, cb):
        centered = cv2.subtract(chroma, 128, dtype=cv2.CV_32F)
        channels.append(cv2.add(cv2.multiply(centered, scale), 128, dtype=cv2.CV_8U))
    return cv2.cvtColor(cv2.merge(channels), cv2.COLOR_YCrCb2BGR)
