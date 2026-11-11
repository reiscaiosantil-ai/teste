"""Capture in a terminable process; single shared frame, no frame queue."""
from dataclasses import dataclass
import multiprocessing as mp
import os
import queue
import sys
import threading
import time

# Media Foundation hardware transforms make some capture cards (Elgato
# included) open very slowly or fail; must be set before importing cv2.
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
import cv2
import numpy as np
from processing import Enhancer, Settings
from live_ai import LiveAI
import capture_devices
from performance import Governor, LEVEL_TEXT

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
    # Filled when the device was chosen by name: index of the same physical
    # device in each OpenCV backend (their numbering can differ). -1 = unknown.
    device_name: str = ""
    dshow_index: int = -1
    msmf_index: int = -1


def fit_frame(frame, width, height):
    h, w = frame.shape[:2]
    scale = min(width / w, height / h, 1.0)
    if scale < 1:
        frame = cv2.resize(frame, (max(1, round(w * scale)), max(1, round(h * scale))),
                           interpolation=cv2.INTER_AREA)
    return np.ascontiguousarray(frame)


def _status(channel, text, kind="status"):
    """kind: status, warning (shown while video runs), clear, info, fail."""
    try:
        channel.put_nowait((kind, text))
    except queue.Full:
        pass


BACKENDS = ("DirectShow", "Media Foundation")


def capture_request(source):
    """Format asked from the driver. 960 × 540 is rarely a native capture mode
    (Elgato and most UVC cards), so ask 1080p and reduce it in this process."""
    width, height = source.width, source.height
    if (width, height) == (960, 540):
        width, height = 1920, 1080
    return width, height, source.fps, source.fourcc


def capture_attempts(source):
    """Ordered (backend, index, request) attempts; request None = native format."""
    request = capture_request(source)
    manual = int(source.value)
    if sys.platform != "win32":
        return [("Automático", manual, request), ("Automático", manual, None)]
    indices = {"DirectShow": source.dshow_index, "Media Foundation": source.msmf_index}
    chosen = source.backend if source.backend in indices else "DirectShow"
    named = bool(source.device_name)
    if indices[chosen] < 0:
        indices[chosen] = manual
    order = [chosen] + [backend for backend in BACKENDS if backend != chosen]
    attempts = []
    for backend in order:
        index = indices[backend]
        if index < 0:
            # A numeric index means different devices in different backends;
            # only guess the same number when the user chose Automático.
            if named or source.backend != "Automático":
                continue
            index = manual
        attempts.append((backend, index, request))
        attempts.append((backend, index, None))
        if backend == "DirectShow" and source.fourcc == "Auto":
            # HDR/10-bit or unusual default subtypes may not convert to BGR.
            attempts.append((backend, index, (None, None, None, "YUY2")))
    return attempts


def describe_request(request):
    if request is None:
        return "formato nativo"
    width, height, fps, fourcc = request
    size = f"{width}×{height}@{fps}" if width else "tamanho nativo"
    return size + ("" if not fourcc or fourcc == "Auto" else f" {fourcc}")


def first_frame(cap, stop, seconds):
    """Poll for the first frame; some drivers return False until streaming."""
    deadline = time.perf_counter() + seconds
    while not stop.is_set() and time.perf_counter() < deadline:
        ok, frame = cap.read()
        if ok and frame is not None and frame.size:
            return frame
        stop.wait(0.05)
    return None


def open_capture(source, stop, messages):
    """Try each backend/format until one delivers a frame. Returns
    (cap, first_frame, description) or (None, None, failure_text)."""
    label = source.device_name or f"índice {source.value}"
    tried, unopened = [], set()
    for backend, index, request in capture_attempts(source):
        if stop.is_set():
            break
        if (backend, index) in unopened:
            continue  # Opening does not depend on the requested format.
        _status(messages, f"Abrindo {label} • {backend} índice {index} • {describe_request(request)}…")
        args = request or (None, None, None, None)
        try:
            cap = capture_devices.open_device(index, backend, *args)
        except Exception as exc:
            tried.append(f"{backend} {index} ({describe_request(request)}): erro {type(exc).__name__}")
            continue
        if cap is None:
            tried.append(f"{backend} {index}: não abriu")
            unopened.add((backend, index))
            continue
        frame = first_frame(cap, stop, 6.0)
        if frame is not None:
            fourcc = capture_devices.fourcc_text(cap.get(cv2.CAP_PROP_FOURCC))
            reported = cap.get(cv2.CAP_PROP_FPS)
            text = (f"{label} • {backend} índice {index} • {frame.shape[1]}×{frame.shape[0]}"
                    f"{' ' + fourcc if fourcc != '?' else ''}"
                    f"{f' • {reported:.0f} FPS informados' if np.isfinite(reported) and reported > 0 else ''}")
            if tried:
                text += " • após " + str(len(tried)) + " tentativa(s)"
            return cap, frame, text
        cap.release()
        tried.append(f"{backend} {index} ({describe_request(request)}): abriu, sem quadros em 6 s")
    hints = []
    try:
        hints = capture_devices.quick_hints()
    except Exception:
        pass
    if not any("abriu" in item for item in tried):
        hints.append("Nenhum backend abriu o dispositivo: confira se a placa aparece na lista "
                     "(Atualizar lista), o driver da Elgato e o cabo/porta USB 3.")
    else:
        hints.append("A placa abriu mas não entregou imagem: confira o sinal HDMI de entrada "
                     "(fonte ligada, resolução 1080p/720p, sem HDCP) e teste outro formato.")
    text = ("Não foi possível abrir a fonte (" + label + "). Tentativas: " + "; ".join(tried) +
            ". " + " ".join(hints) + " Use Diagnóstico da captura para um relatório completo.")
    return None, None, text


# metadata: sequence, received, h, w, source_h, source_w, position_s, duration_s
METADATA = 8
# control (files only): seek target in seconds (-1 = none), paused flag
SEEK, PAUSED = 0, 1


def capture_worker(source, buffer, metadata, lock, stop, messages, control=None):
    # Driver hangs are isolated here. Parent can terminate this process.
    os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
    cv2.setNumThreads(2)
    try:
        cv2.setLogLevel(0)  # A stream URL can contain credentials.
    except AttributeError:
        pass
    cap = None
    pending = None
    try:
        if source.kind == "capture":
            cap, pending, text = open_capture(source, stop, messages)
            if cap is None:
                if not stop.is_set():
                    _status(messages, text, "fail")
                return
            _status(messages, text, "info")
        elif source.kind == "stream":
            cap = cv2.VideoCapture(source.value, cv2.CAP_FFMPEG,
                [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000])
        else:
            cap = cv2.VideoCapture(source.value)
        if not cap.isOpened():
            _status(messages, "Não foi possível abrir a fonte. Confira endereço, arquivo e conexão.", "fail")
            return
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not np.isfinite(fps) or not 1 <= fps <= 240:
            fps = source.fps
        _status(messages, "Fonte aberta. Aguardando quadros…")
        array = np.frombuffer(buffer, dtype=np.uint8)
        origin, first_pts, last_pts = time.perf_counter(), None, None
        sequence, file_index = 0, 0
        is_file = source.kind == "file"
        count = cap.get(cv2.CAP_PROP_FRAME_COUNT) if is_file else 0
        duration = count / fps if np.isfinite(count) and count > 0 else 0.
        metadata[7] = duration
        # Timeline (files): position of the shown frame; pause re-sends it so
        # the display stays alive and settings can be compared on a still.
        held, position, base, step = None, 0., 0., False
        signal = {"thumb": None, "changed": time.perf_counter(), "bright": time.perf_counter(),
                  "warning": None}
        while not stop.is_set():
            if is_file and control is not None:
                target = control[SEEK]
                if target >= 0:
                    control[SEEK] = -1.
                    target = min(max(0., target), max(0., duration - 1 / fps)) if duration else max(0., target)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(target * fps)))
                    origin, first_pts, last_pts, file_index = time.perf_counter(), None, None, 0
                    base, step = target, True
                elif control[PAUSED] and held is not None and not step:
                    if stop.wait(1 / fps):
                        break
                    # Same frame, new timestamp: paused is not a lost signal.
                    origin, first_pts, last_pts, file_index = time.perf_counter(), None, None, 0
                    base = position
                    sequence += 1
                    publish(array, metadata, lock, held[0], sequence,
                            time.perf_counter(), held[1], held[2], position)
                    continue
            if pending is not None:
                ok, frame, pending = True, pending, None
            else:
                ok, frame = cap.read()
            received = time.perf_counter()
            if not ok or frame is None:
                if source.kind == "file" and source.loop and file_index:
                    if not cap.set(cv2.CAP_PROP_POS_FRAMES, 0):
                        _status(messages, "Não foi possível reiniciar o arquivo.", "fail")
                        break
                    origin, first_pts, last_pts, file_index = time.perf_counter(), None, None, 0
                    base = 0.
                    continue
                _status(messages, "Fim do arquivo." if source.kind == "file" else
                        "Sinal perdido. Confira a conexão e clique em Reconectar.", "fail")
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
                position = base + offset
                if not step and stop.wait(max(0, origin + offset - time.perf_counter())):
                    break
                step = False
                received = time.perf_counter()
                file_index += 1
            elif sequence % 10 == 0:
                watch_signal(signal, frame, received, messages)
            source_h, source_w = frame.shape[:2]
            frame = fit_frame(frame, source.width, source.height)
            sequence += 1
            if is_file:
                held = (frame, source_h, source_w)
            publish(array, metadata, lock, frame, sequence, received, source_h, source_w, position)
    except Exception as exc:
        _status(messages, "Falha na captura (" + type(exc).__name__ +
                "). Verifique a fonte e tente outro backend.", "fail")
    finally:
        if cap is not None:
            cap.release()
        messages.cancel_join_thread()


def publish(array, metadata, lock, frame, sequence, received, source_h, source_w, position=0.):
    if lock.acquire(timeout=0.03):
        try:
            array[:frame.size] = frame.ravel()
            metadata[:7] = (sequence, received, frame.shape[0], frame.shape[1],
                            source_h, source_w, position)
        finally:
            lock.release()


def watch_signal(signal, frame, now, messages):
    """Warn about black or frozen input; new timestamps alone prove nothing."""
    thumb = cv2.resize(frame, (32, 18), interpolation=cv2.INTER_AREA)
    if signal["thumb"] is None or float(cv2.absdiff(thumb, signal["thumb"]).max()) > 2:
        signal["changed"] = now
    if float(thumb.mean()) >= 3:
        signal["bright"] = now
    signal["thumb"] = thumb
    warning = None
    if now - signal["bright"] > 2:
        warning = ("QUADROS PRETOS da placa há mais de 2 s: confira se a fonte HDMI está "
                   "ligada, a resolução de saída (1080p/720p) e se o sinal tem HDCP.")
    elif now - signal["changed"] > 3:
        warning = ("IMAGEM CONGELADA: a placa entrega quadros idênticos há mais de 3 s. "
                   "Confira o sinal de entrada ou reconecte.")
    if warning != signal["warning"]:
        signal["warning"] = warning
        _status(messages, warning or "", "warning" if warning else "clear")


class Session:
    def __init__(self, source, settings=Settings()):
        context = mp.get_context("spawn")
        self.source = source
        self.settings = settings
        self.buffer = context.RawArray("B", MAX_BYTES)
        self.metadata = context.RawArray("d", METADATA)
        self.control = context.RawArray("d", [-1., 0.])
        self.frame_lock = context.Lock()
        self.capture_stop = context.Event()
        self.messages = context.Queue(maxsize=16)
        self.stop_event = threading.Event()
        self.output_lock = threading.Lock()
        self.output = None
        self._capture_health = (0, 0.0)
        self.message = "Conectando…"
        self.warning = ""
        self.capture_info = ""
        self.failure = ""
        self.log = []
        self.started = time.perf_counter()
        self.process = context.Process(target=capture_worker,
            args=(source, self.buffer, self.metadata, self.frame_lock, self.capture_stop, self.messages,
                  self.control),
            daemon=True)
        self.live_ai = LiveAI()
        self._live_active = False
        # Two-stage live pipeline: stage 1 keeps frame-order state (temporal
        # fusion, AI submission); stage 2 finishes frames. One slot between
        # them, replaced by the newest job: never a queue that builds delay.
        self._render_condition = threading.Condition()
        self._render_job = None
        self._published_seq = 0
        self._rate = {"count": 0, "window": time.perf_counter(), "fps": 0.0}
        self.governor = Governor()
        self.worker = threading.Thread(target=self._process, name="ROV-estagio1", daemon=True)
        self.renderer = threading.Thread(target=self._render, name="ROV-estagio2", daemon=True)
        self.process.start()
        self.worker.start()
        self.renderer.start()

    def _publish(self, seq, received, frame, enhanced, processing_ms, skipped,
                 source_size, filter_error, settings, processor, info):
        now = time.perf_counter()
        with self.output_lock:
            if seq <= self._published_seq:
                return  # A slower job finished after a newer frame was shown.
            self._published_seq = seq
            # Economy level follows how many source frames are being skipped.
            level = self.governor.update(now, seq)
            self.live_ai.perf_level = level
            rate = self._rate
            rate["count"] += 1
            elapsed = now - rate["window"]
            if elapsed >= 0.5:
                rate["fps"], rate["count"], rate["window"] = rate["count"] / elapsed, 0, now
            self.output = {"seq": seq, "received": received, "original": frame,
                "enhanced": enhanced, "processing_ms": processing_ms, "fps": rate["fps"],
                "latency_ms": (now - received) * 1000,
                "skipped": skipped, "source_size": source_size, "filter_error": filter_error,
                "mode": settings.mode, "enabled": settings.enabled, "processor": processor,
                "perf_level": level, "perf_text": LEVEL_TEXT[level],
                "drop_ratio": self.governor.drop, **info}

    def _render(self):
        while True:
            with self._render_condition:
                self._render_condition.wait_for(
                    lambda: self.stop_event.is_set() or self._render_job is not None)
                if self.stop_event.is_set():
                    return
                job, self._render_job = self._render_job, None
            seq, received, frame, skipped, source_size, prepared = job
            start = time.perf_counter()
            filter_error = False
            try:
                enhanced, info = self.live_ai.render(prepared)
                filter_error = info["filter_error"]
            except Exception:
                self.message = "Erro no tratamento. Imagem original preservada; reinicie a sessão."
                enhanced, info, filter_error = frame.copy(), dict(prepared.get("info", {})), True
            render_ms = (time.perf_counter() - start) * 1000
            info = {**info, "prepare_ms": prepared.get("prepare_ms", 0.0), "render_ms": render_ms}
            self._publish(seq, received, frame, enhanced,
                          info["prepare_ms"] + render_ms, skipped, source_size,
                          filter_error, prepared["settings"] if "settings" in prepared else self.settings,
                          info.get("processor", ""), info)

    def _process(self):
        enhancer = Enhancer()
        previous, skipped = 0, 0
        last_time = time.perf_counter()
        while not self.stop_event.is_set():
            self._drain_messages()
            packet = None
            if self.frame_lock.acquire(timeout=0.02):
                try:
                    seq, received, h, w, source_h, source_w = self.metadata[:6]
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
            try:
                active = (settings.enabled and settings.strength > 0 and
                          settings.mode == 'ai' and settings.ai_realtime)
                if active:
                    self._live_active = True
                    prepared = self.live_ai.prepare(frame, settings, seq, received)
                    prepared.setdefault("settings", settings)
                    with self._render_condition:
                        self._render_job = (seq, received, frame, skipped,
                                            (source_w, source_h), prepared)
                        self._render_condition.notify()
                    last_time = start
                    continue
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
            self._publish(seq, received, frame, enhanced, processing_ms, skipped,
                          (source_w, source_h), filter_error, settings, enhancer.status, {})

    def _drain_messages(self):
        try:
            while True:
                item = self.messages.get_nowait()
                kind, text = item if isinstance(item, tuple) else ("status", item)
                if text:
                    self.log.append((time.time(), kind, text))
                    del self.log[:-200]
                if kind == "warning":
                    self.warning = text
                elif kind == "clear":
                    self.warning = ""
                elif kind == "info":
                    self.capture_info = text
                    self.message = "Fonte aberta: " + text
                else:
                    self.message = text
                    if kind == "fail":
                        self.failure = text
        except (queue.Empty, OSError, ValueError):
            pass

    def capture_health(self):
        """Read capture progress independently of the enhancement worker."""
        if self.frame_lock.acquire(timeout=0.002):
            try:
                self._capture_health = (int(self.metadata[0]), float(self.metadata[1]))
            finally:
                self.frame_lock.release()
        return self._capture_health

    # ---- Timeline (video files only)
    def timeline(self):
        """(position_s, duration_s) of the frame last delivered by the file."""
        return float(self.metadata[6]), float(self.metadata[7])

    def seek(self, seconds):
        self.control[SEEK] = max(0., float(seconds))

    def set_paused(self, paused):
        self.control[PAUSED] = 1. if paused else 0.

    @property
    def paused(self):
        return bool(self.control[PAUSED])

    def snapshot(self):
        with self.output_lock:
            return self.output

    def close(self):
        self.stop_event.set()
        self.capture_stop.set()
        with self._render_condition:
            self._render_condition.notify_all()
        self.worker.join(timeout=2)
        self.renderer.join(timeout=2)
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
