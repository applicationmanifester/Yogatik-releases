/**
 * Browser-native LLM client — calls Gemini/Groq/OpenRouter/OpenAI directly,
 * proxies non-CORS providers (NVIDIA etc.) through /api/llm-proxy.
 * API key stored in IndexedDB, never sent to any backend.
 */

const PROVIDERS = {
  nvidia: {
    name: 'NVIDIA (Free)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [],
    default: '',
    keyUrl: 'https://build.nvidia.com',
    needsProxy: true,
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
 * Smart fetch — direct for CORS-friendly providers, proxied for others.
 * Proxy: sends real URL in X-Target-URL header, request goes to /api/llm-proxy.
 */
async function smartFetch(url, options, prov) {
  if (prov?.needsProxy) {
    const proxyHeaders = { ...options.headers, 'X-Target-URL': url }
    return fetch('/api/llm-proxy', { ...options, headers: proxyHeaders })
  }
  return fetch(url, options)
}

export async function streamChat({
  provider, apiKey, model, messages, tools = null,
  temperature = 0.7, signal, onToken, onToolCall, onDone, onError
}) {
  const prov = getProviders()[provider]
  if (!prov) throw new Error(`Unknown provider: ${provider}`)

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
    const resp = await smartFetch(`${prov.baseUrl}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    }, prov)

    if (!resp.ok) {
      const err = await resp.text()
      onError?.(new Error(`${resp.status}: ${err}`))
      return
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let toolCalls = {}

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const data = JSON.parse(line.slice(6))
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

    const remaining = Object.values(toolCalls).filter(tc => tc.name)
    for (const tc of remaining) {
      try { tc.parsedArgs = JSON.parse(tc.arguments) } catch { tc.parsedArgs = {} }
      onToolCall?.(tc)
    }

    onDone?.()
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err)
  }
}

/** Non-streaming completion (for tool result processing) */
export async function chatComplete({ provider, apiKey, model, messages, tools, temperature = 0.7 }) {
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
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto' }

  const resp = await smartFetch(`${prov.baseUrl}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }, prov)
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  return resp.json()
}

/** Fetch available models dynamically from provider's /v1/models endpoint */
export async function fetchLiveModels(providerId, apiKey) {
  const prov = getProviders()[providerId]
  if (!prov || !apiKey) return []

  try {
    const headers = { 'Authorization': `Bearer ${apiKey}` }
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://yogatik.app'
      headers['X-Title'] = 'Yogatik'
    }
    
    // Gemini OpenAI endpoint for models is /models
    const targetUrl = `${prov.baseUrl}/models`
    const resp = await smartFetch(targetUrl, { method: 'GET', headers }, prov)
    if (!resp.ok) return []

    const contentType = resp.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return []

    const data = await resp.json()
    const modelList = data.data || data.models || []
    const ids = modelList.map(m => (m.id || m.name || m)).filter(Boolean)
    return ids
  } catch (err) {
    return []
  }
}
