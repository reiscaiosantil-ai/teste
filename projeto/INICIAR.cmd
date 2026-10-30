@echo off
setlocal
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
title ROV Live
if not exist ".venv\Scripts\python.exe" (
    echo Execute INSTALAR.cmd primeiro.
    pause
    exit /b 1
)
".venv\Scripts\python.exe" app.py
if errorlevel 1 (
    echo.
    echo O aplicativo encontrou um erro. Copie a mensagem acima para diagnostico.
    pause
)
