@echo off
title Yogatik
cd /d "%~dp0frontend"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo.
echo  Yogatik - Starting dev server...
echo  http://localhost:5173
echo.
call npm run dev
pause
