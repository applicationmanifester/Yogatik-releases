@echo off
REM Build the Yogatik Windows desktop app (.exe) via Electron. No Rust needed.
REM Prereqs: Node 18+ only.
cd /d "%~dp0frontend"
echo === Installing dependencies ===
call npm install || goto :err
echo === Building Electron installer ===
call npm run electron:build || goto :err
echo.
echo Done. Installer is in: frontend\release-electron\
explorer "release-electron"
goto :eof
:err
echo Build failed. See output above.
exit /b 1
