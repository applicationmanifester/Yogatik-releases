@echo off
setlocal
echo ========================================================
echo   Building Yogatik Studio Edition (Standalone Agent Engine)
echo ========================================================

cd /d "%~dp0frontend"
npm run electron:build:studio

echo.
echo Standalone Executable built at:
echo   frontend\release-studio\win-unpacked\Yogatik Studio.exe
echo.
pause
