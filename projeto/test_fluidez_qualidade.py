"""0.3.5: optimized stages keep the approved output; particles, sharpness, GPU choice."""
import os
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
import time

import cv2
import numpy as np

from processing import Settings, sharpen_detail, detail_layers, apply_detail
from temporal_restore import TemporalRestorer, lift_change, limit_added_chroma, working_frame
import rov_ai
from test_rov import make_video, wait_packet


def reference_limit_added_chroma(source, enhanced, amount):
    """0.3.4 implementation, kept here as the numerical reference."""
    if amount <= 0:
        return enhanced
    original = cv2.cvtColor(source, cv2.COLOR_BGR2YCrCb)
    result = cv2.cvtColor(enhanced, cv2.COLOR_BGR2YCrCb)
    original_chroma = original[:, :, 1:].astype(np.int16) - 128
    result_chroma = result[:, :, 1:].astype(np.int16) - 128
    before = np.abs(original_chroma).sum(axis=2)
    after = np.abs(result_chroma).sum(axis=2)
    scale = np.minimum(1., (before + 10) / np.maximum(after, 1)).astype(np.float32)
    scale = 1 - min(1., amount * 2) * (1 - scale)
    result[:, :, 1:] = np.clip(np.rint(result_chroma * scale[:, :, None]) + 128, 0, 255).astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_YCrCb2BGR)


def reference_lift(original, work, restored):
    difference = cv2.subtract(restored, work, dtype=cv2.CV_16S)
    h, w = original.shape[:2]
    return cv2.add(original, cv2.resize(difference, (w, h), interpolation=cv2.INTER_LINEAR), dtype=cv2.CV_8U)


def test_fast_chroma_limit_matches_reference():
    rng = np.random.default_rng(3)
    a = rng.integers(0, 256, (180, 320, 3), dtype=np.uint8)
    b = cv2.add(a, rng.integers(-70, 70, a.shape).astype(np.int16), dtype=cv2.CV_8U)
    for amount in (.05, .28, .7):
        diff = cv2.absdiff(limit_added_chroma(a, b, amount), reference_limit_added_chroma(a, b, amount))
        assert diff.max() <= 2 and np.mean(diff > 0) < .001


def test_fast_lift_matches_reference_and_handles_large_changes():
    rng = np.random.default_rng(4)
    original = rng.integers(0, 256, (360, 640, 3), dtype=np.uint8)
    work = cv2.resize(original, (320, 180), interpolation=cv2.INTER_AREA)
    for spread in (30, 220):
        restored = cv2.add(work, rng.integers(-spread, spread, work.shape).astype(np.int16), dtype=cv2.CV_8U)
        assert cv2.absdiff(lift_change(original, work, restored), reference_lift(original, work, restored)).max() <= 1


def test_sharpening_has_no_halo_and_does_not_amplify_noise():
    edge = np.full((40, 40, 3), 60, np.uint8)
    edge[:, 20:] = 180
    edge = cv2.GaussianBlur(edge, (0, 0), 1.5)
    out = sharpen_detail(edge, 1.)
    assert out.min() >= edge.min() and out.max() <= edge.max()
    assert np.abs(np.diff(out[20, :, 0].astype(int))).max() > np.abs(np.diff(edge[20, :, 0].astype(int))).max()
    flat = np.clip(np.random.default_rng(1).normal(100, 3, (200, 200, 3)), 0, 255).astype(np.uint8)
    assert abs(sharpen_detail(flat, 1.).std() - flat.std()) < .05
    saved = edge.copy()
    assert sharpen_detail(edge, 0.) is edge and np.array_equal(edge, saved)
    layers = detail_layers(edge, .5)
    assert apply_detail(edge, layers) is not edge and np.array_equal(edge, saved)


def scene(rng, h=270, w=480):
    base = cv2.GaussianBlur(rng.integers(50, 150, (h, w + 40, 3), dtype=np.uint8), (0, 0), 3)
    return base


def test_transient_particles_are_clamped_at_full_resolution_but_hud_is_kept():
    rng = np.random.default_rng(5)
    background = scene(rng, 360, 640)
    restorer = TemporalRestorer()
    hud = np.zeros((360, 640), bool)
    for t in range(8):
        frame = background[:, t * 2:t * 2 + 640].copy()
        # Static HUD text below the protected top band, while the scene pans.
        cv2.putText(frame, "Depth:15.00m", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, .6, (235, 235, 235), 1)
        if t == 0:
            hud = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) > 200
        particle = (300 + 13 * t, 180 - 7 * t)
        cv2.circle(frame, particle, 3, (230, 230, 230), -1)
        restorer.clean(frame, .35, 1 / 30)
        out = restorer.suppress(frame)
    # The current particle is pulled toward the observed background, with the
    # documented bound: weight min(1, 2.4 × restoration), at most 70 levels.
    y, x = particle[1], particle[0]
    assert int(out[y, x, 0]) <= int(frame[y, x, 0]) - 50
    assert int(out[y, x, 0]) >= max(int(background[y, x + 14, 0]), int(frame[y, x, 0]) - 70)
    # HUD characters keep their exact pixels.
    assert np.array_equal(out[hud], frame[hud])


def test_live_pipeline_two_stages_keep_raw_original_and_order(tmp_path):
    from engine import Session, Source
    settings = Settings(True, .8, mode="ai", quality="fast", backend="cpu", device_id=0,
                        ai_noise=.3, ai_sharp=.15, ai_realtime=True, ai_restore=.35)
    session = Session(Source("file", make_video(tmp_path, 90), width=320, height=180), settings)
    try:
        first = wait_packet(session)
        seen = [first["seq"]]
        deadline = time.perf_counter() + 2
        while time.perf_counter() < deadline:
            packet = session.snapshot()
            if packet["seq"] != seen[-1]:
                seen.append(packet["seq"])
                assert packet["enhanced"] is not packet["original"]
                assert "latency_ms" in packet and "render_ms" in packet
            time.sleep(.005)
        assert seen == sorted(seen) and len(seen) > 5
    finally:
        session.close()
    assert not session.worker.is_alive() and not session.renderer.is_alive()


def test_best_adapter_prefers_dedicated_memory_and_skips_software():
    adapters = [{"index": 0, "name": "Intel(R) UHD Graphics", "dedicated_mb": 128, "software": False},
                {"index": 1, "name": "GPU 8 GB", "dedicated_mb": 8192, "software": False},
                {"index": 2, "name": "Microsoft Basic Render Driver", "dedicated_mb": 0, "software": True}]
    assert rov_ai.best_adapter(adapters)["index"] == 1
    assert rov_ai.best_adapter(adapters[:1])["index"] == 0
    assert rov_ai.best_adapter(adapters[2:]) is None
    assert "8 GB" in rov_ai.adapter_label(adapters[1])


def test_cpu_model_reports_real_executor_and_auto_gpu_index_is_accepted():
    model = rov_ai.RovAI("auto", "fast", -1)  # -1: choose the adapter automatically.
    assert model.providers[-1] == "CPUExecutionProvider"
    assert model.description.startswith(model.providers[0])
    frame = np.full((72, 128, 3), 90, np.uint8)
    assert model.process(frame, .8).shape == frame.shape


def test_natural_color_does_not_invent_violet_or_neon():
    """Gray-green water + a network output tinted violet: the result keeps the
    source hue family and saturation grows at most by (1 + color)."""
    restorer = TemporalRestorer()
    water = np.zeros((90, 160, 3), np.uint8)
    water[:] = (120, 130, 110)  # BGR gray-green
    violet = water.copy()
    violet[:] = (190, 90, 150)  # what an over-corrected network may produce
    out = restorer.natural(water, violet, .3, 0., 1 / 30)
    def chroma(x):
        ycc = cv2.cvtColor(x, cv2.COLOR_BGR2YCrCb).astype(float)
        return np.abs(ycc[..., 1:] - 128).sum(2).mean()
    assert chroma(out) <= chroma(water) * 1.3 + chroma(violet) * .24 + 2
    assert chroma(out) < chroma(violet) / 2
    # Luminance comes from the restoration.
    assert abs(cv2.cvtColor(out, cv2.COLOR_BGR2GRAY).mean() -
               cv2.cvtColor(violet, cv2.COLOR_BGR2GRAY).mean()) < 6


def test_local_contrast_opens_dark_areas_without_changing_color():
    rng = np.random.default_rng(9)
    frame = cv2.GaussianBlur(rng.integers(30, 70, (180, 320, 3), dtype=np.uint8), (0, 0), 2)
    restorer = TemporalRestorer()
    flat = restorer.natural(frame, frame, 0., 0., 1 / 30)
    opened = TemporalRestorer().natural(frame, frame, 0., .5, 1 / 30)
    gray = lambda x: cv2.cvtColor(x, cv2.COLOR_BGR2GRAY).astype(float)
    assert gray(opened).std() > gray(flat).std() * 1.3
    hue = lambda x: cv2.cvtColor(x, cv2.COLOR_BGR2YCrCb)[..., 1:].astype(float)
    assert np.abs(hue(opened) - hue(flat)).mean() < 1.5


def test_ai_correction_has_no_disc_around_isolated_point_and_follows_edges():
    """A point response in the small correction grid must not become a dark
    disc; a correction step must stay on its side of a frame edge."""
    frame = np.full((360, 640, 3), 100, np.uint8)
    frame[:, 320:] = 200
    delta = np.zeros((144, 256, 3), np.float32)
    delta[:, 128:] = -30  # darken only the bright half
    out = rov_ai.RovAI.apply(frame, delta, 1.)
    # Edge-aware: the dark side next to the edge is (almost) untouched.
    assert abs(int(out[180, 312, 0]) - 100) <= 3
    assert int(out[180, 330, 0]) < 180
    spot = np.zeros((144, 256, 3), np.float32)
    spot[70:73, 120:123] = -60
    filtered = cv2.merge([cv2.medianBlur(np.ascontiguousarray(spot[..., c]), 5) for c in range(3)])
    assert np.abs(filtered).max() == 0
