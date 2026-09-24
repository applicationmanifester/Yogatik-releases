/**
 * Browser-native LLM client — calls Gemini/Groq/OpenRouter/OpenAI directly,
 * proxies non-CORS providers (NVIDIA etc.) through /api/llm-proxy.
 * API key stored in IndexedDB, never sent to any backend.
 */

import { createReasoningTagger } from './reasoning.js'

const PROVIDERS = {
  nvidia: {
    name: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [],
    default: '',
    preferred: [
      'meta/llama-3.3-70b-instruct',
      'meta/llama-3.1-8b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'nvidia/nemotron-3-nano-30b-a3b',
      'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    ],
    keyUrl: 'https://build.nvidia.com',
    publicModels: true,
    needsProxy: true,
  },
  local: {
    name: 'On-device (no key)',
    baseUrl: '',            // never leaves the browser
    models: [],             // filled from localLLM at runtime
    default: '',
    keyUrl: '',
    isLocal: true,
    noKey: true,
  },
  ollama: {
    name: 'Ollama (local)',
    // OpenAI-compatible endpoint of a locally-running Ollama daemon.
    // Override host via VITE_OLLAMA_HOST or chat_prefs.ollama_host.
    baseUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OLLAMA_HOST
      ? import.meta.env.VITE_OLLAMA_HOST.replace(/\/+$/, '')
      // 127.0.0.1, NOT localhost.
      //
      // `ollama serve` binds 127.0.0.1 — IPv4 only, as its own startup line
      // says: "listen tcp 127.0.0.1:11434". On Windows 11 `localhost` resolves
      // to ::1 (IPv6) FIRST, so the browser stack tries the v6 loopback,
      // nothing is listening there, and the connection is refused. The failure
      // surfaces as a plain network error, which the app then reported as
      // "network or CORS proxy issue" — so a perfectly healthy daemon with
      // four models pulled looked like an unreachable provider.
      : 'http://127.0.0.1:11434') + '/v1',
    models: [],             // filled live from /v1/models (Ollama serves it keyless)
    default: '',
    publicModels: true,     // no API key — the daemon is on the user's machine
    noKey: true,
    isOllama: true,
    isLocal: true,
    offlineReady: true,
    keyUrl: 'https://ollama.com/download',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [],
    default: '',
    preferred: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [],
    default: '',
    preferred: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    keyUrl: 'https://console.groq.com',
  },
  openrouter: {
    name: 'OpenRouter (100+ models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    default: '',
    // Unlike every other provider here, OpenRouter had no curated list at
    // all — with `default` empty, testProvider's no-model fallback picks the
    // ALPHABETICALLY-FIRST of OpenRouter's 100+ live models (many paid-only,
    // deprecated, or moderation/embedding models), so a fresh key's very
    // first ping could land on a dead one. Free-tier-first, known-reliable.
    preferred: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'deepseek/deepseek-chat:free',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-haiku',
    ],
    keyUrl: 'https://openrouter.ai/keys',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [],
    default: '',
    preferred: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [],
    default: '',
    preferred: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    keyUrl: 'https://console.anthropic.com/settings/api-keys',
    isAnthropic: true,
    needsProxy: true,
  },
  xai: {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    models: [],
    default: '',
    preferred: ['grok-3-mini', 'grok-3', 'grok-2-1212'],
    keyUrl: 'https://console.x.ai/',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [],
    default: '',
    preferred: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  mistral: {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [],
    default: '',
    preferred: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  perplexity: {
    name: 'Perplexity (Web-grounded)',
    baseUrl: 'https://api.perplexity.ai',
    models: [],
    default: '',
    preferred: ['sonar', 'sonar-pro', 'sonar-reasoning'],
    keyUrl: 'https://www.perplexity.ai/settings/api',
  },
  cohere: {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    models: [],
    default: '',
    preferred: ['command-r-plus', 'command-r7b-12-2024'],
    keyUrl: 'https://dashboard.cohere.com/api-keys',
  },
}

// Custom providers merged at runtime
let _customProviders = {}
export function registerCustomProviders(custom) { _customProviders = custom || {} }
export function getProviders() { return { ...PROVIDERS, ..._customProviders } }
export function getProviderModels(providerId) { return getProviders()[providerId]?.models || [] }
export function getDefaultModel(providerId) { return getProviders()[providerId]?.default || '' }
// The RAW built-in table, bypassing custom_providers overrides. Saving a
// provider via Quick Add (addProvider in api.js) can reuse a built-in id
// (e.g. 'nvidia') and thereby SHADOW its curated `preferred` model list —
// getProviders()[id] would then return the custom override, which has none.
// This is the one place that still gets the original curated list so it can
// be carried forward into the saved custom record instead of being lost.
export function getBuiltinProvider(id) { return PROVIDERS[id] || null }

export function normalizeModelName(m) {
  if (!m) return ''
  if (typeof m === 'string') {
    const trimmed = m.trim()
    return trimmed === '[object Object]' ? '' : trimmed
  }
  if (typeof m === 'object') {
    if (typeof m.id === 'string' && m.id.trim() && m.id !== '[object Object]') return m.id.trim()
    if (typeof m.name === 'string' && m.name.trim() && m.name !== '[object Object]') return m.name.trim()
    if (typeof m.model === 'string' && m.model.trim() && m.model !== '[object Object]') return m.model.trim()
    if (typeof m.value === 'string' && m.value.trim() && m.value !== '[object Object]') return m.value.trim()
  }
  const str = String(m || '').trim()
  return str === '[object Object]' ? '' : str
}

/**
 * Smart fetch — direct for CORS-friendly providers, proxied via /api/llm-proxy for others.
 * On localhost: Vite dev server proxy handles /api/llm-proxy.
 * On production: Firebase Cloud Function handles /api/llm-proxy.
 */
// Cloudflare Worker URL (VITE_LLM_PROXY_BASE). Empty → same-origin /api/llm-proxy,
// which the Vite plugin serves in dev.
// Guarded (not a bare `import.meta.env.X`): this file is also imported by the
// standalone MCP server (mcp-server/server.mjs) under plain Node, where
// import.meta.env does not exist at all — an unguarded read threw before
// this module could finish loading, taking every tool that transitively
// imports it (moretools' thesaurus/country_info via tools/http.js) down
// with it. Same guard style already used a few lines up for the Ollama
// baseUrl.
const PROXY_BASE = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LLM_PROXY_BASE) || '').replace(/\/+$/, '')
const isLocalhost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)

/** Extract clean, human-readable message from JSON API errors */
export function parseProviderError(status, rawText) {
  try {
    const data = JSON.parse(rawText)
    const msg = data.error?.message || data.error?.detail || data.message || data.detail || (typeof data.error === 'string' ? data.error : null)
    if (msg) return msg
  } catch { /* not JSON */ }
  return rawText ? `${status}: ${rawText.slice(0, 300)}` : `Provider request failed (${status})`
}

/** Private proxy we control: Vite dev plugin on localhost, Worker in prod. */
export function getProxyEndpoint() {
  if (isLocalhost) return '/api/llm-proxy'
  return PROXY_BASE || null
}

export function proxyAvailable() { return true }

// In the Electron desktop app the main process strips CORS for provider hosts,
// so the renderer calls providers DIRECTLY (no Cloudflare worker needed) — the
// same model native desktop AI apps use. This removes the desktop dependency on
// a deployed proxy + a baked-in VITE_LLM_PROXY_BASE.
const isElectron = typeof window !== 'undefined' && !!window.__YOGATIK_ELECTRON__
const isNvidiaHost = (url) => typeof url === 'string' && url.includes('://integrate.api.nvidia.com')

// Nothing should hang forever: a stalled proxy or provider previously left the
// UI on "Connecting…" with no way out but the Stop button.
// Increased to 300s for complex multi-tool tasks; can be overridden per call.
const REQUEST_TIMEOUT = 300_000

function withTimeout(options, ms = REQUEST_TIMEOUT) {
  const timeout = AbortSignal.timeout(ms)
  const signal = options?.signal
    ? (AbortSignal.any ? AbortSignal.any([options.signal, timeout]) : options.signal)
    : timeout
  return { ...options, signal }
}

async function smartFetch(url, rawOptions, prov, timeoutMs) {
  const options = withTimeout(rawOptions, timeoutMs)
  // Desktop: always direct (main process handles CORS).
  if (isElectron) return fetch(url, options)

  const endpoint = getProxyEndpoint()

  // Providers known to block browser CORS directly (like NVIDIA NIM and Anthropic) must go through proxy
  const requiresProxy = Boolean(
    prov?.needsProxy ||
    prov?.isAnthropic ||
    isNvidiaHost(url) ||
    (typeof url === 'string' && (url.includes('integrate.api.nvidia.com') || url.includes('api.anthropic.com'))) ||
    (prov?.baseUrl && (prov.baseUrl.includes('integrate.api.nvidia.com') || prov.baseUrl.includes('api.anthropic.com')))
  )

  if (requiresProxy) {
    if (!endpoint) throw new Error('This provider requires the CORS proxy, which is not configured.')
    return fetch(endpoint, { ...options, headers: { ...options.headers, 'X-Target-URL': url } })
  }

  // Try direct fetch first for CORS-compliant providers
  try {
    return await fetch(url, options)
  } catch (directErr) {
    // If user cancelled, don't fallback to proxy
    if (directErr?.name === 'AbortError' || options.signal?.aborted) throw directErr

    // If direct browser fetch failed (e.g. CORS preflight blocked on custom provider endpoint)
    // and proxy is configured, seamlessly fallback to proxy
    if (endpoint) {
      try {
        return await fetch(endpoint, { ...options, headers: { ...options.headers, 'X-Target-URL': url } })
      } catch (proxyErr) {
        if (proxyErr?.name === 'AbortError' || options.signal?.aborted) throw proxyErr
      }
    }
    throw directErr
  }
}

/**
 * Retry on rate limits, gateway timeouts (524), and transient upstream failures.
 * Honours Retry-After when present, else exponential backoff with jitter.
 */
// 520/522/524 are Cloudflare edge errors: the worker could not get a timely
// response from the provider. Worth retrying — free-tier model cold starts
// routinely blow past the 100s edge timeout on the first request of the day.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 520, 522, 524])

async function fetchWithRetry(url, options, prov, { retries = 3, onStatus, timeoutMs = REQUEST_TIMEOUT } = {}) {
  let attempt = 0
  for (;;) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)

    // Combine caller signal + timeout signal
    let combinedSignal = controller.signal
    if (options?.signal) {
      if (options.signal.aborted) { clearTimeout(timer); throw options.signal.reason }
      combinedSignal = AbortSignal.any([options.signal, controller.signal])
    }

    try {
      const resp = await smartFetch(url, { ...options, signal: combinedSignal }, prov)
      clearTimeout(timer)
      if (!RETRY_STATUS.has(resp.status) || attempt >= retries || options?.signal?.aborted) return resp

      const header = Number(resp.headers.get('retry-after'))
      const backoff = Number.isFinite(header) && header > 0
        ? Math.min(header * 1000, 30000)
        : Math.min(2 ** attempt * 1000, 8000) + Math.random() * 500

      attempt++
      onStatus?.(resp.status === 429
        ? `Rate limited — retrying in ${Math.ceil(backoff / 1000)}s (${attempt}/${retries})`
        : `Provider error ${resp.status} — retrying (${attempt}/${retries})`)

      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, backoff)
        options?.signal?.addEventListener(
          'abort',
          () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) },
          { once: true },
        )
      })
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError' || options?.signal?.aborted) throw err
      if (attempt < retries) {
        attempt++
        onStatus?.(`Connection issue (${err.message || 'retrying'}) — retry ${attempt}/${retries}…`)
        await new Promise(resolve => setTimeout(resolve, Math.min(2 ** attempt * 1000, 5000)))
        continue
      }
      throw err
    }
  }
}

export async function streamChat({
  provider, apiKey, model, messages, tools = null,
  temperature = 1.0, maxTokens = null, signal, onToken, onToolCall, onDone, onError, onStatus,
  retriedWithoutTools = false, onToolsRejected = null, retriedFixedTemp = false, retriedOmitTemp = false,
  retriedContextTrim = false,
  providerOptions = null, responseFormat = null,
}) {
  const prov = getProviders()[provider]
  if (!prov) throw new Error(`Unknown provider: ${provider}`)

  const cleanModel = normalizeModelName(model) || normalizeModelName(prov.default) || normalizeModelName(prov.preferred?.[0]) || (typeof prov.models?.[0] === 'string' ? prov.models[0] : '')

  // On-device WebGPU inference never touches the network or a key.
  if (provider === 'local') {
    const { streamLocal } = await import('./localLLM')
    return streamLocal({ model: cleanModel, messages, temperature, tools, signal, onToken, onToolCall, onDone, onError, onStatus })
  }

  // Chrome's built-in Gemini Nano — also never touches the network or a key,
  // and unlike `local` costs this app zero download bytes.
  if (provider === 'chromeai') {
    const { streamChromeAI } = await import('./chromeAI')
    return streamChromeAI({ model: cleanModel, messages, temperature, tools, signal, onToken, onToolCall, onDone, onError, onStatus })
  }

  const headers = { 'Content-Type': 'application/json' }
  if (prov.isAnthropic) {
    // Anthropic uses x-api-key instead of Bearer, plus version and browser access headers
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (apiKey || !prov.noKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://yogatik.app'
    headers['X-Title'] = 'Yogatik'
  }

  const isNoTempModel = /(^|\/)(o[13](-mini|-preview)?|deepseek-r1|gpt-4o-realtime)/i.test(cleanModel)
  const isReasoningModel = /(^|\/)(o[13](-mini|-preview)?|nemotron-.*ultra|deepseek-r1)/i.test(cleanModel)
  const shouldOmitTemp = retriedOmitTemp || isNoTempModel
  const isFixedTemp = (isReasoningModel && !shouldOmitTemp) || retriedFixedTemp

  let endpoint = `${prov.baseUrl}/chat/completions`
  const body = {
    model: cleanModel,
    messages,
    stream: true,
  }

  if (shouldOmitTemp) {
    // Model route rejects the temperature parameter completely
  } else if (isFixedTemp) {
    body.temperature = 1.0
  } else {
    body.temperature = Math.max(0.2, temperature)
    body.top_p = 0.95
  }

  if (maxTokens && Number.isFinite(maxTokens)) {
    body.max_tokens = maxTokens
    if (provider === 'openai' || isReasoningModel) body.max_completion_tokens = maxTokens
  }

  // Add mild anti-repetition penalty for standard OpenAI/NVIDIA endpoints to prevent N-gram degeneration loops
  // (Skip for reasoning models or routes that reject sampling parameters)
  if (!prov.isAnthropic && !prov.baseUrl.includes('anthropic') && !isFixedTemp && !shouldOmitTemp) {
    body.presence_penalty = 0.05
    body.frequency_penalty = 0.05
  }

  if (prov.isAnthropic) {
    endpoint = `${prov.baseUrl}/messages`
    body.max_tokens = (maxTokens && Number.isFinite(maxTokens)) ? maxTokens : 4096
    let systemPrompt = ''
    const anthropicMessages = []
    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + m.content
      } else {
        anthropicMessages.push(m)
      }
    }
    // Enable Anthropic prompt caching: mark system prompt block with ephemeral cache_control
    if (systemPrompt) {
      body.system = [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ]
    }
    body.messages = anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: 'hello' }]
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    // NVIDIA (needsProxy) rejects the tool_choice field with a 400.
    // All other providers accept "auto" fine, so only send it for those.
    if (!prov.needsProxy && !prov.isAnthropic) body.tool_choice = 'auto'
  }

  // Provider-specific options (e.g., Anthropic thinking, OpenAI reasoning)
  if (providerOptions && typeof providerOptions === 'object') {
    Object.assign(body, providerOptions)
  }

  // Structured output (JSON mode)
  if (responseFormat && typeof responseFormat === 'object') {
    body.response_format = responseFormat
  }

  try {
    const resp = await fetchWithRetry(endpoint, {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    }, prov, { onStatus })

    if (!resp.ok) {
      const err = await resp.text()
      const displayModelName = cleanModel || prov.name || provider

      // A renamed/withdrawn model 400s (NVIDIA does not 404 it). Surface it as
      // a model error so the caller prunes it — NOT as "tools rejected", which
      // would waste a second call in prompted mode on the same dead model.
      const modelGone = resp.status === 400 &&
        /does not exist|not found|unknown model|invalid model|no such model|no models provided/i.test(err) &&
        /model/i.test(err)
      if (modelGone) {
        onError?.(new Error(
          `"${displayModelName}" not found or unavailable. ${err.slice(0, 200)}`
        ))
        return
      }

      // Many models simply do not accept a `tools` array and answer 400.
      // Tell the caller so it can fall back to prompted tool calling, which
      // keeps the tools working instead of dropping them.
      if (resp.status === 400 && tools?.length && !retriedWithoutTools) {
        // onDone must still fire — the caller awaits it before retrying.
        if (onToolsRejected) { onToolsRejected(); onDone?.(); return }
        return streamChat({
          provider, apiKey, model: cleanModel, messages, tools: null,
          temperature, signal, onToken, onToolCall, onDone, onError, onStatus,
          retriedWithoutTools: true,
          retriedFixedTemp,
        })
      }
      // 1. Certain models or provider routes strictly forbid the temperature parameter
      // (e.g. "The parameter 'temperature' is not supported by this model route. Remove the field...")
      const isOmitTempError = /temperature.*(not supported|remove the field)|(not supported|remove the field).*temperature/i.test(err)
      if (resp.status === 400 && isOmitTempError && !retriedOmitTemp) {
        return streamChat({
          provider, apiKey, model: cleanModel, messages, tools,
          temperature, signal, onToken, onToolCall, onDone, onError, onStatus,
          retriedWithoutTools, onToolsRejected,
          retriedFixedTemp,
          retriedOmitTemp: true,
        })
      }

      // 2. Certain reasoning models/routes strictly enforce temperature: 1.0 (between 1.0 and 1.0)
      const isFixedTempError = /temperature.*(supported.*between 1|only supports 1\.0)|unsupported.*value.*temperature/i.test(err)
      if (resp.status === 400 && isFixedTempError && !retriedFixedTemp) {
        return streamChat({
          provider, apiKey, model: cleanModel, messages, tools,
          temperature: 1.0, signal, onToken, onToolCall, onDone, onError, onStatus,
          retriedWithoutTools, onToolsRejected,
          retriedFixedTemp: true,
          retriedOmitTemp,
        })
      }

      // 3. Model context window or completion token limit exceeded (e.g. NVIDIA NIM's "Please reduce the length of the messages or completion.")
      const isContextLimitError = resp.status === 400 &&
        /reduce the length of the messages or completion|reduce the length|context_length_exceeded|maximum context length|too long.*token/i.test(err)
      if (isContextLimitError && !retriedContextTrim) {
        onStatus?.('⚠️ Context boundary reached — auto-trimming history & retrying…')
        const trimmed = messages?.length > 2
          ? [messages[0], messages[messages.length - 1]]
          : messages
        return streamChat({
          provider, apiKey, model: cleanModel, messages: trimmed, tools,
          temperature, signal, onToken, onToolCall, onDone, onError, onStatus,
          retriedWithoutTools, onToolsRejected,
          retriedFixedTemp,
          retriedOmitTemp,
          retriedContextTrim: true,
          maxTokens: maxTokens || null,
          providerOptions, responseFormat,
        })
      }

      if (resp.status === 400) {
        const parsed = parseProviderError(resp.status, err)
        onError?.(new Error(parsed.length > 20 ? parsed : `"${displayModelName}" rejected the request (400): ${parsed}`))
        return
      }
      if (resp.status === 404) {
        onError?.(new Error(
          `The provider does not serve "${displayModelName}" on its chat endpoint (404). ` +
          `It may be a base (non-chat) model or recently withdrawn. Pick another model.`
        ))
        return
      }
      if (resp.status === 503) {
        onError?.(new Error(
          `The provider is temporarily overloaded or undergoing maintenance (503 Service Unavailable). ` +
          `Please switch to another model like LLaMA 3.3 70B or retry in a moment.`
        ))
        return
      }
      if ([500, 502, 504, 520, 522, 524].includes(resp.status)) {
        onError?.(new Error(
          `The provider encountered a server error (${resp.status}). Large models on free tiers ` +
          `can experience cold-starts or capacity spikes. Try a smaller/faster model like LLaMA 3.3 70B.`
        ))
        return
      }
      onError?.(new Error(parseProviderError(resp.status, err)))
      return
    }

    // Guard: a misconfigured proxy returns index.html with 200 — detect it
    // instead of silently yielding an empty answer.
    const ctype = resp.headers.get('content-type') || ''
    if (ctype.includes('text/html')) {
      onError?.(new Error(`LLM proxy misconfigured — ${getProxyEndpoint()} returned HTML instead of a stream.`))
      return
    }
    if (!resp.body) { onError?.(new Error('Empty response body from provider')); return }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let toolCalls = {}
    let sawData = false
    // Per-stream: wraps the provider's separate reasoning channel in <think>.
    const reasoningTagger = createReasoningTagger()

    // 90s between-chunk watchdog: 30s was too aggressive on iOS/mobile where
    // background throttling can hold the stream for 60-90s mid-response without
    // the provider actually stalling. Status nudges at 30s and 60s so the user
    // sees "Still working…" instead of a blank spinner.
    const STREAM_CHUNK_TIMEOUT_MS = 90000
    while (true) {
      // Chunk-stall watchdog: aborts if provider connection freezes mid-stream
      let chunkTimer, nudge30, nudge60
      const chunkPromise = new Promise((_, reject) => {
        nudge30 = setTimeout(() => onStatus?.('⏳ Still working — waiting for the model…'), 30000)
        nudge60 = setTimeout(() => onStatus?.('⏳ Still working — large model responding, please wait…'), 60000)
        chunkTimer = setTimeout(() => {
          const err = new Error('Stream stalled — no tokens received from provider for 90s. Try regenerating or choosing a faster model.')
          err.name = 'TimeoutError'
          reject(err)
        }, STREAM_CHUNK_TIMEOUT_MS)
      })

      const readPromise = reader.read().finally(() => {
        clearTimeout(chunkTimer)
        clearTimeout(nudge30)
        clearTimeout(nudge60)
      })
      const { done, value } = await Promise.race([readPromise, chunkPromise])
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const raw of lines) {
        const line = raw.trim()                       // strips \r from CRLF streams
        if (!line.startsWith('data:')) continue       // some providers omit the space
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        sawData = true
        try {
          const parsed = JSON.parse(payload)
          const delta = parsed.choices?.[0]?.delta

          // Reasoning channel FIRST. Reasoning models stream their scratch-work
          // in a SEPARATE field — reasoning_content on DeepSeek/NVIDIA,
          // reasoning on OpenRouter, thinking_delta on Anthropic. Reading only
          // delta.content discarded all of it, so the Thinking panel stayed
          // empty for exactly the models that reason most. The tagger wraps it
          // in <think> so splitReasoning handles it everywhere, instead of
          // teaching every consumer about a second channel.
          const reasonDelta = delta?.reasoning_content ?? delta?.reasoning
            ?? (parsed.type === 'thinking_delta' ? parsed.delta?.thinking : null)
          if (reasonDelta) {
            const out = reasoningTagger.reasoning(reasonDelta)
            if (out) onToken?.(out)
          }

          // Content token (OpenAI delta or Anthropic text_delta)
          if (delta?.content) {
            const out = reasoningTagger.content(delta.content)
            if (out) onToken?.(out)
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            const out = reasoningTagger.content(parsed.delta.text)
            if (out) onToken?.(out)
          }

          // Streaming tool calls (OpenAI/Groq/OpenRouter format)
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || `call_${idx}`, name: tc.function?.name || '', arguments: '' }
              }
              if (tc.function?.name) toolCalls[idx].name = tc.function.name
              if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
            }
          }
        } catch {
          // Skip unparseable SSE lines
        }
      }
    }

    // Guard: if stream completed without ANY data events, provider returned empty stream
    if (!sawData) {
      onError?.(new Error('Provider returned no stream data — check model name and API key.'))
      return
    }

    const remaining = Object.values(toolCalls).filter(tc => tc.name)
    for (const tc of remaining) {
      try { tc.parsedArgs = JSON.parse(tc.arguments) } catch { tc.parsedArgs = {} }
      onToolCall?.(tc)
    }

    // A reply that was ALL reasoning leaves the block open; close it so the
    // consumer sees reasoning rather than a half-open tag.
    const tail = reasoningTagger.end()
    if (tail) onToken?.(tail)

    onDone?.()
  } catch (err) {
    if (err.name === 'TimeoutError') {
      onError?.(new Error(`No response after ${REQUEST_TIMEOUT / 1000}s — the provider or proxy is not responding. Try a smaller model.`))
    } else if (err.name === 'AbortError') {
      // Stop was pressed. onDone MUST still fire: the agent awaits this promise
      // and swallowing the abort left the whole turn (and the UI) hanging.
      onDone?.()
    } else {
      onError?.(err)
    }
  }
}

/** Non-streaming completion (for tool result processing) */
export async function chatComplete({ provider, apiKey, model, messages, tools, temperature = 0.7, maxTokens, timeoutMs = REQUEST_TIMEOUT, retries }) {
  const prov = getProviders()[provider]
  const cleanModel = normalizeModelName(model) || normalizeModelName(prov?.default) || normalizeModelName(prov?.preferred?.[0]) || (typeof prov?.models?.[0] === 'string' ? prov.models[0] : '')
  const headers = { 'Content-Type': 'application/json' }
  if (prov?.isAnthropic) {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (apiKey || !prov?.noKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://yogatik.app'
    headers['X-Title'] = 'Yogatik'
  }
  const isNoTempModel = /(^|\/)(o[13](-mini|-preview)?|deepseek-r1|gpt-4o-realtime)/i.test(cleanModel)
  const isReasoningModel = /(^|\/)(o[13](-mini|-preview)?|nemotron-.*ultra|deepseek-r1)/i.test(cleanModel)
  let endpoint = `${prov.baseUrl}/chat/completions`
  const body = { model: cleanModel, messages }
  if (isNoTempModel) {
    // Model route rejects the temperature parameter completely
  } else if (isReasoningModel) {
    body.temperature = 1.0
  } else {
    body.temperature = temperature
  }
  if (maxTokens) {
    body.max_tokens = maxTokens
    if (provider === 'openai' || isReasoningModel) body.max_completion_tokens = maxTokens
  }
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto' }

  if (prov?.isAnthropic) {
    endpoint = `${prov.baseUrl}/messages`
    body.max_tokens = maxTokens || 1024
    let systemPrompt = ''
    const anthropicMessages = []
    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + m.content
      } else {
        anthropicMessages.push(m)
      }
    }
    if (systemPrompt) {
      body.system = [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ]
    }
    body.messages = anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: 'hello' }]
  }

  const resp = await fetchWithRetry(endpoint, {
    method: 'POST', headers, body: JSON.stringify(body),
  }, prov, { timeoutMs, retries })
  if (!resp.ok) {
    const raw = await resp.text()
    const isOmitTempError = /temperature.*(not supported|remove the field)|(not supported|remove the field).*temperature/i.test(raw)
    const isFixedTempError = /temperature.*(supported.*between 1|only supports 1\.0)|unsupported.*value.*temperature/i.test(raw)
    if (resp.status === 400 && isOmitTempError && body.temperature !== undefined) {
      delete body.temperature
      delete body.top_p
      delete body.presence_penalty
      delete body.frequency_penalty
      const retryResp = await fetchWithRetry(endpoint, {
        method: 'POST', headers, body: JSON.stringify(body),
      }, prov, { timeoutMs, retries })
      if (retryResp.ok) return retryResp.json()
    } else if (resp.status === 400 && isFixedTempError && body.temperature !== 1.0) {
      body.temperature = 1.0
      delete body.top_p
      delete body.presence_penalty
      delete body.frequency_penalty
      const retryResp = await fetchWithRetry(endpoint, {
        method: 'POST', headers, body: JSON.stringify(body),
      }, prov, { timeoutMs, retries })
      if (retryResp.ok) return retryResp.json()
    }
    throw new Error(parseProviderError(resp.status, raw))
  }
  const data = await resp.json()
  if (prov?.isAnthropic && data.content?.[0]?.text) {
    return { choices: [{ message: { content: data.content[0].text } }], model: data.model }
  }
  return data
}

const INFLIGHT_MODELS = new Map()

/**
 * Fetch available models dynamically from provider's /v1/models endpoint.
 * Providers flagged `publicModels` (NVIDIA) work without a key.
 * Loads all models exposed by the provider.
 */
export async function fetchLiveModels(providerId, apiKey) {
  const prov = getProviders()[providerId]
  // Keyless providers (Ollama, on-device) don't need an API key.
  // For keyed providers, bail early if no key is supplied.
  const isKeyless = prov?.noKey || prov?.isOllama || prov?.isLocal
  if (!prov) return []
  if (!isKeyless && !apiKey) return []

  const dedupeKey = `${providerId}:${isKeyless ? 'keyless' : (apiKey || '').slice(0, 8)}`
  if (INFLIGHT_MODELS.has(dedupeKey)) {
    return INFLIGHT_MODELS.get(dedupeKey)
  }

  const p = (async () => {
    try {
      const headers = {}
      if (prov.isAnthropic) {
        if (apiKey) headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
      if (providerId === 'openrouter' || prov.baseUrl?.includes('openrouter')) {
        headers['HTTP-Referer'] = 'https://yogatik.app'
        headers['X-Title'] = 'Yogatik'
      }

      // Use a short timeout for local daemons — fail fast if Ollama isn't running
      const timeoutMs = isKeyless ? 4000 : 20000
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const targetUrl = `${prov.baseUrl.replace(/\/+$/, '')}/models`
      let resp
      try {
        resp = await smartFetch(targetUrl, { method: 'GET', headers, signal: controller.signal }, prov)
      } finally {
        clearTimeout(timer)
      }
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        const msg = parseProviderError(resp.status, errText)
        console.warn(`[fetchLiveModels] ${providerId} returned ${resp.status}:`, msg)
        return []
      }

      const contentType = resp.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) return []

      const data = await resp.json()
      const modelList = data.data || data.models || []
      const ids = [...new Set(modelList.map(m => normalizeModelName(m)).filter(id => id && id.length > 0 && id !== '[object Object]'))]
        .sort((a, b) => a.localeCompare(b))
      return ids
    } catch (err) {
      console.warn(`[fetchLiveModels] ${providerId} error:`, err?.message)
      return []
    }
  })().finally(() => {
    INFLIGHT_MODELS.delete(dedupeKey)
  })

  INFLIGHT_MODELS.set(dedupeKey, p)
  return p
}

/**
 * Query provider's /models endpoint with explicit error reporting.
 * Useful for validating an API key and fetching models when saving a provider.
 */
export async function queryProviderModels(providerId, apiKey, customProv = null) {
  const prov = customProv || getProviders()[providerId]
  if (!prov) return { success: false, error: 'Provider configuration not found.' }
  const isKeyless = prov.noKey || prov.isOllama || prov.isLocal
  if (!isKeyless && !apiKey) return { success: false, error: 'Please enter an API key.' }

  try {
    const headers = {}
    if (prov.isAnthropic) {
      if (apiKey) headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    } else if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    if (providerId === 'openrouter' || prov.name?.toLowerCase().includes('openrouter') || prov.baseUrl?.includes('openrouter')) {
      headers['HTTP-Referer'] = 'https://yogatik.app'
      headers['X-Title'] = 'Yogatik'
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), isKeyless ? 5000 : 20000)
    const targetUrl = `${prov.baseUrl.replace(/\/+$/, '')}/models`

    let resp
    try {
      resp = await smartFetch(targetUrl, { method: 'GET', headers, signal: controller.signal }, prov)
    } finally {
      clearTimeout(timer)
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      const msg = parseProviderError(resp.status, errText)
      return { success: false, error: msg || `Provider returned status ${resp.status}` }
    }

    const data = await resp.json().catch(() => null)
    if (!data) return { success: false, error: 'Invalid response from provider (expected JSON).' }

    const modelList = data.data || data.models || []
    const ids = [...new Set(modelList.map(m => normalizeModelName(m)).filter(id => id && id.length > 0 && id !== '[object Object]'))]
      .sort((a, b) => a.localeCompare(b))

    if (!ids.length) {
      return { success: false, error: 'Provider connected but returned 0 models.' }
    }

    return { success: true, models: ids, defaultModel: ids[0] }
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Connection timed out while fetching models.' : (err?.message || 'Network error')
    return { success: false, error: msg }
  }
}

/**
 * Preconnect and prefetch DNS for the active LLM provider endpoint
 * to eliminate 60-150ms handshake latency on user prompt submission.
 */
export function preconnectProvider(providerId) {
  if (typeof document === 'undefined' || !providerId) return
  const prov = PROVIDERS[providerId]
  if (!prov?.baseUrl || !prov.baseUrl.startsWith('http')) return
  try {
    const origin = new URL(prov.baseUrl).origin
    if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return
    const link1 = document.createElement('link')
    link1.rel = 'preconnect'
    link1.href = origin
    link1.crossOrigin = 'anonymous'
    const link2 = document.createElement('link')
    link2.rel = 'dns-prefetch'
    link2.href = origin
    document.head.appendChild(link1)
    document.head.appendChild(link2)
  } catch {}
}

/**
 * Classify user prompt intent into performance/cost profiles:
 * - 'vision': Attached image/video or explicit visual analysis query
 * - 'code': Code blocks, programming syntax, git/terminal commands
 * - 'reasoning': Complex math, logic puzzles, multi-step proofs, architecture design
 * - 'speed': Greetings, translations, short summaries, grammar fixes
 * - 'general': Standard queries
 */
export function classifyQueryIntent(prompt = '', attachments = [], hasTools = false) {
  if (attachments?.length > 0 || /\b(look at this (image|picture|screenshot)|what is in this (image|photo))\b/i.test(prompt)) {
    return 'vision'
  }

  const p = String(prompt || '').trim()

  const codePatterns = [
    /```[\s\S]*?```/,
    /\b(function|const|let|var|class|import|def|return|async|await|git\s+(commit|push|pull|merge|branch)|npm\s+(run|install)|docker|kubernetes|sql|select\s+.*from|regex|typescript|javascript|python|react)\b/i,
    /\b(write\s+(a\s+)?(function|script|component|hook|test|regex)|debug|refactor|fix\s+this\s+error|syntax\s+error)\b/i,
    /(\{|\}\s*;|\(\)\s*=>|System\.out|console\.log|println)/,
  ]
  if (codePatterns.some(rx => rx.test(p))) {
    return 'code'
  }

  const reasoningPatterns = [
    /\b(prove that|derive|step[- ]by[- ]step proof|solve for x|integral of|derivative of|bayes|nash equilibrium)\b/i,
    /\b(architectural trade-offs|distributed consensus|raft algorithm|byzantine|formal verification)\b/i,
    /\b(think deeply|analyze all consequences|compare and contrast in-depth)\b/i,
  ]
  if (reasoningPatterns.some(rx => rx.test(p))) {
    return 'reasoning'
  }

  const speedPatterns = [
    /^(hi|hello|hey|yo|greetings|good\s+(morning|afternoon|evening))\b/i,
    /^(summarize|tldr|translate\s+(this|to)|fix\s+grammar|spellcheck)\b/i,
    /\b(what time is it|who is|define\s+[a-z]+|synonym for)\b/i,
  ]
  if (p.length < 80 && speedPatterns.some(rx => rx.test(p))) {
    return 'speed'
  }

  return 'general'
}

/**
 * Returns optimal provider & model candidate recommendations for a given intent.
 * Prioritizes providers configured and ready with keys.
 * @param {string} intent
 * @param {Record<string, string>} configuredKeys - map of providerId -> apiKey
 * @param {string} currentProvider
 * @param {string} currentModel
 */
export function getSuggestedRoute(intent, configuredKeys = {}, currentProvider = '', currentModel = '') {
  const isReady = (p) => !!configuredKeys[p] || p === 'local' || p === 'ollama'

  const intentPicks = {
    vision: [
      { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Ultra-fast Vision)' },
      { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o (High-Fidelity Vision)' },
      { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    ],
    code: [
      { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (Premier Coding)' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Groq Llama 3.3 70B (Fast Coding)' },
      { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct', label: 'NVIDIA Llama 3.3 70B' },
      { provider: 'deepseek', model: 'deepseek-chat', label: 'DeepSeek V3' },
      { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
    ],
    reasoning: [
      { provider: 'deepseek', model: 'deepseek-reasoner', label: 'DeepSeek R1 Reasoner' },
      { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet (Thinking)' },
      { provider: 'openai', model: 'o4-mini', label: 'OpenAI o-series' },
      { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
    speed: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Groq (Sub-second speed)' },
      { provider: 'nvidia', model: 'meta/llama-3.1-8b-instruct', label: 'NVIDIA Llama 3.1 8B (Free Instant)' },
      { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    general: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Groq Llama 3.3 70B' },
      { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct', label: 'NVIDIA Llama 3.3 70B' },
    ]
  }

  const candidateList = intentPicks[intent] || intentPicks.general

  for (const c of candidateList) {
    if (isReady(c.provider)) {
      const isAlreadyUsing = c.provider === currentProvider && c.model === currentModel
      return {
        intent,
        recommended: c,
        isAlreadyUsing,
        shouldSwitch: !isAlreadyUsing,
      }
    }
  }

  return {
    intent,
    recommended: null,
    isAlreadyUsing: true,
    shouldSwitch: false,
  }
}


