"""Latest-only inference and motion-checked transfer of color corrections.

The displayed pixels always come from the current camera frame. Only the
bounded low-frequency correction is reused; no scene pixels are synthesized.
"""
from dataclasses import dataclass
import threading
import time

import cv2
import numpy as np

from rov_ai import RovAI, resize_channels, detail_gain
from auto_visual import AutoVisual
from stabilize import Stabilizer
from processing import finish_ai, detail_layers, apply_detail
from temporal_restore import (TemporalRestorer, working_frame, lift_change,
                              pixel_grid, flow_map)


@dataclass(frozen=True)
class Correction:
    epoch: int
    key: tuple
    seq: int
    received: float
    delta: np.ndarray
    guide: np.ndarray
    milliseconds: float
    providers: tuple


GLOBAL_AGE = 3.0   # seconds the coarse (veil) correction stays usable


def coarse_map(delta, size=(8, 5)):
    """Low-frequency part of a correction: the water veil/tint changes slowly
    across the image, so a coarse grid stays valid while the camera moves."""
    return resize_channels(delta, size, interpolation=cv2.INTER_AREA)


def similarity(analyzed, current):
    """0–1: how well the analyzed frame's color and contrast still describe the
    current frame. A correction is an absolute color/brightness change; reused
    on a scene with other light or water color (lights switched, turning from
    a wall to open water, a cut) it over-corrects and flashes."""
    a = analyzed.reshape(-1, 3).astype(np.float32)
    c = current.reshape(-1, 3).astype(np.float32)
    color = float(np.abs(a.mean(0) - c.mean(0)).max())
    ga, gc = a.mean(1), c.mean(1)
    spread = abs(float(np.log((gc.std() + 2) / (ga.std() + 2))))
    # Only large changes count (lights, a cut): panning across the same water
    # changes the mean color by 10–20 levels and must keep the correction.
    return float(np.clip(1 - (color - 22) / 30, 0, 1) * np.clip(1 - (spread - .45) / .6, 0, 1))


def transfer(frame, correction, now, strength, coarse=None, return_delta=False):
    """Return current-frame restoration, state, correction age and confidence.

    0.3.10: where the detailed correction cannot be matched to the current
    frame (fast motion, occlusion, particles), the coarse correction fills in
    instead of dropping to the hazy original. Losing it made white "flashes"
    and pale patches while the ROV moved.
    """
    def done(delta, state, age, fraction):
        if return_delta:
            return delta, state, age, fraction
        if delta is None:
            return frame.copy(), state, age, fraction
        return RovAI.apply(frame, delta, strength), state, age, fraction

    age = max(0., now - correction.received)
    gh, gw = correction.delta.shape[:2]
    coarse = coarse_map(correction.delta) if coarse is None else coarse
    smooth = resize_channels(coarse, (gw, gh), interpolation=cv2.INTER_CUBIC)
    # Full-detail budget; after it the detail fades out gradually (below) and
    # the coarse veil correction stays up to GLOBAL_AGE.
    max_age = min(1.2, max(.5, correction.milliseconds / 1000 * 3 + .15))
    if age > GLOBAL_AGE:
        return done(None, 'expired', age, 0.)
    guide = correction.guide
    fw = min(128, gw)
    fh = max(8, round(gh * fw / gw))
    base = cv2.resize(guide, (fw, fh), interpolation=cv2.INTER_AREA)
    current = cv2.resize(frame, (fw, fh), interpolation=cv2.INTER_AREA)
    # Different light/water color than the analyzed frame: weaker reuse.
    match = .35 + .65 * similarity(base, current)
    fade = np.float32(min(1., max(0., (GLOBAL_AGE - age) / .5)))
    smooth *= np.float32(match) * fade
    base_gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    current_gray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
    # Backward flow samples the analysis correction at each current location.
    # 4 pyramid levels (was 2): follows the larger displacements of a fast
    # pan between the analyzed frame and now, on a 128-pixel-wide guide.
    flow = cv2.calcOpticalFlowFarneback(current_gray, base_gray, None,
                                      .5, 4, 15, 3, 5, 1.1, 0)
    flow_xy = cv2.add(pixel_grid(fh, fw), flow)
    mx, my = flow_xy[:, :, 0], flow_xy[:, :, 1]
    inside = (mx >= 0) & (mx <= fw - 1) & (my >= 0) & (my <= fh - 1)
    matched = cv2.remap(base, flow_xy, None, cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_REPLICATE)
    error = cv2.transform(cv2.absdiff(current, matched).astype(np.float32),
                          np.full((1, 3), 1 / 3, np.float32))
    confidence = np.clip((38. - error) / 24., 0., 1.) * inside
    fraction = float(np.mean(confidence > .5))
    if fraction < .45 or float(error.mean()) > 32:
        return done(smooth, 'global', age, fraction)
    confidence = cv2.GaussianBlur(confidence, (3, 3), .65)
    # Analysis late (busy GPU/CPU): keep the detailed correction where it
    # still matches, shifting gradually to the coarse one over 1.5 s instead
    # of dropping it (a dropped correction showed as a white flicker).
    late = age > max_age
    if late:
        confidence *= max(.35, 1 - (age - max_age) / 1.5)
    # Keep the full detailed correction grid; flow is estimated on a small guide.
    warped = cv2.remap(correction.delta, flow_map(flow, gh, gw), None, cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_REPLICATE)
    # Confident places get the detailed correction, the rest the coarse one.
    weight = cv2.resize(confidence, (gw, gh), interpolation=cv2.INTER_LINEAR)[:, :, None]
    warped = smooth + (warped * (np.float32(match) * fade) - smooth) * weight
    return done(warped, 'global' if late else 'applied', age, fraction)


class LiveAI:
    """One running analysis plus one replaceable pending frame, never a queue."""
    def __init__(self, factory=None):
        self.factory = factory
        self.condition = threading.Condition()
        self.pending = None
        self.result = None
        self.error = None
        self.epoch = 0
        self.key = None
        self.closed = False
        self.previous_thumb = None
        self.last_submit = 0.
        self.analysis_fps = 0.
        self.temporal = TemporalRestorer()
        self.auto = AutoVisual()
        self.stabilizer = Stabilizer()
        self.coarse = None          # (correction seq, smoothed coarse map)
        self.perf_level = 0         # economy level set by engine.Governor
        self.last_received = None
        self.thread = threading.Thread(target=self._infer, name='ROV-IA', daemon=True)
        self.thread.start()

    def reset(self):
        with self.condition:
            self.epoch += 1
            self.pending = self.result = self.error = None
            self.key = None
        self.previous_thumb = None
        self.temporal.reset()
        self.stabilizer.reset()
        self.coarse = None
        self.applied = None
        self.last_received = None

    def _infer(self):
        model, loaded_key, failed_key = None, None, None
        count, window = 0, time.perf_counter()
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.closed or self.pending is not None)
                if self.closed:
                    return
                epoch, key, seq, received, frame = self.pending
                self.pending = None
            try:
                if failed_key == (epoch, key):
                    continue
                if loaded_key != key:
                    factory = self.factory or RovAI
                    model = factory(key[1], key[0], key[2])
                    loaded_key = key
                start = time.perf_counter()
                delta, guide = model.estimate(frame)
                ms = (time.perf_counter() - start) * 1000
                result = Correction(epoch, key, seq, received, delta, guide,
                                    ms, (getattr(model, 'description', None) or
                                         '/'.join(model.providers),))
                count += 1
                elapsed = time.perf_counter() - window
                with self.condition:
                    if epoch == self.epoch and key == self.key and not self.closed:
                        self.result, self.error = result, None
                        if elapsed >= .5:
                            self.analysis_fps = count / elapsed
                            count, window = 0, time.perf_counter()
            except Exception:
                # No raw exception text: drivers/URLs can contain private data.
                failed_key = (epoch, key)
                with self.condition:
                    if epoch == self.epoch and key == self.key:
                        self.error = 'IA indisponível; reconecte ou tente CPU'
                        self.result = None

    def process(self, frame, settings, seq, received):
        return self.render(self.prepare(frame, settings, seq, received))

    def prepare(self, frame, settings, seq, received):
        """Stage 1: temporal fusion and latest-only submission to the network.

        Keeps every stateful step that depends on frame order. The returned
        job is finished by render(), possibly on another thread.
        """
        start = time.perf_counter()
        key = (settings.quality, settings.backend, settings.device_id)
        original = frame
        level = self.perf_level
        self.temporal.economy = max(0, min(2, level - 3))
        frame = working_frame(frame, *((512, 288) if level >= 3 else (640, 360)))
        if not np.any(frame):
            self.reset()
            return {'output': original.copy(), 'start': start, 'info': {
                'ai_state': 'black', 'ai_ms': 0., 'ai_age_ms': 0.,
                'ai_fps': self.analysis_fps, 'filter_error': False,
                'processor': 'Quadro preto • original preservado'}}
        thumb = cv2.resize(frame, (64, 36), interpolation=cv2.INTER_AREA)
        cut = (self.previous_thumb is not None and
               float(cv2.absdiff(thumb, self.previous_thumb).mean()) > 35)
        if key != self.key or cut:
            self.reset()
        self.previous_thumb = thumb
        dt = 1 / 30 if self.last_received is None else received - self.last_received
        self.last_received = received
        # 0.3.9: the automatic Visual sets the fine controls from the scene.
        settings = self.auto.apply(settings, frame, dt,
                                   self.temporal.metrics.get('particle_fraction', 0.))
        clean_start = time.perf_counter()
        cleaned = self.temporal.clean(frame, settings.ai_restore, dt)
        if self.temporal.ceiling is not None:
            # Confirmed transient particles are clamped at full resolution in
            # the base that receives the restoration difference.
            original = self.temporal.suppress(original)
            frame = self.temporal.suppress(frame)
        # Full-resolution noise reduction from the previous aligned frame.
        if level >= 1:
            self.temporal.previous_full = None  # Skipped: no stale pair later.
        else:
            original = self.temporal.denoise(original, settings.ai_noise)
        clean_ms = (time.perf_counter() - clean_start) * 1000
        stabilization = None
        if getattr(settings, 'stabilize', 0) > 0:
            correction = self.stabilizer.update(frame, dt, settings.stabilize)
            stabilization = (correction, min(self.stabilizer.width, frame.shape[1]))
        else:
            self.stabilizer.reset()
        with self.condition:
            self.key = key
            # Avoid filling the CPU with analyses faster than the display needs.
            if start - self.last_submit >= 1 / 15 or self.result is None:
                self.pending = (self.epoch, key, seq, received, cleaned)
                self.last_submit = start
                self.condition.notify()
            result, error = self.result, self.error
        info = {'ai_state': 'waiting', 'ai_ms': 0., 'ai_age_ms': 0.,
                'ai_fps': self.analysis_fps, 'filter_error': bool(error),
                'processor': error or 'IA inicializando • original enquanto aguarda',
                'work_size': (frame.shape[1], frame.shape[0]), 'temporal_ms': clean_ms,
                'particle_fraction': self.temporal.metrics.get('particle_fraction', 0.),
                'auto': self.auto.summary() if getattr(settings, 'ai_auto', False) else ''}
        return {'original': original, 'frame': frame, 'cleaned': cleaned,
                'settings': settings, 'stabilization': stabilization, 'dt': dt, 'result': result, 'error': error,
                'info': info, 'start': start,
                'prepare_ms': (time.perf_counter() - start) * 1000}

    def render(self, job):
        """Stage 2: reuse the newest valid correction and finish the frame."""
        info = job['info']
        if 'output' in job:
            return job['output'], info
        original, frame, cleaned = job['original'], job['frame'], job['cleaned']
        settings, dt, result = job['settings'], job['dt'], job['result']
        # Sharpening layers from the full-resolution input (particles clamped,
        # noise reduced). Computed here: stage 1 carries the heavier work.
        job['detail'] = None if self.perf_level >= 2 else detail_layers(original, settings.ai_sharp)
        restore = settings.ai_restore * settings.strength
        if result is None:
            if settings.ai_restore > 0 and not job['error']:
                output = self.temporal.natural(frame, cleaned, settings.ai_color,
                                               settings.ai_contrast * settings.strength, dt)
                output = self.temporal.clarify(output, restore, dt)
                output = finish_ai(output, settings.ai_noise, 0., settings.ai_specks)
                info.update(ai_state='temporal', ai_reason='waiting',
                            processor='Restauração temporal • aguardando a IA')
                output = lift_change(original, frame, output)
                return self._stabilize(apply_detail(output, job['detail']), job), info
            return original.copy(), info
        transfer_start = time.perf_counter()
        target, state, age, confidence = transfer(cleaned, result, transfer_start,
                                                  settings.strength, self._coarse(result, dt),
                                                  return_delta=True)
        delta = self._ease(target, dt)
        if delta is not None:
            # A new analysis eases in over ~0.1 s and an expiring one fades
            # out, instead of popping (brightness jumps read as flashes).
            if state in ('expired', 'changed'):
                state = 'global'
            output = RovAI.apply(cleaned, delta, settings.strength)
            job['correction'] = delta
        else:
            output = cleaned
        info['transfer_ms'] = (time.perf_counter() - transfer_start) * 1000
        finish_start = time.perf_counter()
        if state in ('applied', 'global'):
            # Same look whether the network or only the temporal stage acted.
            output = self.temporal.natural(frame, output, settings.ai_color,
                                           settings.ai_contrast * settings.strength, dt)
            output = self.temporal.clarify(output, restore, dt)
            output = finish_ai(output, settings.ai_noise, 0., settings.ai_specks)
            output = lift_change(original, frame, output)
            # Fine detail finer than the working resolution gets the network's
            # contrast gain (affine correction), then the halo-free sharpening.
            if self.perf_level < 2:  # Economy 2+: no full-resolution detail work.
                output = detail_gain(output, original, job.get('correction'), settings.strength)
            output = apply_detail(output, job['detail'])
        elif settings.ai_restore > 0:
            info['ai_reason'] = state
            state = 'temporal'
            output = self.temporal.natural(frame, cleaned, settings.ai_color,
                                           settings.ai_contrast * settings.strength, dt)
            output = self.temporal.clarify(output, restore, dt)
            output = finish_ai(output, settings.ai_noise, 0., settings.ai_specks)
            output = lift_change(original, frame, output)
            output = apply_detail(output, job['detail'])
        else:
            output = original.copy()
        if state in ('applied', 'global', 'temporal'):
            output = self._stabilize(output, job)
        info['finish_ms'] = (time.perf_counter() - finish_start) * 1000
        info.update(ai_state=state, ai_ms=result.milliseconds, ai_age_ms=age * 1000,
                    ai_confidence=confidence,
                    processor='IA WaterNet • ' + '/'.join(result.providers) +
                              ' • ' + settings.quality + ' • vídeo fluido')
        return output, info

    def _coarse(self, result, dt):
        """Coarse correction smoothed over ~0.4 s: a new analysis changes the
        veil gradually instead of popping (stage 2 only, frames in order)."""
        target = coarse_map(result.delta)
        if self.coarse is None or self.coarse[1].shape != target.shape:
            self.coarse = (result.seq, target)
        else:
            blend = 1 - np.exp(-min(max(dt, .001), .25) / .4)
            self.coarse = (result.seq, self.coarse[1] + np.float32(blend) * (target - self.coarse[1]))
        return self.coarse[1]

    def _ease(self, target, dt, tau=.12):
        """Short exponential easing of the applied correction (stage 2, in
        order). Consecutive frames differ by a few pixels at most on the
        correction grid, and the correction itself is smooth, so no trail."""
        previous = getattr(self, 'applied', None)
        if target is None:
            if previous is None:
                return None
            target = np.zeros_like(previous)
        if previous is None or previous.shape != target.shape:
            self.applied = target
            return target
        blend = np.float32(1 - np.exp(-min(max(dt, .001), .25) / tau))
        self.applied = previous + blend * (target - previous)
        if float(np.abs(self.applied).max()) < .5:
            self.applied = None
        return self.applied

    def _stabilize(self, output, job):
        """Move the treated view by the shake correction (HUD moves with it)."""
        stabilization = job.get('stabilization')
        if stabilization is None:
            return output
        correction, width = stabilization
        if not np.any(np.abs(correction) > 1e-3):
            return output
        return self.stabilizer.warp(output, correction, width)

    def close(self):
        with self.condition:
            self.closed = True
            self.pending = None
            self.condition.notify()
        self.thread.join(timeout=2)
