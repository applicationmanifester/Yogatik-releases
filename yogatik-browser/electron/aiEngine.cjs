// Local-first AI engine for Yogatik Browser.
//
// Tier 1 of the AI-native roadmap. The companion used to answer from
// template heuristics only; this module adds a REAL model with a
// privacy-first preference order:
//
//   1. Ollama on localhost:11434  — fully offline, no API key, nothing sent
//      to any cloud. This is the default and the differentiator: no other
//      browser ships local AI.
//   2. OpenAI-compatible endpoint — optional. The user may store a baseUrl +
//      key in settings (Groq, OpenRouter, OpenAI) for stronger cloud models.
//   3. Template heuristics — the old fallback, so the panel ALWAYS answers.
//
// Everything here is plain node https — no SDKs, no telemetry.

const https = require('https')
const http = require('http')
const { get: getSetting } = require('./settings/store.cjs')

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434

// ── State ─────────────────────────────────────────────────────────────────
let ollamaAvailable = false
let ollamaModel = null          // preferred local model tag
let ollamaModels = []           // all installed tags
let lastProbe = 0
let probing = false

/**
 * Probe Ollama for availability and installed models. Cached for 60s —
 * the daemon does not appear/disappear mid-session often.
 */
async function probeOllama(force = false) {
  if (probing) return getStatus()
  if (!force && Date.now() - lastProbe < 60_000) return getStatus()
  probing = true
  try {
    const body = await request('http', OLLAMA_HOST, OLLAMA_PORT, '/api/tags', 'GET')
    const parsed = JSON.parse(body)
    ollamaModels = (parsed.models || [])
      .map(m => m.name || m.model)
      .filter(Boolean)
    // Prefer a general instruct model if several are installed.
    const pref = ollamaModels.find(n => /llama|qwen|mistral|deepseek|phi|gemma|granite/i.test(n))
    ollamaModel = pref || ollamaModels[0] || null
    ollamaAvailable = ollamaModels.length > 0
    lastProbe = Date.now()
  } catch {
    ollamaAvailable = false
    ollamaModel = null
    ollamaModels = []
    lastProbe = Date.now()
  } finally {
    probing = false
  }
  return getStatus()
}

function getStatus() {
  const baseUrl = getSetting('aiBaseUrl')
  const apiKey = getSetting('aiApiKey')
  return {
    ollama: ollamaAvailable,
    model: ollamaModel,
    models: ollamaModels,
    cloud: !!(baseUrl && apiKey),
    cloudBaseUrl: baseUrl || null,
    mode: ollamaAvailable ? 'local' : ((baseUrl && apiKey) ? 'cloud' : 'template'),
    label: ollamaAvailable
      ? `Ollama (local) · ${ollamaModel}`
      : ((baseUrl && apiKey) ? 'Cloud model' : 'Offline templates'),
  }
}

// ── HTTP helper ───────────────────────────────────────────────────────────
function request(proto, host, port, reqPath, method, reqBody, headers = {}, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const mod = proto === 'https' ? https : http
    const payload = reqBody ? JSON.stringify(reqBody) : null
    const req = mod.request({
      hostname: host,
      port,
      path: reqPath,
      method,
      headers: {
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        } : {}),
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data)
        else reject(new Error(`HTTP ${res.statusCode}: ${String(data).slice(0, 300)}`))
      })
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Chat with the best available model.
 * @param {Array<{role, content}>} messages
 * @param {{onToken?: (t: string) => void, temperature?: number, maxTokens?: number}} opts
 * @returns {Promise<{text, via, model}>}
 */
async function chat(messages, opts = {}) {
  const status = getStatus()

  // 1. Ollama (local) — streams NDJSON lines; each has message.content deltas.
  if (status.ollama) {
    try {
      const text = await ollamaChat(messages, opts)
      return { text, via: 'Ollama', model: status.model }
    } catch (err) {
      // Daemon died mid-request — fall through to cloud/templates.
      ollamaAvailable = false
    }
  }

  // 2. OpenAI-compatible cloud endpoint from settings.
  if (status.cloud) {
    try {
      const text = await openAiCompatibleChat(messages, opts, status.cloudBaseUrl, getSetting('aiApiKey'), getSetting('aiModel'))
      return { text, via: 'Cloud', model: getSetting('aiModel') || 'default' }
    } catch (err) {
      // Fall through to templates.
    }
  }

  throw new Error('NO_MODEL')
}

async function ollamaChat(messages, opts) {
  const body = {
    model: getSetting('aiOllamaModel') || ollamaModel,
    messages,
    stream: true,
    options: {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
      // Ollama defaults to num_ctx=2048, which truncates multi-page research
      // context. 8192 fits ~6 page extracts; override via settings.
      num_ctx: Number(getSetting('aiOllamaNumCtx')) || 8192,
      ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}),
    },
  }
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request({
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 300_000,
    }, (res) => {
      if (res.statusCode !== 200) {
        let err = ''
        res.on('data', c => { err += c })
        res.on('end', () => reject(new Error(`Ollama HTTP ${res.statusCode}: ${String(err).slice(0, 200)}`)))
        return
      }
      let buf = ''
      let full = ''
      res.on('data', (chunk) => {
        buf += chunk
        let idx
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 1)
          if (!line) continue
          try {
            const evt = JSON.parse(line)
            const delta = evt.message?.content || ''
            if (delta) {
              full += delta
              if (opts.onToken) {
                try { opts.onToken(delta) } catch {}
              }
            }
          } catch { /* partial JSON line — wait for more */ }
        }
      })
      res.on('end', () => resolve(full))
      res.on('error', reject)
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')) })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function openAiCompatibleChat(messages, opts, baseUrl, apiKey, model) {
  const url = new URL(baseUrl)
  const path = url.pathname.replace(/\/+$/, '') + '/chat/completions'
  const body = {
    model: model || 'gpt-4o-mini',
    messages,
    stream: false,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  }
  const data = await request(url.protocol === 'https:' ? 'https' : 'http', url.hostname, url.port || (url.protocol === 'https:' ? 443 : 80), path, 'POST', body, {
    Authorization: `Bearer ${apiKey}`,
  })
  const parsed = JSON.parse(data)
  const text = parsed.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('Empty completion')
  return text
}

/**
 * One-shot JSON ask — used by planners that must return structured output.
 * Falls back to null when no model (caller applies heuristics).
 */
async function askJson(system, user) {
  try {
    const { text } = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { temperature: 0.1 })
    // Models wrap JSON in prose or fences — extract the first {...} or [...].
    const match = text.match(/[[{][\s\S]*[\]}]/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

// Probe once at module load (async, non-blocking).
probeOllama().catch(() => {})

module.exports = {
  chat, askJson, probeOllama, getStatus,
  isOllamaAvailable: () => ollamaAvailable,
}
