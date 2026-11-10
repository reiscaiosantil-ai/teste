"""0.3.9: longer particle history, full-resolution denoise, stabilization, auto Visual."""
import math
import time

import cv2
import numpy as np

from auto_visual import AutoVisual, measure, targets
from processing import Settings
from stabilize import Stabilizer
from temporal_restore import TemporalRestorer, robust_reference


def test_robust_reference_ignores_one_bright_observation():
    base = np.full((4, 4, 3), 100, np.uint8)
    spot = base.copy()
    spot[1, 1] = 220  # A slow particle still visible in one earlier frame.
    reference, spread = robust_reference([base, spot, base + 2, base + 1])
    assert abs(int(reference[1, 1, 0]) - 101) <= 1
    assert int(spread.max()) <= 2
    reference, spread = robust_reference([base, spot, base])
    assert int(reference[1, 1, 0]) == 100 and int(spread.max()) == 0
    reference, spread = robust_reference([base, spot])  # two: plain mean, wide spread
    assert int(spread[1, 1, 0]) == 120


def pan_sequence(frames=6, noise=4, seed=2):
    rng = np.random.default_rng(seed)
    big = cv2.GaussianBlur(rng.integers(30, 220, (420, 760, 3), dtype=np.uint8), (0, 0), 4)
    truths, noisy = [], []
    for t in range(frames):
        truth = big[30:390, 2 * t + 20:2 * t + 660].copy()
        truths.append(truth)
        noisy.append(cv2.add(truth, rng.normal(0, noise, truth.shape).astype(np.int16), dtype=cv2.CV_8U))
    return truths, noisy


def test_full_resolution_denoise_reduces_noise_without_trails():
    truths, noisy = pan_sequence()
    restorer = TemporalRestorer()
    errors_in, errors_out = [], []
    for truth, frame in zip(truths, noisy):
        restorer.clean(frame, .35, 1 / 30)
        out = restorer.denoise(frame, .3)
        region = (slice(60, -50), slice(40, -40))
        errors_in.append(np.mean((frame[region].astype(float) - truth[region]) ** 2))
        errors_out.append(np.mean((out[region].astype(float) - truth[region]) ** 2))
    assert np.mean(errors_out[2:]) < np.mean(errors_in[2:]) * .8
    # HUD bands are never mixed in time.
    assert np.array_equal(out[:40], frame[:40])
    # A sudden change (moving object) is not averaged with the past.
    moved = noisy[-1].copy()
    cv2.rectangle(moved, (300, 150), (360, 210), (250, 250, 250), -1)
    restorer.clean(moved, .35, 1 / 30)
    out = restorer.denoise(moved, .3)
    assert np.array_equal(out[160:200, 310:350], moved[160:200, 310:350])


def test_stabilizer_removes_shake_but_follows_pan():
    rng = np.random.default_rng(3)
    big = cv2.GaussianBlur(rng.integers(0, 255, (700, 1300, 3), dtype=np.uint8), (0, 0), 2)
    stab = Stabilizer()
    corrections = []
    for t in range(60):
        shake = (6 * math.sin(t * 1.7), 5 * math.cos(t * 2.3))
        x, y = int(100 + 3 * t + shake[0]), int(100 + shake[1])
        frame = big[y:y + 360, x:x + 640].copy()
        corrections.append(stab.update(frame, 1 / 30))
    corrections = np.array(corrections[10:])
    # Corrections oppose the shake and stay bounded by the margin (pan followed).
    limit = stab.margin * min(stab.width, 640)
    assert np.abs(corrections[:, 0]).max() <= limit + 1e-6
    assert np.std(corrections[:, 0]) > 1.5
    out = stab.warp(frame, corrections[-1], 320)
    assert out.shape == frame.shape
    keep = np.zeros(frame.shape[:2], np.uint8)
    keep[:30] = 1
    assert np.array_equal(stab.warp(frame, corrections[-1], 320, keep)[:30], frame[:30])


def test_auto_visual_reacts_to_veil_and_noise_smoothly():
    rng = np.random.default_rng(4)
    clear = cv2.GaussianBlur(rng.integers(0, 255, (360, 640, 3), dtype=np.uint8), (0, 0), 3)
    clear = cv2.normalize(clear, None, 10, 245, cv2.NORM_MINMAX)
    hazy = cv2.addWeighted(clear, .3, np.full_like(clear, 140), .7, 0)
    noisy = cv2.add(clear, rng.normal(0, 10, clear.shape).astype(np.int16), dtype=cv2.CV_8U)
    t_clear, t_hazy, t_noisy = (targets(*measure(f)) for f in (clear, hazy, noisy))
    assert t_hazy['ai_contrast'] > t_clear['ai_contrast'] + .1
    assert t_noisy['ai_sharp'] < t_clear['ai_sharp'] and t_noisy['ai_noise'] > t_clear['ai_noise']
    auto = AutoVisual()
    s = Settings(mode='ai', ai_auto=True)
    first = auto.apply(s, clear, 1 / 30)
    second = auto.apply(s, hazy, 1 / 30)
    # Smoothed: one frame moves only a little toward the new scene.
    assert first.ai_contrast < second.ai_contrast < t_hazy['ai_contrast'] - .1
    assert 'Auto:' in auto.summary()
    off = Settings(mode='ai', ai_auto=False, ai_contrast=.5)
    assert auto.apply(off, hazy, 1 / 30) is off


def test_live_pipeline_with_auto_and_stabilization_runs():
    from live_ai import LiveAI
    _, frames = pan_sequence(frames=12)
    live = LiveAI()
    settings = Settings(True, .8, mode='ai', quality='fast', backend='cpu', ai_noise=.3,
                        ai_sharp=.15, ai_realtime=True, ai_restore=.35, ai_auto=True, stabilize=1.)
    try:
        for i, frame in enumerate(frames * 3):
            out, info = live.process(frame, settings, i + 1, time.perf_counter())
            time.sleep(.03)
        assert out.shape == frame.shape and info['ai_state'] in ('applied', 'temporal')
        assert info['auto'].startswith('Auto:')
    finally:
        live.close()
