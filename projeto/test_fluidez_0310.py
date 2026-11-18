"""0.3.10: no white flashes during motion; automatic economy level for fluid video."""
import time

import numpy as np

from performance import Governor, MAX_LEVEL
from processing import Settings
from test_visao_039 import pan_sequence


def feed(governor, start, seconds, step, fps=30.):
    """Simulate shown frames: `step` source frames per shown frame."""
    now, seq = start, 0
    while now < start + seconds:
        seq += step
        now += step / fps
        level = governor.update(now, seq)
    return level, now


def test_governor_raises_when_skipping_and_lowers_with_backoff():
    g = Governor()
    level, now = feed(g, 0., 6., 2)          # Showing half the frames: jerky.
    assert level == MAX_LEVEL
    level, now = feed(g, now, 5., 1)          # Keeping up again: try one level lower.
    assert level == MAX_LEVEL - 1
    hold = g.hold_lower
    level, now = feed(g, now, 2., 2)          # The probe failed quickly: back up...
    assert level == MAX_LEVEL and g.hold_lower == hold * 2   # ...and wait longer next time.
    level, now = feed(g, now, hold * 2 - 1, 1)
    assert level == MAX_LEVEL                 # Still waiting (no flip-flop).


def test_live_ai_respects_economy_levels():
    from live_ai import LiveAI
    _, frames = pan_sequence(frames=6)
    live = LiveAI()
    s = Settings(True, .8, mode='ai', quality='fast', backend='cpu', ai_noise=.3,
                 ai_sharp=.3, ai_realtime=True, ai_restore=.35)
    try:
        live.perf_level = 3
        job = live.prepare(frames[0], s, 1, time.perf_counter())
        assert job['info']['work_size'] == (512, 288)
        live.perf_level = 2
        job = live.prepare(frames[1], s, 2, time.perf_counter())
        live.render(job)
        assert job['detail'] is None and live.temporal.previous_full is None
        live.perf_level = 0
        job = live.prepare(frames[2], s, 3, time.perf_counter())
        live.render(job)
        assert job['info']['work_size'] == (640, 360) and job['detail'] is not None
    finally:
        live.close()


def test_correction_eases_in_and_fades_out_instead_of_popping():
    from live_ai import LiveAI
    live = LiveAI()
    try:
        target = np.full((144, 256, 3), 20, np.float32)
        first = live._ease(target, 1 / 30).copy()          # First correction: direct.
        assert np.allclose(first, 20)
        new = np.full_like(target, -20)
        step = live._ease(new, 1 / 30)
        assert -20 < float(step.mean()) < 15                # A new analysis eases in.
        values = []
        for _ in range(40):
            eased = live._ease(None, 1 / 30)
            values.append(0. if eased is None else float(np.abs(eased).mean()))
        assert live.applied is None                          # Expired: faded out to zero...
        assert values[0] > 1 and all(b <= a + 1e-6 for a, b in zip(values, values[1:]))  # ...gradually.
    finally:
        live.close()


def test_late_analysis_keeps_matching_detail():
    """IA atrasada (1 s): a correção detalhada continua onde corresponde."""
    import cv2
    from live_ai import Correction, transfer
    rng = np.random.default_rng(3)
    f = cv2.GaussianBlur(rng.integers(40, 160, (72, 128, 3), dtype=np.uint8), (5, 5), 1)
    detail = np.zeros(f.shape, np.float32)
    detail[:, :64] = 25          # A sharp left/right difference: not in the coarse map.
    c = Correction(0, ('detail', 'cpu', 0), 1, 10., detail, f.copy(), 77, ('test',))
    out, state, _, _ = transfer(f, c, 11.0, 1.)          # 1 s old, budget 0.5 s.
    change = out.astype(int) - f.astype(int)
    assert state == 'global'
    assert change[:, 10:50].mean() > 15 and change[:, 80:120].mean() < 6


def test_economy_levels_4_and_5_lighten_temporal_fusion_but_keep_it_working():
    import cv2
    from live_ai import LiveAI
    from temporal_restore import TemporalRestorer
    truths, noisy = pan_sequence(frames=8)
    for economy, size in [(1, (216, 384)), (2, (180, 320))]:
        restorer = TemporalRestorer()
        restorer.economy = economy
        for frame in noisy:
            out = restorer.clean(frame, .35, 1 / 30)
        assert restorer.previous.shape[:2] == size          # Lighter internal size.
        assert out.shape == frame.shape
        assert restorer.metrics['temporal_fraction'] > .3    # Fusion still active.
    live = LiveAI()
    try:
        s = Settings(True, .8, mode='ai', quality='fast', backend='cpu', ai_restore=.35, ai_realtime=True)
        for level, economy in [(3, 0), (4, 1), (5, 2)]:
            live.perf_level = level
            live.render(live.prepare(noisy[0], s, level, time.perf_counter()))
            assert live.temporal.economy == economy
    finally:
        live.close()


def test_extra_economy_levels_are_opt_in_and_resize_keeps_luminance_levels():
    import cv2
    from temporal_restore import TemporalRestorer
    g = Governor()
    g.max_level = 3                       # Default in the app (0.3.10 behaviour).
    level, now = feed(g, 0., 8., 2)
    assert level == 3
    g.max_level = 5
    level, now = feed(g, now, 4., 2)
    assert level > 3
    g.max_level = 3                       # Unticked while above: comes back down.
    level, now = feed(g, now, .5, 2)
    assert level == 3
    assert Settings().perf_max == 3
    _, noisy = pan_sequence(frames=6)
    noisy = [cv2.normalize(f, None, 10, 245, cv2.NORM_MINMAX) for f in noisy]
    r = TemporalRestorer()
    for frame in noisy[:4]:
        r.clarify(r.clean(frame, .35, 1 / 30), .35, 1 / 30)
    levels = r.levels.copy()
    r.economy = 2                         # Internal size changes: fusion restarts...
    r.clean(noisy[4], .35, 1 / 30)
    assert r.levels is not None and np.allclose(r.levels, levels)   # ...levels kept.


def test_gui_extra_economy_checkbox_off_by_default():
    import os
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    from PySide6.QtWidgets import QApplication
    import app as A
    qt = QApplication.instance() or QApplication([])
    w = A.Window()
    w.timer.stop()
    try:
        assert w.settings().perf_max == 3
        w.perf_extra.setChecked(True)
        assert w.settings().perf_max == 5
    finally:
        w.close()
