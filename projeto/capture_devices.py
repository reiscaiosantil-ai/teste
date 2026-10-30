"""Discovery and diagnosis of capture devices (Elgato and others) on Windows.

Offline and without extra dependencies: DirectShow and Media Foundation are
enumerated through COM with ctypes, in the same order OpenCV uses for the
numeric index of each backend. Everything that touches drivers runs in a
separate, terminable process, because a driver can hang or crash the caller.

Uso direto (gera um relatório para enviar ao suporte):
    runtime\\python.exe -u app\\capture_devices.py --diagnostico
"""
import ctypes
import datetime
import json
import multiprocessing as mp
import os
import platform
import queue
import subprocess
import sys
import time
import uuid
from pathlib import Path

os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
os.environ.setdefault("OPENCV_LOG_LEVEL", "SILENT")

WINDOWS = sys.platform == "win32"
# Capture-card names (HD60 S/S+/X, 4K60 Pro/S+, 4K X/S, Cam Link, Neo...).
CARD_WORDS = ("game capture", "cam link", "camlink", "4k60", "hd60", "4k x", "4k s",
              "4k pro", "capture neo", "elgato capture", "elgato video capture")
ELGATO_WORDS = ("elgato",) + CARD_WORDS
ELGATO_USB_VENDOR = "VID_0FD9"
# Programs that commonly keep a capture card open in exclusive mode.
CONFLICTING_APPS = {
    "4kcaptureutility": "Elgato 4K Capture Utility",
    "gamecapture": "Elgato Game Capture HD",
    "elgatostudio": "Elgato Studio",
    "camera hub": "Elgato Camera Hub",
    "camerahub": "Elgato Camera Hub",
    "obs64": "OBS Studio", "obs32": "OBS Studio",
    "streamlabs": "Streamlabs", "xsplit": "XSplit", "vmix": "vMix",
    "wirecast": "Wirecast", "windowscamera": "Câmera do Windows",
    "ms-teams": "Microsoft Teams", "teams": "Microsoft Teams", "zoom": "Zoom",
    "skype": "Skype", "amcap": "AMCap",
}
CM_ERRORS = {
    1: "dispositivo não configurado corretamente", 3: "driver corrompido ou sem memória",
    10: "o dispositivo não pôde iniciar", 18: "reinstale o driver",
    22: "dispositivo desativado no Gerenciador de Dispositivos",
    24: "dispositivo ausente ou com falha", 28: "driver não instalado",
    31: "driver não carregou", 39: "driver corrompido ou ausente",
    43: "o dispositivo relatou um problema (código 43)", 45: "dispositivo desconectado",
    52: "assinatura do driver não verificada",
}


def elgato_rank(name):
    """2 = Elgato capture card, 1 = other Elgato video device (Facecam),
    0 = not Elgato. Virtual cameras (Camera Hub) never count as the card."""
    text = (name or "").lower()
    if "virtual" in text:
        return 0
    if any(word in text for word in CARD_WORDS):
        return 2
    return 1 if "elgato" in text else 0


def is_elgato(name):
    return elgato_rank(name) > 0


# --------------------------------------------------------------------------
# COM enumeration (Windows only). Called only inside a child process.

def _guid(text):
    class GUID(ctypes.Structure):
        _fields_ = [("data", ctypes.c_ubyte * 16)]
    value = GUID()
    ctypes.memmove(value.data, uuid.UUID(text).bytes_le, 16)
    return value


def _vcall(pointer, index, argtypes, *args):
    """Call method `index` of a COM interface; returns the HRESULT as int."""
    table = ctypes.cast(pointer, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))[0]
    prototype = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, *argtypes)
    return prototype(table[index])(pointer, *args)


def _release(pointer):
    if pointer:
        _vcall(pointer, 2, ())


def _enum_directshow():
    """Same enumeration and order as OpenCV's CAP_DSHOW numeric index."""
    class VARIANT(ctypes.Structure):
        _fields_ = [("vt", ctypes.c_ushort), ("r1", ctypes.c_ushort), ("r2", ctypes.c_ushort),
                    ("r3", ctypes.c_ushort), ("value", ctypes.c_void_p), ("extra", ctypes.c_void_p)]
    ole32, oleaut32 = ctypes.windll.ole32, ctypes.windll.oleaut32
    void_pp = ctypes.POINTER(ctypes.c_void_p)
    clsid_enum = _guid("62BE5D10-60EB-11d0-BD3B-00A0C911CE86")
    iid_create = _guid("29840822-5B84-11D0-BD3B-00A0C911CE86")
    video_category = _guid("860BB310-5D01-11d0-BD3B-00A0C911CE86")
    iid_bag = _guid("55272A00-42CB-11CE-8135-00AA004BB851")
    devices = []
    creator, monikers = ctypes.c_void_p(), ctypes.c_void_p()
    if ole32.CoCreateInstance(ctypes.byref(clsid_enum), None, 1, ctypes.byref(iid_create),
                              ctypes.byref(creator)) < 0:
        raise OSError("CoCreateInstance(SystemDeviceEnum) falhou")
    try:
        hr = _vcall(creator, 3, (ctypes.c_void_p, void_pp, ctypes.c_ulong),
                    ctypes.byref(video_category), ctypes.byref(monikers), 0)
        if hr != 0 or not monikers:  # S_FALSE: category is empty.
            return devices
        index = 0
        while True:
            moniker, fetched = ctypes.c_void_p(), ctypes.c_ulong()
            if _vcall(monikers, 3, (ctypes.c_ulong, void_pp, ctypes.POINTER(ctypes.c_ulong)),
                      1, ctypes.byref(moniker), ctypes.byref(fetched)) != 0 or not fetched.value:
                break
            entry = {"index": index}
            bag = ctypes.c_void_p()
            try:
                # IMoniker::BindToStorage is method 9.
                if _vcall(moniker, 9, (ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, void_pp),
                          None, None, ctypes.byref(iid_bag), ctypes.byref(bag)) >= 0 and bag:
                    for prop, key in (("FriendlyName", "name"), ("DevicePath", "path"),
                                      ("Description", "description")):
                        variant = VARIANT()
                        if _vcall(bag, 3, (ctypes.c_wchar_p, ctypes.POINTER(VARIANT), ctypes.c_void_p),
                                  prop, ctypes.byref(variant), None) >= 0 and variant.vt == 8:
                            entry[key] = ctypes.wstring_at(variant.value)
                        oleaut32.VariantClear(ctypes.byref(variant))
            finally:
                _release(bag)
                _release(moniker)
            devices.append(entry)
            index += 1
    finally:
        _release(monikers)
        _release(creator)
    return devices


def _enum_media_foundation():
    """Same enumeration and order as OpenCV's CAP_MSMF numeric index."""
    mfplat, mf, ole32 = ctypes.windll.mfplat, ctypes.windll.mf, ctypes.windll.ole32
    void_pp = ctypes.POINTER(ctypes.c_void_p)
    source_type = _guid("c60ac5fe-252a-478f-a0ef-bc8fa5f7cad3")
    vidcap = _guid("8ac3587a-4ae7-42d8-99e0-0a6013eef90f")
    friendly = _guid("60d0e559-52f8-4fa2-bbce-acdb34a8ec01")
    link = _guid("58f0aad8-22bf-4f8a-bb3d-d2c4978c6e2f")
    if mfplat.MFStartup(0x00020070, 0) < 0:
        raise OSError("MFStartup falhou")
    devices = []
    attributes, array, count = ctypes.c_void_p(), ctypes.c_void_p(), ctypes.c_uint32()
    try:
        if mfplat.MFCreateAttributes(ctypes.byref(attributes), 1) < 0:
            raise OSError("MFCreateAttributes falhou")
        # IMFAttributes::SetGUID is method 24.
        _vcall(attributes, 24, (ctypes.c_void_p, ctypes.c_void_p),
               ctypes.byref(source_type), ctypes.byref(vidcap))
        if mf.MFEnumDeviceSources(attributes, ctypes.byref(array), ctypes.byref(count)) < 0:
            raise OSError("MFEnumDeviceSources falhou")
        activates = ctypes.cast(array, void_pp)
        for index in range(count.value):
            activate = ctypes.c_void_p(activates[index])
            entry = {"index": index}
            for key, guid in (("name", friendly), ("path", link)):
                text, length = ctypes.c_wchar_p(), ctypes.c_uint32()
                # IMFAttributes::GetAllocatedString is method 13.
                if _vcall(activate, 13, (ctypes.c_void_p, ctypes.POINTER(ctypes.c_wchar_p),
                                         ctypes.POINTER(ctypes.c_uint32)),
                          ctypes.byref(guid), ctypes.byref(text), ctypes.byref(length)) >= 0:
                    entry[key] = text.value
                    ole32.CoTaskMemFree(text)
            _release(activate)
            devices.append(entry)
    finally:
        if array:
            ole32.CoTaskMemFree(array)
        _release(attributes)
        mfplat.MFShutdown()
    return devices


def _normal_path(path):
    """DirectShow and MF symbolic links of one USB device differ in case/suffix."""
    text = (path or "").lower()
    if "#{" in text:
        text = text[:text.index("#{")]
    return text.replace("\\\\?\\", "")


def merge_devices(dshow, msmf):
    """One entry per physical device with its index in each OpenCV backend."""
    merged = []
    for item in dshow:
        merged.append({"name": item.get("name") or f"Dispositivo {item['index']}",
                       "dshow_index": item["index"], "msmf_index": None,
                       "path": item.get("path", ""), "description": item.get("description", "")})
    for item in msmf:
        key = _normal_path(item.get("path"))
        match = next((d for d in merged if d["msmf_index"] is None and
                      ((key and _normal_path(d["path"]) == key) or
                       (not key and d["name"] == item.get("name")))), None)
        if match is None:
            match = next((d for d in merged if d["msmf_index"] is None and
                          d["name"] == item.get("name")), None)
        if match is None:
            merged.append({"name": item.get("name") or f"Dispositivo MF {item['index']}",
                           "dshow_index": None, "msmf_index": item["index"],
                           "path": item.get("path", ""), "description": ""})
        else:
            match["msmf_index"] = item["index"]
    for device in merged:
        rank = elgato_rank(device["name"])
        if not rank and ELGATO_USB_VENDOR.lower() in device["path"].lower() \
                and "virtual" not in device["name"].lower():
            rank = 1
        device["elgato_rank"] = rank
        device["elgato"] = rank > 0
    return merged


def preferred_device(devices):
    """Index of the Elgato capture card to select by default, or None."""
    ranked = [(d.get("elgato_rank", 0), -i) for i, d in enumerate(devices)]
    if not ranked or max(ranked)[0] == 0:
        return None
    return -max(ranked)[1]


def _list_child(channel):
    result = {"dshow": [], "msmf": [], "errors": []}
    if WINDOWS:
        ctypes.windll.ole32.CoInitializeEx(None, 2)
        for key, function in (("dshow", _enum_directshow), ("msmf", _enum_media_foundation)):
            try:
                result[key] = function()
            except Exception as exc:  # A broken driver must not stop the other list.
                result["errors"].append(f"{key}: {type(exc).__name__}: {exc}")
    channel.put(result)


def _run_child(target, args, timeout):
    context = mp.get_context("spawn")
    channel = context.Queue()
    process = context.Process(target=target, args=(channel, *args), daemon=True)
    process.start()
    try:
        return channel.get(timeout=timeout)
    except queue.Empty:
        return None
    finally:
        process.join(timeout=0.5)
        if process.is_alive():
            process.kill()
            process.join(timeout=1)
        channel.close()
        channel.cancel_join_thread()


def list_devices(timeout=10):
    """Video devices by name, with DirectShow/MF indices. Empty off Windows."""
    if not WINDOWS:
        return {"devices": [], "errors": ["Listagem por nome disponível somente no Windows."]}
    raw = _run_child(_list_child, (), timeout)
    if raw is None:
        return {"devices": [], "errors": ["A listagem de dispositivos não respondeu (driver travado?)."]}
    return {"devices": merge_devices(raw["dshow"], raw["msmf"]), "errors": raw["errors"],
            "dshow": raw["dshow"], "msmf": raw["msmf"]}


# --------------------------------------------------------------------------
# System checks (fast; safe to call from the capture process too).

def camera_privacy():
    """Windows 10/11 privacy switches that silently block desktop camera apps."""
    if not WINDOWS:
        return []
    import winreg
    findings = []
    base = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam"
    for hive, hive_name in ((winreg.HKEY_LOCAL_MACHINE, "sistema"), (winreg.HKEY_CURRENT_USER, "usuário")):
        for subkey, label in ((base, "acesso à câmera"), (base + r"\NonPackaged", "aplicativos da área de trabalho")):
            try:
                with winreg.OpenKey(hive, subkey) as key:
                    value = winreg.QueryValueEx(key, "Value")[0]
            except OSError:
                continue
            if str(value).lower() == "deny":
                findings.append(f"Privacidade do Windows bloqueia {label} ({hive_name}). "
                                "Abra Configurações > Privacidade e segurança > Câmera e permita "
                                "o acesso, inclusive para aplicativos da área de trabalho. "
                                "A Elgato é tratada como câmera pelo Windows.")
    return findings


def running_conflicts():
    if not WINDOWS:
        return []
    try:
        output = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, timeout=6,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        text = output.decode("mbcs", errors="replace").lower()
    except Exception:
        return []
    names = set()
    for line in text.splitlines():
        process = line.split('","')[0].strip('"')
        for key, label in CONFLICTING_APPS.items():
            if key in process.replace(" ", "") or key in process:
                names.add(f"{label} ({process})")
    return sorted(names)


def pnp_devices(timeout=15):
    """Camera/media/Elgato entries known to Windows, including driver errors."""
    if not WINDOWS:
        return []
    script = ("$ErrorActionPreference='SilentlyContinue';"
              "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -in "
              "@('Camera','Image','MEDIA','USB') -and ($_.PNPClass -ne 'USB' -or "
              "$_.DeviceID -match 'VID_0FD9') -or $_.Name -match 'Elgato|Game Capture|Cam Link' "
              "-or $_.Manufacturer -match 'Elgato' } | Select-Object Name,PNPClass,Status,"
              "ConfigManagerErrorCode,Manufacturer,DeviceID | ConvertTo-Json -Compress")
    try:
        output = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                                capture_output=True, timeout=timeout,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        data = json.loads(output.decode("utf-8", errors="replace") or "[]")
    except Exception:
        return []
    items = data if isinstance(data, list) else [data]
    result = []
    for item in items:
        code = item.get("ConfigManagerErrorCode") or 0
        result.append({"name": item.get("Name") or "?", "class": item.get("PNPClass") or "",
                       "status": item.get("Status") or "", "code": code,
                       "problem": CM_ERRORS.get(code, f"código {code}") if code else "",
                       "manufacturer": item.get("Manufacturer") or "",
                       "id": item.get("DeviceID") or "",
                       "elgato": is_elgato(item.get("Name")) or "elgato" in str(item.get("Manufacturer")).lower()
                                 or ELGATO_USB_VENDOR in str(item.get("DeviceID")).upper()})
    return result


def quick_hints():
    """Short, local explanations for a failed open (privacy and busy apps)."""
    hints = camera_privacy()
    conflicts = running_conflicts()
    if conflicts:
        hints.append("Feche programas que podem estar usando a placa: " + ", ".join(conflicts) + ".")
    return hints


# --------------------------------------------------------------------------
# Probing: open + first frames, in an isolated process with a deadline.

def fourcc_text(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return "?"
    if number <= 0:
        return "?"
    text = "".join(chr((number >> 8 * i) & 0xFF) for i in range(4))
    return text if text.isprintable() and text.strip() else str(number)


def open_device(index, backend, width=None, height=None, fps=None, fourcc=None):
    """Open one OpenCV device; format requests are optional. Returns cap or None."""
    import cv2
    api = {"DirectShow": cv2.CAP_DSHOW, "Media Foundation": cv2.CAP_MSMF}.get(backend, cv2.CAP_ANY)
    cap = cv2.VideoCapture(int(index), api)
    if not cap.isOpened():
        cap.release()
        return None
    if fourcc and fourcc != "Auto":
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*fourcc))
    if width and height:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    if fps:
        cap.set(cv2.CAP_PROP_FPS, fps)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Some drivers ignore this.
    return cap


def describe_frames(cap, seconds=3.0, frames=12):
    """Read briefly and classify: frames, black, frozen, timing and format."""
    import cv2
    import numpy as np
    start = time.perf_counter()
    stamps, means, thumbs, shape = [], [], [], None
    while time.perf_counter() - start < seconds and len(stamps) < frames:
        ok, frame = cap.read()
        if not ok or frame is None or frame.size == 0:
            time.sleep(0.05)
            continue
        stamps.append(time.perf_counter())
        shape = frame.shape
        thumb = cv2.resize(frame, (32, 18), interpolation=cv2.INTER_AREA)
        means.append(float(thumb.mean()))
        thumbs.append(thumb)
    info = {"frames": len(stamps),
            "first_frame_ms": round((stamps[0] - start) * 1000) if stamps else None,
            "fourcc": fourcc_text(cap.get(cv2.CAP_PROP_FOURCC)),
            "reported_fps": round(float(cap.get(cv2.CAP_PROP_FPS) or 0), 2),
            "reported_size": [int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0),
                              int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)]}
    if shape is not None:
        info["frame_size"] = [shape[1], shape[0]]
        info["measured_fps"] = (round((len(stamps) - 1) / (stamps[-1] - stamps[0]), 1)
                                if len(stamps) > 2 and stamps[-1] > stamps[0] else None)
        info["black"] = max(means) < 3
        info["frozen"] = len(thumbs) > 3 and all(
            float(cv2.absdiff(thumbs[0], other).max()) == 0 for other in thumbs[1:])
    return info


def _probe_child(channel, index, backend, width, height, fps, fourcc):
    started = time.perf_counter()
    result = {"index": index, "backend": backend,
              "request": f"{width}x{height}@{fps} {fourcc or 'Auto'}" if width else "formato nativo"}
    try:
        cap = open_device(index, backend, width, height, fps, fourcc)
        result["open_ms"] = round((time.perf_counter() - started) * 1000)
        result["opened"] = cap is not None
        if cap is not None:
            try:
                result.update(describe_frames(cap))
            finally:
                cap.release()
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    channel.put(result)


def probe(index, backend, width=None, height=None, fps=None, fourcc=None, timeout=12):
    result = _run_child(_probe_child, (index, backend, width, height, fps, fourcc), timeout)
    if result is None:
        return {"index": index, "backend": backend, "opened": None,
                "request": f"{width}x{height}@{fps} {fourcc or 'Auto'}" if width else "formato nativo",
                "error": f"sem resposta em {timeout} s (driver travado ou dispositivo ocupado)"}
    return result


def summarize_probe(result):
    head = f"{result['backend']} índice {result['index']} • {result['request']}: "
    if result.get("error"):
        return head + "ERRO " + result["error"]
    if not result.get("opened"):
        return head + "não abriu"
    if not result.get("frames"):
        return head + f"abriu em {result.get('open_ms')} ms, mas não entregou quadros"
    size = result.get("frame_size", ["?", "?"])
    text = (head + f"OK {size[0]}×{size[1]} {result.get('fourcc')} • {result.get('frames')} quadros, "
            f"1º em {result.get('first_frame_ms')} ms, ~{result.get('measured_fps')} FPS medidos")
    if result.get("black"):
        text += " • QUADROS PRETOS (sem sinal HDMI, HDCP ou resolução da fonte não suportada?)"
    if result.get("frozen"):
        text += " • IMAGEM CONGELADA"
    return text


def diagnose(width=1920, height=1080, fps=30, progress=None, probe_all=True):
    """Full plain-text report. `progress` receives short Portuguese status lines."""
    def step(text):
        if progress:
            progress(text)
    import cv2
    lines = ["ROV Live — diagnóstico de captura",
             f"Data: {datetime.datetime.now():%Y-%m-%d %H:%M:%S}",
             f"Sistema: {platform.platform()} • Python {sys.version.split()[0]} • OpenCV {cv2.__version__}"]
    try:
        from cv2 import videoio_registry as registry
        lines.append("Backends de câmera no OpenCV: " +
                     ", ".join(registry.getBackendName(b) for b in registry.getCameraBackends()))
    except Exception:
        pass
    step("Listando dispositivos de vídeo…")
    listing = list_devices()
    devices = listing["devices"]
    lines.append("")
    lines.append("== Dispositivos de vídeo (ordem usada pelo índice do OpenCV) ==")
    if not devices:
        lines.append("Nenhum dispositivo listado.")
    for device in devices:
        lines.append(f"- {device['name']}{'  [ELGATO]' if device['elgato'] else ''} • "
                     f"DirectShow índice {device['dshow_index']} • Media Foundation índice {device['msmf_index']}")
    for error in listing["errors"]:
        lines.append("  aviso: " + error)
    step("Consultando drivers no Windows…")
    pnp = pnp_devices()
    lines.append("")
    lines.append("== Windows / Gerenciador de Dispositivos (câmera, mídia, Elgato) ==")
    if not pnp and WINDOWS:
        lines.append("Consulta indisponível ou nenhum item encontrado.")
    for item in pnp:
        lines.append(f"- {item['name']} • classe {item['class']} • status {item['status']}"
                     f"{' • PROBLEMA: ' + item['problem'] if item['problem'] else ''}"
                     f"{'  [ELGATO]' if item['elgato'] else ''}")
    elgato_pnp = [item for item in pnp if item["elgato"]]
    elgato_video = [device for device in devices if device["elgato"]]
    lines.append("")
    lines.append("== Verificações ==")
    hints = []
    if WINDOWS and not elgato_pnp and not elgato_video:
        hints.append("Nenhuma Elgato foi encontrada pelo Windows. Confira cabo USB/PCIe, porta USB 3 "
                     "(azul), alimentação e se o modelo exige o driver da Elgato instalado.")
    if elgato_pnp and not elgato_video:
        hints.append("O Windows conhece a Elgato, mas ela não aparece como dispositivo de vídeo "
                     "DirectShow/Media Foundation. Instale/reinstale o driver da Elgato do modelo "
                     "(no simulador sem internet, leve o instalador offline no pendrive).")
    for item in elgato_pnp:
        if item["problem"]:
            hints.append(f"{item['name']}: {item['problem']}.")
    step("Verificando privacidade da câmera e programas abertos…")
    hints += quick_hints()
    lines += [f"! {hint}" for hint in hints] or ["Nenhum bloqueio óbvio encontrado."]
    if probe_all and devices:
        lines.append("")
        lines.append("== Testes de abertura (cada um em processo isolado) ==")
        targets = elgato_video or devices
        for device in targets:
            for backend, key in (("DirectShow", "dshow_index"), ("Media Foundation", "msmf_index")):
                if device[key] is None:
                    continue
                for request in ((width, height, fps, None), (None, None, None, None)):
                    step(f"Testando {device['name']} por {backend}…")
                    result = probe(device[key], backend, *request)
                    result["device"] = device["name"]
                    lines.append(f"- {device['name']}: " + summarize_probe(result))
                    if result.get("frames"):
                        break
    elif probe_all and not WINDOWS:
        lines.append("")
        lines.append("== Testes de abertura por índice ==")
        for index in range(3):
            result = probe(index, "Automático", timeout=8)
            lines.append("- " + summarize_probe(result))
    lines.append("")
    lines.append("Envie este arquivo ao suporte junto com o modelo exato da placa (etiqueta).")
    return "\n".join(lines)


def log_dir():
    """Writable folder next to the app (pendrive) or the user's temp folder."""
    for candidate in (Path(__file__).resolve().parent.parent / "logs",
                      Path(__file__).resolve().parent / "logs",
                      Path(os.environ.get("TEMP", "/tmp")) / "ROV_Live_logs"):
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            probe_file = candidate / ".escrita"
            probe_file.write_text("ok", encoding="utf-8")
            probe_file.unlink()
            return candidate
        except OSError:
            continue
    return Path.cwd()


def save_report(text):
    path = log_dir() / f"diagnostico_captura_{datetime.datetime.now():%Y%m%d_%H%M%S}.txt"
    path.write_text(text, encoding="utf-8")
    return path


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Diagnóstico de captura do ROV Live")
    parser.add_argument("--diagnostico", action="store_true", help="Gera relatório completo")
    parser.add_argument("--listar-json", action="store_true", help="Lista dispositivos em JSON")
    parser.add_argument("--sem-testes", action="store_true", help="Não abre os dispositivos")
    args = parser.parse_args()
    if args.listar_json:
        print(json.dumps(list_devices(), ensure_ascii=False, indent=2))
        return
    text = diagnose(progress=lambda line: print(line, flush=True), probe_all=not args.sem_testes)
    print()
    print(text)
    print()
    print("Relatório salvo em:", save_report(text))


if __name__ == "__main__":
    mp.freeze_support()
    main()
