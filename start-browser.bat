@echo off
title Yogatik Browser
echo Launching Yogatik Browser (Standalone App)...
cd /d "%~dp0yogatik-browser"
npx electron .
