@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set "ROV_PYTHON="
if exist "runtime\python.exe" set "ROV_PYTHON=runtime\python.exe"
if not defined ROV_PYTHON if exist ".venv\Scripts\python.exe" set "ROV_PYTHON=.venv\Scripts\python.exe"
if not defined ROV_PYTHON (
    echo Coloque este arquivo na pasta do ROV Live que contem app e runtime.
    pause
    exit /b 1
)
echo Feche o ROV Live, o 4K Capture Utility, o Camera Hub e o OBS antes do teste.
echo Conecte a Elgato e ligue a fonte HDMI. Pressione uma tecla para comecar.
pause >nul
if exist "app\capture_devices.py" (
    "%ROV_PYTHON%" -u app\capture_devices.py --diagnostico
) else (
    "%ROV_PYTHON%" -u capture_devices.py --diagnostico
)
echo.
echo O relatorio foi salvo na pasta logs. Envie o arquivo .txt ao suporte.
pause
