import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
from types import SimpleNamespace
import threading
import numpy as np
import pytest
from PySide6.QtWidgets import QApplication
from app import Window
from engine import Session

@pytest.fixture
def window():
    qt = QApplication.instance() or QApplication([])
    w = Window()
    w.timer.stop()
    yield w
    w.session = None
    w.close()

class FakeSession:
    def __init__(self, packet, received=99.99):
        self.packet = packet
        self.received = received
        self.started = 0
        self.source = SimpleNamespace(kind='file')
        self.process = SimpleNamespace(is_alive=lambda: True)
        self.message = 'Fonte aberta'
    def snapshot(self): return self.packet
    def capture_health(self): return 100, self.received
    def close(self): raise AssertionError('Active capture must not be closed')

def frame(seq=1, received=99.9):
    f = np.full((32, 48, 3), 100, np.uint8)
    return dict(seq=seq, received=received, original=f, enhanced=f.copy(),
                processing_ms=100, fps=10, skipped=0, source_size=(48,32),
                processor='CPUExecutionProvider', mode='ai', enabled=True)

def test_slow_ai_preserves_pair_with_visible_warning_and_recovers(window, monkeypatch):
    monkeypatch.setattr('app.time.perf_counter', lambda: 100)
    window.session = FakeSession(frame())
    window.refresh()
    window.session.packet = frame(2, 98)
    window.refresh()
    assert window.original.image is not None and window.enhanced.image is not None
    assert 'IMAGEM ATRASADA' in window.enhanced.overlay
    assert 'CAPTURA ATIVA' in window.status.text()
    assert not window.snapshot_btn.isEnabled()
    window.session.packet = frame(3)
    window.refresh()
    assert not window.original.overlay and window.snapshot_btn.isEnabled()

def test_actual_capture_loss_removes_images_and_same_packet_can_be_restored(window, monkeypatch):
    monkeypatch.setattr('app.time.perf_counter', lambda: 100)
    window.session = FakeSession(frame())
    window.refresh()
    window.session.received = 98
    window.refresh()
    assert window.original.image is None and window.current is None
    window.session.received = 99.99
    window.refresh()
    assert window.original.image is not None

def test_first_inference_loading_does_not_close_active_capture(window, monkeypatch):
    monkeypatch.setattr('app.time.perf_counter', lambda: 100)
    window.session = FakeSession(None)
    window.refresh()
    assert window.session is not None and 'Captura ativa' in window.status.text()

def test_capture_heartbeat_works_without_inference_worker():
    s = Session.__new__(Session)
    s.frame_lock = threading.Lock()
    s.metadata = [42, 99.99, 0, 0, 0, 0]
    s._capture_health = (0, 0.)
    assert s.capture_health() == (42, 99.99)
    s.frame_lock.acquire()
    try:
        assert s.capture_health() == (42, 99.99)
    finally:
        s.frame_lock.release()
