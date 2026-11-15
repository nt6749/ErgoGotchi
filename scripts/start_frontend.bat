@echo off
REM Start ErgoGotchi Frontend on Windows
cd /d "%~dp0\.."

echo [ErgoGotchi] Starting Vite Dev Server on http://localhost:5173...
call npm run dev
pause
