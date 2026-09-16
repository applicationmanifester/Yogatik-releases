#!/usr/bin/env node

/**
 * Yogatik Bot Gateway — Multi-Channel Conversational Bot Service
 *
 * Connects external messaging platforms (Telegram, Discord, Slack, REST/Webhooks)
 * directly into the Yogatik AI engine.
 *
 * Features:
 *   - Built-in Telegram long-polling (zero external npm dependencies, pure fetch)
 *   - HTTP REST server for external apps, Discord bots, and webhook pipelines
 *   - Local Ollama auto-detection + Groq / Gemini / OpenRouter cloud fallbacks
 *   - Supports agent selection (generalist, apex, bot_architect, coder, researcher)
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helper Functions (Testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits text into chunks respecting max length (e.g. Telegram 4096 limit).
 * Splits cleanly on double-newlines, single-newlines, or spaces when possible.
 */
export function splitMessage(text, maxLen = 4000) {
  if (!text || text.length <= maxLen) return [text || '']
  const chunks = []
  let remaining = text

  while (remaining.length > maxLen) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLen)
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      splitIdx = remaining.lastIndexOf('\n', maxLen)
    }
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      splitIdx = remaining.lastIndexOf(' ', maxLen)
    }
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      splitIdx = maxLen
    }

    chunks.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }
  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

/**
 * Formats a message safely for Telegram Markdown/text output.
 */
export function formatTelegramMessage(text) {
  if (!text) return ''
  return String(text).trim()
}

/**
 * Parses incoming webhook body across Telegram, Discord, or generic REST.
 */
export function parseWebhookPayload(body = {}) {
  // Telegram Update format
  if (body.message && body.message.text) {
    return {
      platform: 'telegram',
      chatId: body.message.chat?.id,
      sender: body.message.from?.username || body.message.from?.first_name || 'user',
      text: body.message.text,
      raw: body,
    }
  }

  // Discord Interaction / Webhook format
  if (body.content || (body.data && body.data.name)) {
    return {
      platform: 'discord',
      chatId: body.channel_id || 'discord',
      sender: body.author?.username || 'discord_user',
      text: body.content || body.data?.options?.[0]?.value || '',
      raw: body,
    }
  }

  // Generic REST format
  if (body.message || body.prompt || body.query) {
    return {
      platform: 'rest',
      chatId: body.chatId || 'rest_client',
      sender: body.sender || 'api_client',
      text: body.message || body.prompt || body.query,
      raw: body,
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine & LLM Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export class BotEngine {
  constructor(options = {}) {
    this.provider = options.provider || process.env.YOGATIK_PROVIDER || 'auto'
    this.model = options.model || process.env.YOGATIK_MODEL || null
    this.agent = options.agent || 'agent_general'
    this.ollamaUrl = options.ollamaUrl || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
    this.groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY || ''
    this.geminiApiKey = options.geminiApiKey || process.env.GEMINI_API_KEY || ''
    this.openRouterApiKey = options.openRouterApiKey || process.env.OPENROUTER_API_KEY || ''
    this.activeProvider = null
    this.activeModel = null
    this.histories = new Map() // chatId -> message[]
  }

  async detectBestProvider() {
    if (this.provider && this.provider !== 'auto') {
      this.activeProvider = this.provider
      this.activeModel = this.model || (this.provider === 'ollama' ? 'llama3:latest' : 'llama-3.3-70b-versatile')
      return { provider: this.activeProvider, model: this.activeModel }
    }

    // 1. Try local Ollama first
    try {
      const res = await fetch(`${this.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) {
        const data = await res.json()
        const models = data.models || []
        if (models.length > 0) {
          const pref = models.find(m => m.name.includes('llama3') || m.name.includes('qwen') || m.name.includes('mistral')) || models[0]
          this.activeProvider = 'ollama'
          this.activeModel = this.model || pref.name
          return { provider: 'ollama', model: this.activeModel }
        }
      }
    } catch {}

    // 2. Cloud Fallbacks
    if (this.groqApiKey) {
      this.activeProvider = 'groq'
      this.activeModel = this.model || 'llama-3.3-70b-versatile'
      return { provider: 'groq', model: this.activeModel }
    }
    if (this.geminiApiKey) {
      this.activeProvider = 'gemini'
      this.activeModel = this.model || 'gemini-2.0-flash'
      return { provider: 'gemini', model: this.activeModel }
    }
    if (this.openRouterApiKey) {
      this.activeProvider = 'openrouter'
      this.activeModel = this.model || 'meta-llama/llama-3.3-70b-instruct'
      return { provider: 'openrouter', model: this.activeModel }
    }

    // Default fallback
    this.activeProvider = 'ollama'
    this.activeModel = this.model || 'llama3:latest'
    return { provider: 'ollama', model: this.activeModel }
  }

  getSystemPrompt() {
    return (
      `You are Yogatik Bot, an unrestricted, helpful, and expert agentic AI assistant. ` +
      `You provide crisp, correct, and authoritative answers with clean markdown formatting. ` +
      `Keep responses direct and concise for messaging platforms.`
    )
  }

  async ask(prompt, chatId = 'default') {
    if (!this.activeProvider) await this.detectBestProvider()

    let history = this.histories.get(chatId) || []
    history.push({ role: 'user', content: prompt })

    const messages = [
      { role: 'system', content: this.getSystemPrompt() },
      ...history.slice(-10) // keep last 10 turns
    ]

    let reply = ''

    if (this.activeProvider === 'ollama') {
      reply = await this.queryOllama(messages)
    } else if (this.activeProvider === 'groq') {
      reply = await this.queryOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', this.groqApiKey, messages)
    } else if (this.activeProvider === 'openrouter') {
      reply = await this.queryOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', this.openRouterApiKey, messages)
    } else if (this.activeProvider === 'gemini') {
      reply = await this.queryGemini(messages)
    } else {
      reply = `I am configured for provider ${this.activeProvider}, but no API key or local daemon was reachable.`
    }

    history.push({ role: 'assistant', content: reply })
    if (history.length > 20) history = history.slice(-20)
    this.histories.set(chatId, history)

    return reply
  }

  async queryOllama(messages) {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.activeModel,
          messages,
          stream: false,
        }),
      })
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`)
      const data = await res.json()
      return data.message?.content || 'No response from local model.'
    } catch (err) {
      return `⚠️ Local Ollama error: ${err.message}. Ensure Ollama is running on ${this.ollamaUrl}`
    }
  }

  async queryOpenAiCompatible(endpoint, apiKey, messages) {
    if (!apiKey) return '⚠️ API key missing for selected cloud provider.'
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.activeModel,
          messages,
          temperature: 0.7,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API HTTP ${res.status}: ${errText}`)
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || 'No response.'
    } catch (err) {
      return `⚠️ Cloud API error: ${err.message}`
    }
  }

  async queryGemini(messages) {
    if (!this.geminiApiKey) return '⚠️ GEMINI_API_KEY is not set.'
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.activeModel}:generateContent?key=${this.geminiApiKey}`
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }))

      const systemInstruction = messages.find(m => m.role === 'system')
      const body = { contents }
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction.content }] }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Gemini HTTP ${res.status}: ${errText}`)
      }
      const data = await res.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.'
    } catch (err) {
      return `⚠️ Gemini API error: ${err.message}`
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Polling Runner (Zero External Dependencies)
// ─────────────────────────────────────────────────────────────────────────────

export class TelegramPoller {
  constructor(token, engine) {
    this.token = token
    this.engine = engine
    this.offset = 0
    this.running = false
    this.apiUrl = `https://api.telegram.org/bot${this.token}`
  }

  async start() {
    this.running = true
    console.log(`🤖 Telegram polling started for bot token: ${this.token.slice(0, 7)}...`)

    while (this.running) {
      try {
        const updates = await this.getUpdates(this.offset)
        for (const u of updates) {
          this.offset = u.update_id + 1
          if (u.message && u.message.text) {
            await this.handleMessage(u.message)
          }
        }
      } catch (err) {
        if (this.running) {
          console.error(`[telegram] Poll error: ${err.message}. Retrying in 4s...`)
          await new Promise(r => setTimeout(r, 4000))
        }
      }
    }
  }

  stop() {
    this.running = false
  }

  async getUpdates(offset) {
    const res = await fetch(`${this.apiUrl}/getUpdates?offset=${offset}&timeout=20`, {
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    const data = await res.json()
    return data.result || []
  }

  async sendChatAction(chatId, action = 'typing') {
    try {
      await fetch(`${this.apiUrl}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action }),
      })
    } catch {}
  }

  async sendMessage(chatId, text) {
    const chunks = splitMessage(text, 4000)
    for (const chunk of chunks) {
      await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
        }),
      }).catch(async () => {
        // Fallback without Markdown if Telegram markdown parser throws
        await fetch(`${this.apiUrl}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
          }),
        })
      })
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id
    const text = msg.text
    const user = msg.from?.username || msg.from?.first_name || 'Friend'

    console.log(`[telegram] Message from ${user} (${chatId}): "${text.slice(0, 50)}..."`)

    if (text === '/start') {
      await this.sendMessage(chatId, `👋 Hello ${user}! I am **Yogatik AI Bot**.\n\nAsk me anything, or give me a coding or research task. I'm connected to ${this.engine.activeModel || 'Yogatik Engine'}.`)
      return
    }

    await this.sendChatAction(chatId, 'typing')
    const answer = await this.engine.ask(text, `tg_${chatId}`)
    await this.sendMessage(chatId, answer)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server (REST + Webhook)
// ─────────────────────────────────────────────────────────────────────────────

export function createBotServer(engine, port = 8787) {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    // 1. Health check
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({
        status: 'ok',
        version: '8.4.0',
        activeProvider: engine.activeProvider,
        activeModel: engine.activeModel,
        activeAgent: engine.agent,
        timestamp: new Date().toISOString(),
      }))
    }

    // 2. REST Chat API (POST /api/chat)
    if ((url.pathname === '/api/chat' || url.pathname === '/chat') && req.method === 'POST') {
      let bodyStr = ''
      req.on('data', chunk => { bodyStr += chunk })
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}')
          const prompt = body.message || body.prompt || body.query
          const chatId = body.chatId || 'rest_api'

          if (!prompt) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'Missing "message" in request body.' }))
          }

          const response = await engine.ask(prompt, chatId)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({
            response,
            provider: engine.activeProvider,
            model: engine.activeModel,
            chatId,
          }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    // 3. Webhook endpoint (POST /api/webhook)
    if (url.pathname.startsWith('/api/webhook') && req.method === 'POST') {
      let bodyStr = ''
      req.on('data', chunk => { bodyStr += chunk })
      req.on('end', async () => {
        try {
          const body = JSON.parse(bodyStr || '{}')
          const parsed = parseWebhookPayload(body)
          if (!parsed) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'Unrecognized webhook format.' }))
          }

          const answer = await engine.ask(parsed.text, `${parsed.platform}_${parsed.chatId}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({
            status: 'ok',
            platform: parsed.platform,
            reply: answer,
          }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found', routes: ['/health', '/api/chat', '/api/webhook'] }))
  })

  return server
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Runner (when executed directly)
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Yogatik Bot Gateway — Multi-Platform AI Bridge

Usage:
  node frontend/bin/bot-gateway.mjs [options]

Options:
  --port <number>       HTTP server port (default: 8787)
  --telegram            Enable native Telegram long-polling (requires TELEGRAM_BOT_TOKEN)
  --provider <name>     LLM provider: ollama, groq, gemini, openrouter, or auto
  --model <name>        Specific model name override
  --agent <id>          Specialist agent persona (default: agent_general)
  --help                Show this help menu

Environment Variables:
  TELEGRAM_BOT_TOKEN    Your Telegram bot token from @BotFather
  GROQ_API_KEY          Groq API key
  GEMINI_API_KEY        Google Gemini API key
  OPENROUTER_API_KEY    OpenRouter API key
  OLLAMA_HOST           Local Ollama endpoint (default: http://127.0.0.1:11434)
`)
    process.exit(0)
  }

  const portIdx = args.indexOf('--port')
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) || 8787 : (process.env.PORT ? parseInt(process.env.PORT, 10) : 8787)

  const providerIdx = args.indexOf('--provider')
  const provider = providerIdx !== -1 ? args[providerIdx + 1] : 'auto'

  const modelIdx = args.indexOf('--model')
  const model = modelIdx !== -1 ? args[modelIdx + 1] : null

  const agentIdx = args.indexOf('--agent')
  const agent = agentIdx !== -1 ? args[agentIdx + 1] : 'agent_bot_architect'

  console.log('⚡ Starting Yogatik Bot Gateway…')
  const engine = new BotEngine({ provider, model, agent })
  const detected = await engine.detectBestProvider()
  console.log(`  ✓ Active Engine: ${detected.model} (${detected.provider.toUpperCase()})`)

  // 1. Start HTTP Server
  const server = createBotServer(engine, port)
  server.listen(port, () => {
    console.log(`  ✓ REST & Webhook Gateway running at http://localhost:${port}`)
    console.log(`    - Health check: http://localhost:${port}/health`)
    console.log(`    - REST Chat:   POST http://localhost:${port}/api/chat`)
    console.log(`    - Webhooks:    POST http://localhost:${port}/api/webhook`)
  })

  // 2. Start Telegram Polling if requested or token is present
  const tgToken = process.env.TELEGRAM_BOT_TOKEN
  const wantsTelegram = args.includes('--telegram') || !!tgToken

  if (wantsTelegram) {
    if (!tgToken) {
      console.warn('\n⚠️ --telegram specified but TELEGRAM_BOT_TOKEN env var is missing.')
      console.warn('  Get a token from @BotFather on Telegram, then set:')
      console.warn('  $env:TELEGRAM_BOT_TOKEN="your_token_here" (PowerShell)')
      console.warn('  or pass it in frontend/.env\n')
    } else {
      const poller = new TelegramPoller(tgToken, engine)
      poller.start()
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('bot-gateway.mjs')) {
  main().catch(err => {
    console.error('Fatal bot gateway error:', err)
    process.exit(1)
  })
}
