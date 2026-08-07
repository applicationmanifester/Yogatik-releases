@echo off
title Yogatik - Deploy CORS Proxy (Cloudflare)
cd /d "%~dp0cors-proxy"

echo Deploying worker (a browser window opens on first run for Cloudflare login)...
call npx --yes wrangler@latest deploy
echo.
echo Copy the workers.dev URL printed above into frontend\.env as:
echo     VITE_LLM_PROXY_BASE=https://yogatik-cors-proxy.^<subdomain^>.workers.dev
echo then run deploy.bat to rebuild and publish the site.
pause
