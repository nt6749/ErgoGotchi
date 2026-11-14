@echo off
REM Start ErgoGotchi Backend Server on Windows
cd /d "%~dp0\.."

IF EXIST ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

set PYTHONPATH=%CD%\backend
echo [ErgoGotchi] Starting Backend on http://localhost:8000...
python backend\app\main.py
pause
