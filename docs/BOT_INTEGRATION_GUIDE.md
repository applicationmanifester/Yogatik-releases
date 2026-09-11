# Yogatik Bot Integration Guide

This guide explains how to connect external chat services (Telegram, Discord, Slack) and automated pipelines directly to the **Yogatik AI Engine**.

---

## 1. Quick Start

### Start the Bot Gateway Server
From the workspace root:
```bash
npm run bot
# Or double-click bot-gateway.bat
```
This starts an HTTP server on port `8787` with:
- Health status: `GET http://localhost:8787/health`
- REST Chat API: `POST http://localhost:8787/api/chat`
- Multi-channel Webhook: `POST http://localhost:8787/api/webhook`

---

## 2. Connecting a Telegram Bot

The Yogatik Bot Gateway includes a built-in Telegram long-polling engine with **zero external npm dependencies** (runs on native Node.js `fetch`).

### Step 1: Create a Bot on Telegram
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and choose a display name and username (e.g. `MyYogatikBot`).
3. BotFather will provide an API HTTP token: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`.

### Step 2: Run the Bot
Set your token in your environment (or inside `frontend/.env`):
```powershell
$env:TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
npm run bot:telegram
```
Now message your bot on Telegram! It will:
- Respond immediately to `/start`.
- Stream status and typing indicators.
- Automatically break long answers (>4,000 chars) into clean sequential chunks.

---

## 3. Discord Bot Integration

You can easily bridge any Discord bot to Yogatik using the REST endpoint.

### Option A: Using the REST Endpoint
In your Discord bot script (e.g. `discord.js`):
```javascript
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!ai ')) return;

  const prompt = message.content.slice(4);
  await message.channel.sendTyping();

  const res = await fetch('http://localhost:8787/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: prompt,
      chatId: `discord_${message.author.id}`,
    }),
  });

  const data = await res.json();
  await message.reply(data.response);
});
```

### Option B: Using the Webhook Endpoint
Send a `POST` request to `http://localhost:8787/api/webhook`:
```json
{
  "content": "What are the latest updates?",
  "channel_id": "123456",
  "author": { "username": "alice" }
}
```
Response:
```json
{
  "status": "ok",
  "platform": "discord",
  "reply": "Here is the summary..."
}
```

---

## 4. REST Chat API Reference

### `POST /api/chat`
Send conversational turns to Yogatik from scripts, cron jobs, or frontends.

**Request Body**:
```json
{
  "message": "Explain how WebGPU acceleration works in Yogatik.",
  "chatId": "session_abc123"
}
```

**Response**:
```json
{
  "response": "Yogatik leverages in-browser WebGPU runtimes...",
  "provider": "ollama",
  "model": "llama3:latest",
  "chatId": "session_abc123"
}
```

---

## 5. Model Providers & Local Offline Mode

The Bot Gateway automatically detects the best engine available:

| Mode | Configuration | Command |
|---|---|---|
| **Local Offline (Ollama)** | Install Ollama, pull `llama3` or `qwen2.5-coder` | `npm run bot` (Auto-detected) |
| **Groq (Ultra-Fast Cloud)** | Set `GROQ_API_KEY` in `frontend/.env` | `node bin/bot-gateway.mjs --provider groq` |
| **Gemini (Google AI)** | Set `GEMINI_API_KEY` in `frontend/.env` | `node bin/bot-gateway.mjs --provider gemini` |
| **OpenRouter (Multi-Model)** | Set `OPENROUTER_API_KEY` in `frontend/.env` | `node bin/bot-gateway.mjs --provider openrouter` |

---

## 6. The "Bot Architect & Integrator" Agent (`agent_bot_architect`)

Yogatik includes a dedicated built-in specialist agent persona: **Bot Architect & Integrator**:
- Accessible in the UI via the Agent Picker in the top bar.
- Accessible in multi-agent workflows via `@bot_architect` or through `APEX_AGENT`.
- Specializes in:
  - Scaffolding webhooks and stateful message handlers.
  - Rate limiting, signature verification, and deduplication.
  - Designing multi-channel dialogue trees and interactive cards.
