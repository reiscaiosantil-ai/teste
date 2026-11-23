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
    echo Extraia a atualizacao na pasta do ROV Live que contem app e runtime, ou a instalacao com .venv.
    pause
    exit /b 1
)
echo Feche o ROV Live antes de aplicar a atualizacao.
echo Pressione uma tecla depois de fechar o programa.
pause >nul
"%ROV_PYTHON%" -u aplicar_atualizacao.py
pause
