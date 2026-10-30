"""Local-only update of an existing 0.3.2 / 0.3.2a / 0.3.3 / 0.3.4 installation."""
import ast
import os
from pathlib import Path
import shutil
import tempfile

VERSION = '0.3.7'
NAMES = ['app.py', 'engine.py', 'processing.py', 'rov_ai.py', 'live_ai.py',
         'export_video.py', 'temporal_restore.py', 'capture_devices.py', 'benchmark_live.py']


def install(root):
    root = Path(root)
    target = root / 'app' if (root / 'app' / 'app.py').is_file() else root
    if not (target / 'models' / 'waternet.onnx').is_file():
        raise RuntimeError('Extraia a atualizacao na pasta do ROV Live que ja contem os modelos.')
    if not (target / 'models' / 'waternet_fast.onnx').is_file():
        raise RuntimeError('O modelo rapido esta ausente. Preserve todos os arquivos do pacote original.')
    current = (target / 'processing.py').read_text(encoding='utf-8')
    if 'ai_sharp' not in current:
        raise RuntimeError('Esta atualizacao exige ROV Live IA 0.3.2, 0.3.2a, 0.3.3 ou 0.3.4.')
    for name in NAMES:
        source = root / 'atualizacao' / name
        ast.parse(source.read_text(encoding='utf-8'), filename=name)
    backup = Path(tempfile.mkdtemp(prefix=f'backup_antes_{VERSION}_', dir=root))
    existing = []
    for name in NAMES:
        if (target / name).exists():
            shutil.copy2(target / name, backup / name)
            existing.append(name)
    installed = []
    temporary = []
    try:
        for name in NAMES:
            temp = target / (name + '.nova-versao')
            temporary.append(temp)
            shutil.copy2(root / 'atualizacao' / name, temp)
            os.replace(temp, target / name)
            installed.append(name)
        (root / 'VERSAO_ROV_LIVE.txt').write_text(
            f'{VERSION} — interface simplificada, visual natural, captura Elgato\n',
            encoding='utf-8')
    except Exception:
        for name in installed:
            if name in existing:
                shutil.copy2(backup / name, target / name)
            else:
                (target / name).unlink(missing_ok=True)
        raise
    finally:
        for temp in temporary:
            temp.unlink(missing_ok=True)
    (root / 'logs').mkdir(exist_ok=True)
    return backup


if __name__ == '__main__':
    try:
        backup = install(Path(__file__).resolve().parent)
        print(f'Atualizacao {VERSION} aplicada. Copia anterior:', backup.name)
        print('Abra INICIAR_PORTATIL.cmd. Nao e necessario instalar dependencias.')
        print('Se a Elgato nao abrir, execute DIAGNOSTICO_CAPTURA.cmd e envie o relatorio da pasta logs.')
    except Exception as exc:
        print('Atualizacao nao concluida:', exc)
        raise SystemExit(1)
