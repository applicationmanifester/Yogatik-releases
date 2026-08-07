/**
 * Browser-native LLM client — calls Gemini/Groq/OpenRouter/OpenAI directly,
 * proxies non-CORS providers (NVIDIA etc.) through /api/llm-proxy.
 * API key stored in IndexedDB, never sent to any backend.
 */

const PROVIDERS = {
  nvidia: {
    name: 'NVIDIA (Free)',
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
      'nvidia/nemotron-nano-3-30b-a3b',
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
    keyUrl: 'https://build.nvidia.com',
    needsProxy: true,
    publicModels: true, // /v1/models is unauthenticated — live catalog without a key
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
  gemini: {
    name: 'Gemini (Free)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [],
    default: '',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    name: 'Groq (Free)',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [],
    default: '',
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
    keyUrl: 'https://platform.openai.com/api-keys',
  },
}

// Custom providers merged at runtime
let _customProviders = {}
export function registerCustomProviders(custom) { _customProviders = custom || {} }
export function getProviders() { return { ...PROVIDERS, ..._customProviders } }
export function getProviderModels(providerId) { return getProviders()[providerId]?.models || [] }
export function getDefaultModel(providerId) { return getProviders()[providerId]?.default || '' }

/**
 * Smart fetch — direct for CORS-friendly providers, proxied via /api/llm-proxy for others.
 * On localhost: Vite dev server proxy handles /api/llm-proxy.
 * On production: Firebase Cloud Function handles /api/llm-proxy.
 */
// Cloudflare Worker URL (VITE_LLM_PROXY_BASE). Empty → same-origin /api/llm-proxy,
// which the Vite plugin serves in dev.
const PROXY_BASE = (import.meta.env.VITE_LLM_PROXY_BASE || '').replace(/\/+$/, '')
const isLocalhost = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)

/** Private proxy we control: Vite dev plugin on localhost, Worker in prod. */
export function getProxyEndpoint() {
  if (isLocalhost) return '/api/llm-proxy'
  return PROXY_BASE || null
}

export function proxyAvailable() { return !!getProxyEndpoint() }

const PUBLIC_RELAY = 'https://corsproxy.io/?'

// Nothing should hang forever: a stalled proxy or provider previously left the
// UI on "Connecting…" with no way out but the Stop button.
const REQUEST_TIMEOUT = 120_000

function withTimeout(options, ms = REQUEST_TIMEOUT) {
  const timeout = AbortSignal.timeout(ms)
  const signal = options?.signal
    ? (AbortSignal.any ? AbortSignal.any([options.signal, timeout]) : options.signal)
    : timeout
  return { ...options, signal }
}

async function smartFetch(url, rawOptions, prov, timeoutMs) {
  const options = withTimeout(rawOptions, timeoutMs)
  if (!prov?.needsProxy) return fetch(url, options)

  const endpoint = getProxyEndpoint()
  if (endpoint) {
    return fetch(endpoint, { ...options, headers: { ...options.headers, 'X-Target-URL': url } })
  }

  // No private proxy configured. A public relay may only carry requests with
  // no credentials (e.g. NVIDIA's unauthenticated /models catalog) — sending
  // an Authorization header through it would hand a third party the API key.
  const carriesKey = Object.keys(options?.headers || {}).some(h => h.toLowerCase() === 'authorization')
  if (carriesKey) {
    throw new Error(
      `${prov.name} needs a CORS proxy to send your API key safely, and none is configured. ` +
      `Deploy the Cloudflare Worker (deploy-proxy.bat) and set VITE_LLM_PROXY_BASE — ` +
      `or use Groq / Gemini / OpenRouter / OpenAI, which work directly from the browser.`
    )
  }
  return fetch(PUBLIC_RELAY + encodeURIComponent(url), options)
}

/**
 * Retry on rate limits, gateway timeouts (524), and transient upstream failures.
 * Honours Retry-After when present, else exponential backoff with jitter.
 */
// 520/522/524 are Cloudflare edge errors: the worker could not get a timely
// response from the provider. Worth retrying — free-tier model cold starts
// routinely blow past the 100s edge timeout on the first request of the day.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 520, 522, 524])

async function fetchWithRetry(url, options, prov, { retries = 3, onStatus, timeoutMs = 180000 } = {}) {
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
      if (err.name === 'TimeoutError') {
        if (attempt >= retries) throw err
        attempt++
        onStatus?.(`Connection timed out — retrying (${attempt}/${retries})...`)
        continue
      }
      throw err
    }
  }
}

export async function streamChat({
  provider, apiKey, model, messages, tools = null,
  temperature = 0.7, signal, onToken, onToolCall, onDone, onError, onStatus
}) {
  const prov = getProviders()[provider]
  if (!prov) throw new Error(`Unknown provider: ${provider}`)

  // On-device inference never touches the network or a key.
  if (prov.isLocal) {
    const { streamLocal } = await import('./localLLM')
    return streamLocal({ messages, temperature, signal, onToken, onDone, onError })
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://yogatik.app'
    headers['X-Title'] = 'Yogatik'
  }

  const body = {
    model: model || prov.default,
    messages,
    temperature,
    stream: true,
  }
  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  try {
    const resp = await fetchWithRetry(`${prov.baseUrl}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    }, prov, { onStatus })

    if (!resp.ok) {
      const err = await resp.text()
      if (resp.status === 404) {
        onError?.(new Error(
          `The provider does not serve "${model || prov.default}" on its chat endpoint (404). ` +
          `It may be a base (non-chat) model or recently withdrawn. Pick another model.`
        ))
        return
      }
      if ([504, 520, 522, 524].includes(resp.status)) {
        onError?.(new Error(
          `The provider did not respond in time (${resp.status}). Large models on free tiers ` +
          `can take over 100s to warm up. Try a smaller model, or send the message again.`
        ))
        return
      }
      onError?.(new Error(`${resp.status}: ${err.slice(0, 300)}`))
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

    while (true) {
      const { done, value } = await reader.read()
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
          const data = JSON.parse(payload)
          const delta = data.choices?.[0]?.delta
          if (!delta) continue

          if (delta.content) onToken?.(delta.content)

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', arguments: '' }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function?.name) toolCalls[idx].name = tc.function.name
              if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
            }
          }

          if (data.choices?.[0]?.finish_reason === 'tool_calls' ||
              data.choices?.[0]?.finish_reason === 'function_call') {
            for (const tc of Object.values(toolCalls)) {
              try { tc.parsedArgs = JSON.parse(tc.arguments) } catch { tc.parsedArgs = {} }
              onToolCall?.(tc)
            }
            toolCalls = {}
          }
        } catch {}
      }
    }

    if (!sawData) {
      onError?.(new Error('Provider returned no stream data — check model name and API key.'))
      return
    }

    const remaining = Object.values(toolCalls).filter(tc => tc.name)
    for (const tc of remaining) {
      try { tc.parsedArgs = JSON.parse(tc.arguments) } catch { tc.parsedArgs = {} }
      onToolCall?.(tc)
    }

    onDone?.()
  } catch (err) {
    if (err.name === 'TimeoutError') {
      onError?.(new Error(`No response after ${REQUEST_TIMEOUT / 1000}s — the provider or proxy is not responding. Try a smaller model.`))
    } else if (err.name !== 'AbortError') {
      onError?.(err)
    }
  }
}

/** Non-streaming completion (for tool result processing) */
export async function chatComplete({ provider, apiKey, model, messages, tools, temperature = 0.7, maxTokens, timeoutMs, retries }) {
  const prov = getProviders()[provider]
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://yogatik.app'
    headers['X-Title'] = 'Yogatik'
  }
  const body = { model: model || prov.default, messages, temperature }
  if (maxTokens) body.max_tokens = maxTokens
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto' }

  const resp = await fetchWithRetry(`${prov.baseUrl}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }, prov, { timeoutMs, retries })
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  return resp.json()
}

/** Non-chat model families to hide from the chat model picker */
const NON_CHAT = /(^|\/)(.*(embed|rerank|retrieval|ocr|parse|tts|stt|asr|whisper|riva|dall-e|whisperx|moderation|guard|nemoguard|safety|clip|sana|flux|stable-diffusion|sdxl|image|audio|video|edify|molmim|esm|diffdock|genmol|proteinmpnn|rfdiffusion|alphafold|codegen).*)$/i

/**
 * Fetch available models dynamically from provider's /v1/models endpoint.
 * Providers flagged `publicModels` (NVIDIA) work without a key.
 */
export async function fetchLiveModels(providerId, apiKey) {
  const prov = getProviders()[providerId]
  if (!prov || (!apiKey && !prov.publicModels)) return []

  try {
    const headers = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://yogatik.app'
      headers['X-Title'] = 'Yogatik'
    }
    
    const targetUrl = `${prov.baseUrl}/models`
    const resp = await smartFetch(targetUrl, { method: 'GET', headers }, prov)
    if (!resp.ok) return []

    const contentType = resp.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return []

    const data = await resp.json()
    const modelList = data.data || data.models || []
    const ids = [...new Set(modelList.map(m => (m.id || m.name || m)).filter(Boolean))]
      .filter(id => !NON_CHAT.test(id))
      .sort((a, b) => a.localeCompare(b))
    return ids
  } catch (err) {
    return []
  }
}
