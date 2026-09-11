@echo off
title Yogatik - Bot Gateway
cd /d "%~dp0frontend"

echo ========================================================
echo   Yogatik AI Bot Gateway
echo   Multi-Platform Bridge: Telegram, Discord, REST API
echo ========================================================
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo Starting Bot Gateway on http://localhost:8787 ...
echo.
echo Options:
echo   - To connect Telegram: set TELEGRAM_BOT_TOKEN in frontend\.env or shell
echo   - To use local LLM: ensure Ollama is running on port 11434
echo   - To test REST API: POST http://localhost:8787/api/chat
echo.

if defined TELEGRAM_BOT_TOKEN (
    echo [Telegram Bot Token detected: %TELEGRAM_BOT_TOKEN:~0,8%...]
    node bin\bot-gateway.mjs --telegram %*
) else (
    node bin\bot-gateway.mjs %*
)

pause
