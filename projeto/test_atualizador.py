"""Updater: replaces modules with backup, refuses unknown versions, rolls back."""
import importlib.util
import shutil
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "aplicar_atualizacao", HERE.parent / "iniciador_windows" / "aplicar_atualizacao.py")
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def portable(tmp_path, processing="ai_sharp = 0\n"):
    app = tmp_path / "app"
    (app / "models").mkdir(parents=True)
    for model in ("waternet.onnx", "waternet_fast.onnx"):
        (app / "models" / model).write_bytes(b"onnx")
    for name in updater.NAMES:
        (app / name).write_text("# antigo\n", encoding="utf-8")
    (app / "capture_devices.py").unlink()  # New in 0.3.5.
    (app / "processing.py").write_text(processing, encoding="utf-8")
    (tmp_path / "atualizacao").mkdir()
    for name in updater.NAMES:
        shutil.copy2(HERE / name, tmp_path / "atualizacao" / name)
    return app


def test_update_replaces_modules_and_keeps_backup(tmp_path):
    app = portable(tmp_path)
    backup = updater.install(tmp_path)
    for name in updater.NAMES:
        assert (app / name).read_bytes() == (HERE / name).read_bytes()
    assert (backup / "processing.py").read_text(encoding="utf-8") == "ai_sharp = 0\n"
    assert not (backup / "capture_devices.py").exists()
    assert "0.3.14" in (tmp_path / "VERSAO_ROV_LIVE.txt").read_text(encoding="utf-8")
    assert (tmp_path / "logs").is_dir()


def test_update_refuses_older_than_032(tmp_path):
    app = portable(tmp_path, processing="# 0.3.1\n")
    with pytest.raises(RuntimeError):
        updater.install(tmp_path)
    assert (app / "engine.py").read_text(encoding="utf-8") == "# antigo\n"


def test_update_rolls_back_on_failure(tmp_path, monkeypatch):
    app = portable(tmp_path)
    real = updater.os.replace
    def fail_on_live(src, dst):
        if Path(dst).name == "live_ai.py":
            raise OSError("disco cheio")
        return real(src, dst)
    monkeypatch.setattr(updater.os, "replace", fail_on_live)
    with pytest.raises(OSError):
        updater.install(tmp_path)
    assert (app / "app.py").read_text(encoding="utf-8") == "# antigo\n"
    assert not (app / "capture_devices.py").exists()
    assert not list(app.glob("*.nova-versao"))
