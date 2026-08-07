@echo off
title Yogatik - Deploy
cd /d "%~dp0"

where firebase >nul 2>nul || (echo Installing firebase-tools... && call npm i -g firebase-tools)

cd frontend
if not exist node_modules call npm install
echo Building...
call npm run build || (echo BUILD FAILED & pause & exit /b 1)

cd /d "%~dp0"
if not exist frontend\.env echo WARNING: frontend\.env missing - NVIDIA proxy disabled (run deploy-proxy.bat first)

echo Deploying hosting + firestore rules...
call firebase deploy --only hosting,firestore:rules
echo.
echo  https://yogatik.web.app/
pause
