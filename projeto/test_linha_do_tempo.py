"""0.3.8: timeline for video files — seek, pause (frame kept alive), GUI visibility."""
import os
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
import time

from engine import Session, Source
from processing import Settings
from test_rov import make_video


def wait(condition, seconds=8):
    deadline = time.perf_counter() + seconds
    while time.perf_counter() < deadline:
        if condition():
            return True
        time.sleep(.02)
    return False


def test_seek_pause_and_resume(tmp_path):
    session = Session(Source("file", make_video(tmp_path, 300), width=320, height=180),
                      Settings(enabled=False))
    try:
        assert wait(lambda: session.timeline()[1] > 0)
        assert abs(session.timeline()[1] - 10) < .2  # 300 frames at 30 FPS
        session.seek(6.0)
        assert wait(lambda: 5.8 <= session.timeline()[0] <= 7.5)
        session.set_paused(True)
        time.sleep(.2)
        held = session.timeline()[0]
        seq = session.capture_health()[0]
        time.sleep(.5)
        # Paused: same position, but frames keep arriving (no "lost signal").
        assert session.timeline()[0] == held
        assert session.capture_health()[0] > seq
        assert time.perf_counter() - session.capture_health()[1] < .3
        session.seek(2.0)  # Seeking while paused shows the new frame.
        assert wait(lambda: 1.8 <= session.timeline()[0] <= 2.3)
        session.set_paused(False)
        assert wait(lambda: session.timeline()[0] > 2.6)
    finally:
        session.close()


def test_timeline_only_for_video_files(tmp_path):
    from PySide6.QtWidgets import QApplication
    import app as A
    qt = QApplication.instance() or QApplication([])
    w = A.Window()
    w.timer.stop()
    try:
        w.show()
        w.update_timeline()
        assert not w.timeline.isVisible()
        w.kind.setCurrentIndex(1)
        w.path.setText(make_video(tmp_path, 120))
        w.connect_source()
        assert wait(lambda: (w.refresh(), qt.processEvents(), w.seek_bar.maximum() > 0)[-1])
        assert w.timeline.isVisible() and abs(w.seek_bar.maximum() - 4000) < 100
        w.toggle_play()
        assert w.session.paused and w.play_btn.text().startswith("▶")
        w.seek_bar.setValue(3000)
        w.commit_seek()
        assert wait(lambda: abs(w.session.timeline()[0] - 3) < .3)
        w.disconnect()
        assert not w.timeline.isVisible()
    finally:
        w.close()
