/**
 * Browser-native LLM client — calls Gemini/Groq/OpenRouter/OpenAI directly,
 * proxies non-CORS providers (NVIDIA etc.) through /api/llm-proxy.
 * API key stored in IndexedDB, never sent to any backend.
 */

import { createReasoningTagger } from './reasoning'

const PROVIDERS = {
  nvidia: {
    name: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [
      // Chat / Instruct models
      'meta/llama-3.3-70b-instruct',
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.1-8b-instruct',
      'meta/llama-3.2-3b-instruct',
      'meta/llama-3.2-1b-instruct',
      'meta/llama-3.2-11b-vision-instruct',
      'meta/llama-3.2-90b-vision-instruct',
      'meta/codellama-70b',
      'meta/llama2-70b',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'nvidia/llama-3.1-nemotron-51b-instruct',
      'nvidia/llama-3.1-nemotron-ultra-253b-v1',
      'nvidia/llama-3.3-nemotron-super-49b-v1',
      'nvidia/llama-3.3-nemotron-super-49b-v1.5',
      'nvidia/llama-3.1-nemotron-nano-8b-v1',
      'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
      'nvidia/nvidia-nemotron-nano-9b-v2',
      'nvidia/nemotron-nano-12b-v2-vl',
      'nvidia/nemotron-3-nano-30b-a3b',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      'nvidia/nemotron-3-super-120b-a12b',
      'nvidia/nemotron-3-ultra-550b-a55b',
      'nvidia/nemotron-4-340b-instruct',
      'nvidia/nemotron-mini-4b-instruct',
      'nvidia/cosmos-reason2-8b',
      'nvidia/mistral-nemo-minitron-8b-8k-instruct',
      'nvidia/ising-calibration-1.5-31b',
      'nvidia/riva-translate-4b-instruct-v2',
      'nvidia/riva-translate-4b-instruct-v1.1',
      'nvidia/riva-translate-4b-instruct',
      'mistralai/mistral-large',
      'mistralai/mistral-large-2-instruct',
      'mistralai/mistral-nemotron',
      'mistralai/mistral-7b-instruct-v0.3',
      'mistralai/codestral-22b-instruct-v0.1',
      'mistralai/mixtral-8x22b-v0.1',
      'nv-mistralai/mistral-nemo-12b-instruct',
      'deepseek-ai/deepseek-coder-6.7b-instruct',
      'google/gemma-4-31b-it',
      'google/gemma-3-12b-it',
      'google/gemma-3-4b-it',
      'google/gemma-2b',
      'google/codegemma-1.1-7b',
      'google/codegemma-7b',
      'google/diffusiongemma-26b-a4b-it',
      'google/recurrentgemma-2b',
      'microsoft/phi-3-vision-128k-instruct',
      'microsoft/phi-3.5-moe-instruct',
      'ibm/granite-3.0-8b-instruct',
      'ibm/granite-3.0-3b-a800m-instruct',
      'ibm/granite-34b-code-instruct',
      'ibm/granite-8b-code-instruct',
      'ai21labs/jamba-1.5-large-instruct',
      '01-ai/yi-large',
      'aisingapore/sea-lion-7b-instruct',
      'databricks/dbrx-instruct',
      'writer/palmyra-creative-122b',
      'writer/palmyra-fin-70b-32k',
      'writer/palmyra-med-70b',
      'writer/palmyra-med-70b-32k',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'moonshotai/kimi-k2.6',
      'stepfun-ai/step-3.7-flash',
      'minimaxai/minimax-m3',
      'z-ai/glm-5.2',
      'poolside/laguna-xs-2.1',
      'thinkingmachines/inkling',
      'zyphra/zamba2-7b-instruct',
      'nvidia/llama3-chatqa-1.5-70b',
      'bigcode/starcoder2-15b',
      // Qwen LLM, Coder, Vision-Language & Reasoning Series
      'qwen/qwen-2.5-72b-instruct',
      'qwen/qwen-2.5-coder-32b-instruct',
      'qwen/qwen-2.5-coder-7b-instruct',
      'qwen/qwen-2.5-vl-72b-instruct',
      'qwen/qwen-2.5-vl-7b-instruct',
      'qwen/qwen2-vl-72b-instruct',
      'qwen/qwen2-vl-7b-instruct',
      'qwen/qwq-32b-preview',
      'qwen/qwen-vl-max',
      // Image Generation & Vision Diffusion Models
      'black-forest-labs/flux.1-schnell',
      'black-forest-labs/flux.1-dev',
      'stabilityai/stable-diffusion-3-medium',
      'stabilityai/sdxl-turbo',
      // Embedding / Safety / Special (available but not typical chat)
      'nvidia/nv-embed-v1',
      'nvidia/nv-embedqa-e5-v5',
      'nvidia/nv-embedqa-mistral-7b-v2',
      'nvidia/nv-embedcode-7b-v1',
      'nvidia/embed-qa-4',
      'nvidia/nemotron-3-embed-1b',
      'nvidia/llama-nemotron-embed-1b-v2',
      'nvidia/llama-nemotron-embed-vl-1b-v2',
      'nvidia/llama-3.2-nv-embedqa-1b-v1',
      'nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1',
      'nvidia/nvclip',
      'nvidia/neva-22b',
      'nvidia/vila',
      'nvidia/nemotron-4-340b-reward',
      'nvidia/nemotron-3.5-content-safety',
      'nvidia/llama-3.1-nemoguard-8b-content-safety',
      'nvidia/llama-3.1-nemoguard-8b-topic-control',
      'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
      'meta/llama-guard-4-12b',
      'nvidia/ai-synthetic-video-detector',
      'nvidia/nemoretriever-parse',
      'nvidia/nemotron-parse',
      'google/deplot',
      'microsoft/kosmos-2',
      'adept/fuyu-8b',
      'snowflake/arctic-embed-l',
      'baai/bge-m3',
    ],
    default: 'meta/llama-3.3-70b-instruct',
    // Curated known-good, tool-capable free models, best-first. Auto-pick probes
    // these before anything else (intersected with the live catalog, so a
    // withdrawn name is simply skipped) — a fresh key never lands on a weak 4B.
    preferred: [
      'meta/llama-3.1-8b-instruct',
      'meta/llama-3.3-70b-instruct',
      'openai/gpt-oss-20b',
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
      : 'http://localhost:11434') + '/v1',
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
    preferred: ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    keyUrl: 'https://console.groq.com',
  },
  openrouter: {
    name: 'OpenRouter (100+ models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    default: '',
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
    models: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    default: 'claude-3-5-sonnet-20241022',
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
const PROXY_BASE = (import.meta.env.VITE_LLM_PROXY_BASE || '').replace(/\/+$/, '')
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
  // Desktop: always direct (main process handles CORS). Browser: direct only for
  // CORS-friendly providers; needsProxy hosts go through the worker.
  if (isElectron || !prov?.needsProxy) return fetch(url, options)

  const endpoint = getProxyEndpoint()
  if (!endpoint) throw new Error('This provider requires the proxy, which is not configured.')
  try {
    return await fetch(endpoint, { ...options, headers: { ...options.headers, 'X-Target-URL': url } })
  } catch (e) {
    // An intentional abort (barge-in, new turn, Stop) is NOT a proxy failure —
    // rethrow it so the normal abort path handles it silently. Only a real
    // connection error becomes the "proxy unreachable" message.
    if (e?.name === 'AbortError' || options.signal?.aborted) throw e
    // needsProxy hosts (NVIDIA) send no CORS headers, so a direct browser fetch
    // can NEVER succeed — attempting it only sprayed a guaranteed CORS error.
    // Surface the real cause: the proxy/worker is unreachable.
    throw new Error(`Model proxy unreachable (${e?.message || 'connection failed'}). ` +
      `Retry in a moment, or redeploy the Cloudflare worker (deploy-proxy.bat).`)
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
  temperature = 0.7, signal, onToken, onToolCall, onDone, onError, onStatus,
  retriedWithoutTools = false, onToolsRejected = null,
}) {
  const prov = getProviders()[provider]
  if (!prov) throw new Error(`Unknown provider: ${provider}`)

  const cleanModel = normalizeModelName(model) || normalizeModelName(prov.default) || normalizeModelName(prov.preferred?.[0]) || (typeof prov.models?.[0] === 'string' ? prov.models[0] : '')

  // On-device WebGPU inference never touches the network or a key.
  if (provider === 'local') {
    const { streamLocal } = await import('./localLLM')
    return streamLocal({ model: cleanModel, messages, temperature, tools, signal, onToken, onToolCall, onDone, onError, onStatus })
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

  let endpoint = `${prov.baseUrl}/chat/completions`
  const body = {
    model: cleanModel,
    messages,
    temperature: Math.max(0.2, temperature),
    top_p: 0.95,
    stream: true,
  }

  // Add mild anti-repetition penalty for standard OpenAI/NVIDIA endpoints to prevent N-gram degeneration loops
  if (!prov.isAnthropic && !prov.baseUrl.includes('anthropic')) {
    body.presence_penalty = 0.05
    body.frequency_penalty = 0.05
  }

  if (prov.isAnthropic) {
    endpoint = `${prov.baseUrl}/messages`
    body.max_tokens = 4096
    let systemPrompt = ''
    const anthropicMessages = []
    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + m.content
      } else {
        anthropicMessages.push(m)
      }
    }
    if (systemPrompt) body.system = systemPrompt
    body.messages = anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: 'hello' }]
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    // NVIDIA (needsProxy) rejects the tool_choice field with a 400.
    // All other providers accept "auto" fine, so only send it for those.
    if (!prov.needsProxy && !prov.isAnthropic) body.tool_choice = 'auto'
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

    const STREAM_CHUNK_TIMEOUT_MS = 30000 // 30s max wait between chunks
    while (true) {
      // Chunk-stall watchdog: aborts if provider connection freezes mid-stream
      let chunkTimer
      const chunkPromise = new Promise((_, reject) => {
        chunkTimer = setTimeout(() => {
          const err = new Error('Stream stalled — no tokens received from provider for 30s. Try regenerating or choosing a faster model.')
          err.name = 'TimeoutError'
          reject(err)
        }, STREAM_CHUNK_TIMEOUT_MS)
      })

      const readPromise = reader.read().finally(() => clearTimeout(chunkTimer))
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
  let endpoint = `${prov.baseUrl}/chat/completions`
  const body = { model: cleanModel, messages, temperature }
  if (maxTokens) body.max_tokens = maxTokens
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
    if (systemPrompt) body.system = systemPrompt
    body.messages = anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: 'hello' }]
  }

  const resp = await fetchWithRetry(endpoint, {
    method: 'POST', headers, body: JSON.stringify(body),
  }, prov, { timeoutMs, retries })
  if (!resp.ok) {
    const raw = await resp.text()
    throw new Error(parseProviderError(resp.status, raw))
  }
  const data = await resp.json()
  if (prov?.isAnthropic && data.content?.[0]?.text) {
    return { choices: [{ message: { content: data.content[0].text } }], model: data.model }
  }
  return data
}

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

  try {
    const headers = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://yogatik.app'
      headers['X-Title'] = 'Yogatik'
    }

    // Use a short timeout for local daemons — fail fast if Ollama isn't running
    const timeoutMs = isKeyless ? 4000 : 15000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const targetUrl = `${prov.baseUrl}/models`
    let resp
    try {
      resp = await smartFetch(targetUrl, { method: 'GET', headers, signal: controller.signal }, prov)
    } finally {
      clearTimeout(timer)
    }
    if (!resp.ok) return []

    const contentType = resp.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return []

    const data = await resp.json()
    const modelList = data.data || data.models || []
    const ids = [...new Set(modelList.map(m => normalizeModelName(m)).filter(id => id && id.length > 0 && id !== '[object Object]'))]
      .sort((a, b) => a.localeCompare(b))
    return ids
  } catch {
    return []
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

