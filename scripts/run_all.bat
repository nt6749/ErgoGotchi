@echo off
REM ErgoGotchi All-in-One Launcher for Windows
cd /d "%~dp0\.."

node scripts\launcher.cjs %*
pause
