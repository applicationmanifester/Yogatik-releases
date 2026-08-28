@echo off
set "PATH=C:\Program Files\Go\bin;%PATH%"
cd /d "C:\Users\bharg_4mtuttl\Desktop\BGK_Applications\AI ChatBot\frontend"
call npm run electron:build:studio
exit /b %ERRORLEVEL%