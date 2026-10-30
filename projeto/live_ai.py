"""Latest-only inference and motion-checked transfer of color corrections.

The displayed pixels always come from the current camera frame. Only the
bounded low-frequency correction is reused; no scene pixels are synthesized.
"""
from dataclasses import dataclass
import threading
import time

import cv2
import numpy as np

from rov_ai import RovAI
from processing import finish_ai
from temporal_restore import TemporalRestorer, working_frame, lift_change, limit_added_chroma


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


def transfer(frame, correction, now, strength):
    """Return current-frame restoration, state, correction age and confidence."""
    age = max(0., now - correction.received)
    max_age = min(2., max(.9, correction.milliseconds / 1000 * 3 + .15))
    if age > max_age:
        return frame.copy(), 'expired', age, 0.
    guide = correction.guide
    gh, gw = guide.shape[:2]
    fw = min(128, gw)
    fh = max(8, round(gh * fw / gw))
    base = cv2.resize(guide, (fw, fh), interpolation=cv2.INTER_AREA)
    current = cv2.resize(frame, (fw, fh), interpolation=cv2.INTER_AREA)
    base_gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    current_gray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
    # Backward flow samples the analysis correction at each current location.
    flow = cv2.calcOpticalFlowFarneback(current_gray, base_gray, None,
                                      .5, 2, 15, 2, 5, 1.1, 0)
    yy, xx = np.mgrid[:fh, :fw].astype(np.float32)
    mx, my = xx + flow[:, :, 0], yy + flow[:, :, 1]
    inside = (mx >= 0) & (mx <= fw - 1) & (my >= 0) & (my <= fh - 1)
    matched = cv2.remap(base, mx, my, cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_REPLICATE)
    error = np.abs(current.astype(np.float32) - matched).mean(axis=2)
    confidence = np.clip((38. - error) / 24., 0., 1.) * inside
    fraction = float(np.mean(confidence > .5))
    if fraction < .45 or float(error.mean()) > 32:
        return frame.copy(), 'changed', age, fraction
    confidence = cv2.GaussianBlur(confidence, (3, 3), .65)
    confidence *= min(1., max(0., (max_age - age) / .2))
    # Keep the full detailed correction grid; flow is estimated on a small guide.
    full_flow = cv2.resize(flow, (gw, gh), interpolation=cv2.INTER_LINEAR)
    fy, fx = np.mgrid[:gh, :gw].astype(np.float32)
    fx += full_flow[:, :, 0] * gw / fw
    fy += full_flow[:, :, 1] * gh / fh
    warped = cv2.remap(correction.delta, fx, fy, cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_REPLICATE)
    warped *= cv2.resize(confidence, (gw, gh), interpolation=cv2.INTER_LINEAR)[:, :, None]
    return RovAI.apply(frame, warped, strength), 'applied', age, fraction


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
                                    ms, tuple(model.providers))
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
        now = time.perf_counter()
        key = (settings.quality, settings.backend, settings.device_id)
        original = frame
        frame = working_frame(frame)
        if not np.any(frame):
            self.reset()
            return original.copy(), {'ai_state':'black', 'ai_ms':0., 'ai_age_ms':0.,
                'ai_fps':self.analysis_fps, 'filter_error':False,
                'processor':'Quadro preto • original preservado'}
        thumb = cv2.resize(frame, (64, 36), interpolation=cv2.INTER_AREA)
        cut = (self.previous_thumb is not None and
               float(cv2.absdiff(thumb, self.previous_thumb).mean()) > 35)
        if key != self.key or cut:
            self.reset()
        self.previous_thumb = thumb
        dt = 1 / 30 if self.last_received is None else received - self.last_received
        self.last_received = received
        clean_start = time.perf_counter()
        cleaned = self.temporal.clean(frame, settings.ai_restore, dt)
        clean_ms = (time.perf_counter() - clean_start) * 1000
        with self.condition:
            self.key = key
            # Avoid filling the CPU with analyses faster than the display needs.
            if now - self.last_submit >= 1 / 15 or self.result is None:
                self.pending = (self.epoch, key, seq, received, cleaned)
                self.last_submit = now
                self.condition.notify()
            result, error = self.result, self.error
        info = {'ai_state': 'waiting', 'ai_ms': 0., 'ai_age_ms': 0.,
                'ai_fps': self.analysis_fps, 'filter_error': bool(error),
                'processor': error or 'IA inicializando • original enquanto aguarda',
                'work_size': (frame.shape[1], frame.shape[0]), 'temporal_ms': clean_ms}
        if result is None:
            if settings.ai_restore > 0 and not error:
                output = self.temporal.clarify(cleaned, settings.ai_restore * settings.strength, dt)
                output = finish_ai(output, settings.ai_noise, settings.ai_sharp, settings.ai_specks)
                info.update(ai_state='temporal', ai_reason='waiting',
                            processor='Restauração temporal • aguardando a IA')
                return lift_change(original, frame, output), info
            return original.copy(), info
        transfer_start = time.perf_counter()
        output, state, age, confidence = transfer(cleaned, result, now, settings.strength)
        info['transfer_ms'] = (time.perf_counter() - transfer_start) * 1000
        finish_start = time.perf_counter()
        if state == 'applied':
            output = limit_added_chroma(frame, output, settings.ai_restore * settings.strength)
            output = self.temporal.clarify(output, settings.ai_restore * settings.strength, dt)
            output = finish_ai(output, settings.ai_noise, settings.ai_sharp,
                               settings.ai_specks)
            output = lift_change(original, frame, output)
        elif settings.ai_restore > 0:
            info['ai_reason'] = state
            state = 'temporal'
            output = self.temporal.clarify(cleaned, settings.ai_restore * settings.strength, dt)
            output = finish_ai(output, settings.ai_noise, settings.ai_sharp, settings.ai_specks)
            output = lift_change(original, frame, output)
        else:
            output = original.copy()
        info['finish_ms'] = (time.perf_counter() - finish_start) * 1000
        info.update(ai_state=state, ai_ms=result.milliseconds, ai_age_ms=age * 1000,
                    ai_confidence=confidence,
                    processor='IA WaterNet • ' + '/'.join(result.providers) +
                              ' • ' + settings.quality + ' • vídeo fluido')
        return output, info

    def close(self):
        with self.condition:
            self.closed = True
            self.pending = None
            self.condition.notify()
        self.thread.join(timeout=2)
