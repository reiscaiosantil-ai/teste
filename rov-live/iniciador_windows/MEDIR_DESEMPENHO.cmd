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
set "ROV_APP=app\benchmark_live.py"
if not exist "%ROV_APP%" set "ROV_APP=benchmark_live.py"
if not exist logs mkdir logs
echo Feche o ROV Live antes de medir. Mede 960x540 e 1920x1080, ~1 minuto cada.
echo.
echo Arraste aqui um video de teste (ex.: 1029.mp4) e pressione Enter,
echo ou apenas Enter para medir a placa de captura (indice DirectShow 0).
set "ROV_VIDEO="
set /p "ROV_VIDEO=Video: "
if defined ROV_VIDEO (
    set "ROV_SOURCE=%ROV_VIDEO%"
) else (
    set /p "ROV_INDEX=Indice DirectShow da placa [0]: "
    if not defined ROV_INDEX set "ROV_INDEX=0"
)
for %%R in ("960 540" "1920 1080") do call :medir %%~R
echo.
echo Resultados na pasta logs (benchmark_*.json). Envie-os junto com o modelo da GPU.
pause
exit /b 0

:medir
if defined ROV_VIDEO (
    "%ROV_PYTHON%" -u "%ROV_APP%" %ROV_SOURCE% --largura %1 --altura %2 --segundos 30 --saida logs\benchmark_%1x%2.json
) else (
    "%ROV_PYTHON%" -u "%ROV_APP%" --dispositivo %ROV_INDEX% --largura %1 --altura %2 --segundos 30 --saida logs\benchmark_placa_%1x%2.json
)
exit /b 0
