@echo off
REM Build the Yogatik Windows desktop app (.exe) via Electron. No Rust needed.
REM Prereqs: Node 18+ only.
cd /d "%~dp0frontend"
echo === Installing dependencies ===
call npm install || goto :err
echo === Building Yogatik Desktop App ===
call npm run build:desktop || goto :err
echo.
echo Done! Native Desktop Executable is ready:
echo frontend\release-electron\win-unpacked\Yogatik.exe
explorer "release-electron\win-unpacked"
goto :eof
:err
echo Build failed. See output above.
exit /b 1
