/**
 * Browser-native LLM client — calls Groq/OpenRouter/OpenAI directly.
 * Supports streaming (SSE) + function calling (tool_use).
 * API key stored in IndexedDB, never sent to any backend.
 */

const PROVIDERS = {
  groq: {
    name: 'Groq (Free)',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    default: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'google/gemini-2.5-flash', 'google/gemini-2.5-pro',
      'anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4',
      'openai/gpt-4o', 'openai/gpt-4o-mini',
      'meta-llama/llama-3.1-70b-instruct', 'deepseek/deepseek-chat',
      'mistralai/mistral-large', 'qwen/qwen-2.5-72b-instruct',
    ],
    default: 'google/gemini-2.5-flash',
    keyUrl: 'https://openrouter.ai/keys',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    default: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
}

export function getProviders() { return PROVIDERS }
export function getProviderModels(providerId) { return PROVIDERS[providerId]?.models || [] }
export function getDefaultModel(providerId) { return PROVIDERS[providerId]?.default || '' }

/**
 * Stream a chat completion with optional function calling.
 * @param {Object} opts
 * @param {string} opts.provider - Provider ID
 * @param {string} opts.apiKey - API key
 * @param {string} opts.model - Model ID
 * @param {Array} opts.messages - [{role, content}]
 * @param {Array} opts.tools - Function schemas for tool calling
 * @param {number} opts.temperature
 * @param {AbortSignal} opts.signal - For cancellation
 * @param {Function} opts.onToken - Called with each text delta
 * @param {Function} opts.onToolCall - Called with {name, arguments} when LLM wants a tool
 * @param {Function} opts.onDone - Called when stream completes
 * @param {Function} opts.onError - Called on error
 */
export async function streamChat({
  provider, apiKey, model, messages, tools = null,
  temperature = 0.7, signal, onToken, onToolCall, onDone, onError
}) {
  const prov = PROVIDERS[provider]
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
    const resp = await fetch(`${prov.baseUrl}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body), signal,
    })

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

          // Text content
          if (delta.content) onToken?.(delta.content)

          // Tool calls (accumulated across chunks)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', arguments: '' }
              if (tc.id) toolCalls[idx].id = tc.id
              if (tc.function?.name) toolCalls[idx].name = tc.function.name
              if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments
            }
          }

          // Check finish reason
          if (data.choices?.[0]?.finish_reason === 'tool_calls' ||
              data.choices?.[0]?.finish_reason === 'function_call') {
            // Emit all accumulated tool calls
            for (const tc of Object.values(toolCalls)) {
              try {
                tc.parsedArgs = JSON.parse(tc.arguments)
              } catch { tc.parsedArgs = {} }
              onToolCall?.(tc)
            }
            toolCalls = {}
          }
        } catch {}
      }
    }

    // Handle any remaining tool calls
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
  const prov = PROVIDERS[provider]
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

  const resp = await fetch(`${prov.baseUrl}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  return resp.json()
}
