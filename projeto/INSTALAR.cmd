@echo off
setlocal
cd /d "%~dp0"
title ROV Live IA - instalacao
echo ROV Live - preparando o aplicativo
echo.
if exist ".venv\Scripts\python.exe" goto dependencies
py -3.12 -c "import sys; assert sys.maxsize > 2**32" >nul 2>&1
if not errorlevel 1 (
    py -3.12 -m venv .venv
    goto verify
)
py -3.11 -c "import sys; assert sys.maxsize > 2**32" >nul 2>&1
if not errorlevel 1 (
    py -3.11 -m venv .venv
    goto verify
)
python -c "import sys; assert (3,10) <= sys.version_info[:2] <= (3,13) and sys.maxsize > 2**32" >nul 2>&1
if not errorlevel 1 (
    python -m venv .venv
    goto verify
)
echo Python compativel nao encontrado.
echo Instale Python 3.12 de 64 bits em https://www.python.org/downloads/windows/
echo Marque Add python.exe to PATH e execute este arquivo novamente.
pause
exit /b 1
:verify
if not exist ".venv\Scripts\python.exe" goto fail
:dependencies
echo Instalando dependencias. A primeira instalacao precisa de internet.
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto fail
".venv\Scripts\python.exe" -c "import cv2, numpy, PySide6, onnxruntime"
if errorlevel 1 goto fail
echo.
echo Pronto. Abra INICIAR.cmd para usar o ROV Live.
pause
exit /b 0
:fail
echo.
echo A instalacao falhou. Tente INSTALAR_CPU.cmd se a falha for DirectML. Confira a mensagem acima e a conexao com a internet.
echo Nao e necessario executar como administrador.
pause
exit /b 1
