import os
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
from dataclasses import replace
import time
import cv2
import numpy as np
import pytest
from processing import Enhancer, Settings
from engine import Session, Source, fit_frame


def make_video(tmp_path, frames=60):
    path = str(tmp_path / "source.avi")
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 30, (320, 180))
    assert writer.isOpened()
    for i in range(frames):
        frame = np.full((180, 320, 3), (25, 60, 18), np.uint8)
        cv2.rectangle(frame, (i * 3 % 260, 70), (i * 3 % 260 + 30, 110), (180, 200, 160), -1)
        writer.write(frame)
    writer.release()
    return path


def test_bypass_exact_and_no_mutation():
    image = np.random.default_rng(2).integers(0, 256, (120, 160, 3), dtype=np.uint8)
    saved = image.copy()
    enhancer = Enhancer()
    for settings in [Settings(enabled=False), Settings(strength=0)]:
        assert np.array_equal(enhancer.process(image, settings), image)
    enhancer.process(image, Settings(haze=.6, denoise=True))
    assert np.array_equal(image, saved)


@pytest.mark.parametrize("level", [0, 1, 40, 255])
def test_extreme_frames_are_finite_and_bounded(level):
    frame = np.full((72, 128, 3), level, np.uint8)
    output = Enhancer().process(frame, Settings(haze=.6, exposure=2, denoise=True))
    assert output.shape == frame.shape
    assert output.dtype == np.uint8
    assert np.isfinite(output).all()
    if level == 0:
        assert output.max() <= 5  # No invented structures in a black image.


def test_resize_preserves_aspect_and_never_upscales():
    assert fit_frame(np.zeros((1080, 1920, 3), np.uint8), 640, 480).shape == (360, 640, 3)
    assert fit_frame(np.zeros((480, 640, 3), np.uint8), 1280, 720).shape == (480, 640, 3)


def test_synthetic_haze_reconstruction():
    # Known reference and additive veiling model; tests recovery, not just brightness.
    rng = np.random.default_rng(5)
    reference = np.zeros((180, 320, 3), np.uint8)
    for y in range(0, 180, 20):
        for x in range(0, 320, 20):
            reference[y:y+20, x:x+20] = rng.integers(0, 180, 3)
    air = np.array([170, 170, 150], np.float32)
    hazy = (reference.astype(np.float32) * .35 + air * .65).astype(np.uint8)
    output = Enhancer().process(hazy, Settings(color=0, contrast=1, exposure=0, haze=.8))
    before = np.mean((hazy.astype(float) - reference) ** 2)
    after = np.mean((output.astype(float) - reference) ** 2)
    assert after < before * .65


def test_dehaze_scene_cut_resets_estimation():
    first = np.full((120, 160, 3), (40, 80, 20), np.uint8)
    second = np.full((120, 160, 3), (180, 210, 150), np.uint8)
    enhancer = Enhancer()
    enhancer.process(first, Settings())
    switched = enhancer.process(second, Settings())
    fresh = Enhancer().process(second, Settings())
    assert np.array_equal(switched, fresh)


def test_guided_filter_preserves_constant_map():
    from processing import guided_filter
    guide = np.random.default_rng(3).random((60, 80), dtype=np.float32)
    result = guided_filter(guide, np.full_like(guide, .4))
    assert np.allclose(result, .4, atol=1e-5)


def wait_packet(session, timeout=8):
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        packet = session.snapshot()
        if packet:
            return packet
        time.sleep(.03)
    raise AssertionError(session.message)


def test_file_playback_latest_frame_and_shutdown(tmp_path):
    path = make_video(tmp_path, 90)
    session = Session(Source("file", path, width=320, height=180), Settings(enabled=False))
    try:
        packet = wait_packet(session)
        assert np.array_equal(packet["original"], packet["enhanced"])
        start = packet["seq"]
        time.sleep(.6)
        packet = session.snapshot()
        assert 5 < packet["seq"] - start < 35  # Realtime pacing, not full-speed decode.
        assert time.perf_counter() - packet["received"] < .6
    finally:
        session.close()
    assert not session.process.is_alive()
    assert not session.worker.is_alive()


def test_eof_and_reconnect(tmp_path):
    path = make_video(tmp_path, 12)
    for _ in range(2):
        session = Session(Source("file", path, width=320, height=180, loop=False))
        try:
            wait_packet(session)
            session.process.join(timeout=5)
            assert not session.process.is_alive()
            assert session.snapshot() is not None
        finally:
            session.close()


def test_missing_file_does_not_hang(tmp_path):
    session = Session(Source("file", str(tmp_path / "missing.mp4")))
    try:
        session.process.join(timeout=5)
        assert not session.process.is_alive()
        assert session.snapshot() is None
    finally:
        session.close()


def test_slow_filter_drops_old_frames(tmp_path, monkeypatch):
    original = Enhancer.process
    def slow(self, *args, **kwargs):
        time.sleep(.13)
        return original(self, *args, **kwargs)
    monkeypatch.setattr(Enhancer, "process", slow)
    session = Session(Source("file", make_video(tmp_path, 120), width=320, height=180))
    try:
        wait_packet(session)
        time.sleep(1)
        packet = session.snapshot()
        assert packet["skipped"] > 8
        assert time.perf_counter() - packet["received"] < .6
    finally:
        session.close()


def stalled_capture(*args):
    time.sleep(60)


def test_stalled_driver_can_be_stopped(monkeypatch):
    import engine
    monkeypatch.setattr(engine, "capture_worker", stalled_capture)
    session = Session(Source())
    started = time.perf_counter()
    session.close()
    assert time.perf_counter() - started < 3
    assert not session.process.is_alive()


def test_interface_controls_and_stale_frame(tmp_path):
    from PySide6.QtWidgets import QApplication
    from app import Window
    app = QApplication.instance() or QApplication([])
    window = Window()
    assert window.resolution.currentText() == "960 × 540"
    assert window.haze.value() == 80
    window.profile.setCurrentIndex(1)
    assert window.haze.value() == 95
    window.profile.setCurrentIndex(0)
    window.kind.setCurrentIndex(1)
    window.path.setText(make_video(tmp_path))
    window.connect_source()
    try:
        packet = wait_packet(window.session)
        window.refresh()
        assert window.original.image is not None
        window.hold_original(True)
        assert window.enhanced.title == "REFERÊNCIA • original"
        window.hold_original(False)
        window.enabled.setChecked(False)
        assert window.session.settings.enabled is False
        window.change_view(1)
        assert window.original.isHidden()
        window.session.capture_stop.set()
        window.session.process.join(timeout=5)
        time.sleep(1)
        window.refresh()
        assert window.original.image is None
        assert not window.snapshot_btn.isEnabled()
    finally:
        window.close()
        app.processEvents()
