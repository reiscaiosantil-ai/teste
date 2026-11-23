import queue
import sys
import threading

import numpy as np
import pytest

import capture_devices
import engine
from engine import Source


def drain(channel):
    items = []
    try:
        while True:
            items.append(channel.get_nowait())
    except queue.Empty:
        return items


def test_merge_maps_one_physical_device_to_both_backend_indices():
    dshow = [{"index": 0, "name": "Integrated Camera", "path": r"\\?\usb#vid_04f2&pid_b6be&mi_00#6&1#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\global"},
             {"index": 1, "name": "Game Capture HD60 X", "path": r"\\?\usb#vid_0fd9&pid_0082&mi_00#7&2#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\global"},
             {"index": 2, "name": "OBS Virtual Camera", "path": ""}]
    msmf = [{"index": 0, "name": "Game Capture HD60 X", "path": r"\\?\USB#VID_0FD9&PID_0082&MI_00#7&2#{e5323777-f976-4f5b-9b55-b94699c46e44}\GLOBAL"},
            {"index": 1, "name": "Integrated Camera", "path": r"\\?\usb#vid_04f2&pid_b6be&mi_00#6&1#{e5323777-f976-4f5b-9b55-b94699c46e44}\global"}]
    merged = capture_devices.merge_devices(dshow, msmf)
    by_name = {d["name"]: d for d in merged}
    assert by_name["Game Capture HD60 X"]["dshow_index"] == 1
    assert by_name["Game Capture HD60 X"]["msmf_index"] == 0  # Different numbering.
    assert by_name["Integrated Camera"]["msmf_index"] == 1
    assert by_name["OBS Virtual Camera"]["msmf_index"] is None
    assert by_name["Game Capture HD60 X"]["elgato"] and not by_name["Integrated Camera"]["elgato"]
    assert capture_devices.preferred_device(merged) == 1


def test_elgato_card_preferred_over_facecam_and_virtual_camera():
    devices = capture_devices.merge_devices(
        [{"index": 0, "name": "Elgato Virtual Camera"}, {"index": 1, "name": "Elgato Facecam"},
         {"index": 2, "name": "Cam Link 4K"}], [])
    assert [d["elgato_rank"] for d in devices] == [0, 1, 2]
    assert capture_devices.preferred_device(devices) == 2
    assert capture_devices.preferred_device(devices[:1]) is None
    assert capture_devices.elgato_rank("Game Capture 4K60 Pro MK.2") == 2


def test_fourcc_text():
    assert capture_devices.fourcc_text(0x32595559) == "YUY2"
    assert capture_devices.fourcc_text(0) == "?"
    assert capture_devices.fourcc_text(float("nan")) == "?"


def test_960x540_requests_a_native_capture_mode():
    assert engine.capture_request(Source(width=960, height=540))[:2] == (1920, 1080)
    assert engine.capture_request(Source(width=1280, height=720))[:2] == (1280, 720)


def test_attempts_by_name_use_each_backend_index(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    source = Source("capture", "1", "DirectShow", 1280, 720, device_name="Game Capture HD60 X",
                    dshow_index=1, msmf_index=0)
    attempts = engine.capture_attempts(source)
    assert attempts[0] == ("DirectShow", 1, (1280, 720, 30, "Auto"))
    assert ("DirectShow", 1, None) in attempts  # Native format retry.
    assert ("Media Foundation", 0, (1280, 720, 30, "Auto")) in attempts
    assert all(index != 1 for backend, index, _ in attempts if backend == "Media Foundation")


def test_manual_index_does_not_guess_other_backend_unless_automatic(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    manual = engine.capture_attempts(Source("capture", "2", "Media Foundation"))
    assert {backend for backend, _, _ in manual} == {"Media Foundation"}
    automatic = engine.capture_attempts(Source("capture", "2", "Automático"))
    assert {backend for backend, _, _ in automatic} == {"DirectShow", "Media Foundation"}


class FakeCap:
    def __init__(self, frames):
        self.frames = list(frames)
        self.released = False

    def read(self):
        if self.frames:
            return True, self.frames.pop(0)
        return False, None

    def get(self, prop):
        return 0.0

    def release(self):
        self.released = True


def test_open_falls_back_to_native_format_then_reports(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    frame = np.full((1080, 1920, 3), 90, np.uint8)
    calls = []

    def fake_open(index, backend, width=None, height=None, fps=None, fourcc=None):
        calls.append((backend, index, width))
        # The requested size gives no frames; the native format works.
        return FakeCap([] if width else [frame])

    monkeypatch.setattr(capture_devices, "open_device", fake_open)
    monkeypatch.setattr(engine, "first_frame", lambda cap, stop, seconds: cap.read()[1])
    messages = queue.Queue()
    source = Source("capture", "1", "DirectShow", 1280, 720, device_name="Game Capture HD60 S+",
                    dshow_index=1, msmf_index=0)
    cap, first, text = engine.open_capture(source, threading.Event(), messages)
    assert cap is not None and first is frame
    assert calls[:2] == [("DirectShow", 1, 1280), ("DirectShow", 1, None)]
    assert "Game Capture HD60 S+" in text and "1920×1080" in text and "1 tentativa" in text


def test_open_failure_explains_every_attempt(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(capture_devices, "open_device", lambda *a, **k: None)
    monkeypatch.setattr(capture_devices, "quick_hints",
                        lambda: ["Feche programas que podem estar usando a placa: OBS Studio (obs64.exe)."])
    source = Source("capture", "1", "DirectShow", device_name="Game Capture HD60 X",
                    dshow_index=1, msmf_index=0)
    cap, first, text = engine.open_capture(source, threading.Event(), queue.Queue())
    assert cap is None and first is None
    assert "DirectShow 1: não abriu" in text and "Media Foundation 0: não abriu" in text
    assert "OBS Studio" in text and "Diagnóstico" in text
    assert text.count("não abriu") == 2  # Formats are not retried on a device that never opens.


def test_black_and_frozen_input_warnings_and_recovery():
    channel = queue.Queue()
    signal = {"thumb": None, "changed": 0., "bright": 0., "warning": None}
    black = np.zeros((90, 160, 3), np.uint8)
    engine.watch_signal(signal, black, 2.5, channel)
    assert drain(channel)[-1][0] == "warning"
    lit = np.full((90, 160, 3), 120, np.uint8)
    engine.watch_signal(signal, lit, 2.6, channel)
    assert drain(channel)[-1] == ("clear", "")
    engine.watch_signal(signal, lit, 6.0, channel)
    kind, text = drain(channel)[-1]
    assert kind == "warning" and "CONGELADA" in text


def test_session_message_protocol_keeps_warnings_separate():
    class Stub:
        _drain_messages = engine.Session._drain_messages
    stub = Stub()
    stub.messages = queue.Queue()
    stub.message, stub.warning, stub.capture_info, stub.failure, stub.log = "", "", "", "", []
    for item in [("status", "Abrindo…"), ("info", "HD60 X • DirectShow índice 1"),
                 ("warning", "QUADROS PRETOS"), "texto antigo", ("clear", ""), ("fail", "Sinal perdido")]:
        stub.messages.put(item)
    stub._drain_messages()
    assert stub.capture_info == "HD60 X • DirectShow índice 1"
    assert stub.warning == "" and stub.failure == "Sinal perdido" and stub.message == "Sinal perdido"
    assert [kind for _, kind, _ in stub.log] == ["status", "info", "warning", "status", "fail"]


@pytest.mark.skipif(sys.platform == "win32", reason="Comportamento fora do Windows")
def test_listing_off_windows_is_empty_and_explained():
    result = capture_devices.list_devices()
    assert result["devices"] == [] and result["errors"]
    assert capture_devices.camera_privacy() == [] and capture_devices.running_conflicts() == []


def test_probe_isolated_process_reports_unopened_device():
    result = capture_devices.probe(19, "Automático", timeout=20)
    assert result["opened"] in (False, None)
    assert "índice 19" in capture_devices.summarize_probe(result)
