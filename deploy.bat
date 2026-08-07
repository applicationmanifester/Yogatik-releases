@echo off
title Yogatik - Deploy
cd /d "%~dp0"

where firebase >nul 2>nul || (echo Installing firebase-tools... && call npm i -g firebase-tools)

cd frontend
if not exist node_modules call npm install

echo [1/4] Lint...
call npm run lint || (echo. & echo LINT FAILED - fix the errors above before deploying. & echo This catches missing imports that the build happily compiles. & pause & exit /b 1)

echo [2/4] Tests...
call npm test || (echo. & echo TESTS FAILED - not deploying. & pause & exit /b 1)

echo [3/4] Build...
call npm run build || (echo BUILD FAILED & pause & exit /b 1)

cd /d "%~dp0"
if not exist frontend\.env echo WARNING: frontend\.env missing - NVIDIA proxy disabled (run deploy-proxy.bat first)

echo [4/4] Deploying hosting + firestore rules...
call firebase deploy --only hosting,firestore:rules
echo.
echo  https://yogatik.web.app/
echo  Hard-refresh (Ctrl+Shift+R) to bypass the service worker cache.
pause
