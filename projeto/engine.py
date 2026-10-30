"""Capture in a terminable process; single shared frame, no frame queue."""
from dataclasses import dataclass
import multiprocessing as mp
import os
import queue
import sys
import threading
import time

import cv2
import numpy as np
from processing import Enhancer, Settings
from live_ai import LiveAI

MAX_BYTES = 1920 * 1080 * 3


@dataclass(frozen=True)
class Source:
    kind: str = "capture"
    value: str = "0"
    backend: str = "DirectShow"
    width: int = 1280
    height: int = 720
    fps: int = 30
    fourcc: str = "Auto"
    loop: bool = True


def fit_frame(frame, width, height):
    h, w = frame.shape[:2]
    scale = min(width / w, height / h, 1.0)
    if scale < 1:
        frame = cv2.resize(frame, (max(1, round(w * scale)), max(1, round(h * scale))),
                           interpolation=cv2.INTER_AREA)
    return np.ascontiguousarray(frame)


def _status(channel, text):
    try:
        channel.put_nowait(text)
    except queue.Full:
        pass


def capture_worker(source, buffer, metadata, lock, stop, messages):
    # Driver hangs are isolated here. Parent can terminate this process.
    os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
    cv2.setNumThreads(2)
    try:
        cv2.setLogLevel(0)  # A stream URL can contain credentials.
    except AttributeError:
        pass
    cap = None
    try:
        if source.kind == "capture":
            api = cv2.CAP_ANY
            if sys.platform == "win32":
                api = {"DirectShow": cv2.CAP_DSHOW, "Media Foundation": cv2.CAP_MSMF,
                       "Automático": cv2.CAP_ANY}.get(source.backend, cv2.CAP_ANY)
            cap = cv2.VideoCapture(int(source.value), api)
            if source.fourcc != "Auto":
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*source.fourcc))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, source.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, source.height)
            cap.set(cv2.CAP_PROP_FPS, source.fps)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Some drivers ignore this.
        elif source.kind == "stream":
            cap = cv2.VideoCapture(source.value, cv2.CAP_FFMPEG,
                [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000])
        else:
            cap = cv2.VideoCapture(source.value)
        if not cap.isOpened():
            _status(messages, "Não foi possível abrir a fonte. Confira índice, driver e conexão.")
            return
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not np.isfinite(fps) or not 1 <= fps <= 240:
            fps = source.fps
        _status(messages, "Fonte aberta. Aguardando quadros…")
        array = np.frombuffer(buffer, dtype=np.uint8)
        origin, first_pts, last_pts = time.perf_counter(), None, None
        sequence, file_index = 0, 0
        while not stop.is_set():
            ok, frame = cap.read()
            received = time.perf_counter()
            if not ok or frame is None:
                if source.kind == "file" and source.loop and file_index:
                    if not cap.set(cv2.CAP_PROP_POS_FRAMES, 0):
                        _status(messages, "Não foi possível reiniciar o arquivo.")
                        break
                    origin, first_pts, last_pts, file_index = time.perf_counter(), None, None, 0
                    continue
                _status(messages, "Fim do arquivo." if source.kind == "file" else
                        "Sinal perdido. Confira a conexão e clique em Reconectar.")
                break
            if source.kind == "file":
                pts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
                if first_pts is None:
                    first_pts = pts if np.isfinite(pts) else 0
                if np.isfinite(pts) and (last_pts is None or pts > last_pts):
                    offset = max(0, pts - first_pts)
                else:
                    offset = file_index / fps
                last_pts = pts
                if stop.wait(max(0, origin + offset - time.perf_counter())):
                    break
                received = time.perf_counter()
                file_index += 1
            source_h, source_w = frame.shape[:2]
            frame = fit_frame(frame, source.width, source.height)
            sequence += 1
            if lock.acquire(timeout=0.03):
                try:
                    array[:frame.size] = frame.ravel()
                    metadata[:] = (sequence, received, frame.shape[0], frame.shape[1], source_h, source_w)
                finally:
                    lock.release()
    except Exception:
        _status(messages, "Falha na captura. Verifique a fonte e tente outro backend.")
    finally:
        if cap is not None:
            cap.release()
        messages.cancel_join_thread()


class Session:
    def __init__(self, source, settings=Settings()):
        context = mp.get_context("spawn")
        self.source = source
        self.settings = settings
        self.buffer = context.RawArray("B", MAX_BYTES)
        self.metadata = context.RawArray("d", 6)
        self.frame_lock = context.Lock()
        self.capture_stop = context.Event()
        self.messages = context.Queue(maxsize=16)
        self.stop_event = threading.Event()
        self.output_lock = threading.Lock()
        self.output = None
        self._capture_health = (0, 0.0)
        self.message = "Conectando…"
        self.started = time.perf_counter()
        self.process = context.Process(target=capture_worker,
            args=(source, self.buffer, self.metadata, self.frame_lock, self.capture_stop, self.messages),
            daemon=True)
        self.live_ai = LiveAI()
        self._live_active = False
        self.worker = threading.Thread(target=self._process, daemon=True)
        self.process.start()
        self.worker.start()

    def _process(self):
        enhancer = Enhancer()
        previous, processed, skipped = 0, 0, 0
        last_time, window = time.perf_counter(), time.perf_counter()
        fps = 0.0
        while not self.stop_event.is_set():
            try:
                while True:
                    self.message = self.messages.get_nowait()
            except queue.Empty:
                pass
            packet = None
            if self.frame_lock.acquire(timeout=0.02):
                try:
                    seq, received, h, w, source_h, source_w = self.metadata[:]
                    if seq > previous:
                        frame = np.frombuffer(self.buffer, dtype=np.uint8, count=int(h * w * 3)).copy().reshape(int(h), int(w), 3)
                        packet = (int(seq), received, frame, int(source_w), int(source_h))
                finally:
                    self.frame_lock.release()
            if packet is None:
                self.stop_event.wait(0.003)
                continue
            seq, received, frame, source_w, source_h = packet
            skipped += max(0, seq - previous - 1)
            previous = seq
            start = time.perf_counter()
            if start - last_time > 1:
                enhancer.reset()
            filter_error = False
            settings = self.settings
            live_info = {}
            try:
                active = (settings.enabled and settings.strength > 0 and
                          settings.mode == 'ai' and settings.ai_realtime)
                if active:
                    self._live_active = True
                    enhanced, live_info = self.live_ai.process(frame, settings, seq, received)
                    filter_error = live_info['filter_error']
                    enhancer.status = live_info['processor']
                else:
                    if self._live_active:
                        self.live_ai.reset()
                        self._live_active = False
                    enhanced = enhancer.process(frame, settings, start - last_time)
            except Exception:
                self.message = "Erro no tratamento. Imagem original preservada; reinicie a sessão."
                enhanced = frame.copy()
                filter_error = True
            processing_ms = (time.perf_counter() - start) * 1000
            last_time = start
            processed += 1
            elapsed = time.perf_counter() - window
            if elapsed >= 0.5:
                fps, processed, window = processed / elapsed, 0, time.perf_counter()
            with self.output_lock:
                self.output = {"seq": seq, "received": received, "original": frame,
                    "enhanced": enhanced, "processing_ms": processing_ms, "fps": fps,
                    "skipped": skipped, "source_size": (source_w, source_h), "filter_error": filter_error, "mode": settings.mode, "enabled": settings.enabled, "processor": enhancer.status, **live_info}

    def capture_health(self):
        """Read capture progress independently of the enhancement worker."""
        if self.frame_lock.acquire(timeout=0.002):
            try:
                self._capture_health = (int(self.metadata[0]), float(self.metadata[1]))
            finally:
                self.frame_lock.release()
        return self._capture_health

    def snapshot(self):
        with self.output_lock:
            return self.output

    def close(self):
        self.stop_event.set()
        self.capture_stop.set()
        self.worker.join(timeout=2)
        self.live_ai.close()
        self.process.join(timeout=0.2)
        if self.process.is_alive():
            self.process.terminate()
            self.process.join(timeout=0.5)
        if self.process.is_alive():
            self.process.kill()
            self.process.join(timeout=0.5)
        self.messages.close()
        self.messages.cancel_join_thread()
