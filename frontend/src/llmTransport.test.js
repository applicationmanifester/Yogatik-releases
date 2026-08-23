/**
 * llm.js transport — the layer under the agent loop.
 *
 * agent.test.js drives the loop with a fake streamChat, so everything below it
 * (SSE parsing, retry/backoff, abort, the tools-rejected fallback, provider
 * body shaping) was unexercised. These are the paths where a mistake is silent:
 * a stream that never settles looks exactly like a slow model, and a swallowed
 * AbortError hangs the whole turn.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamChat, chatComplete, parseProviderError } from './llm'

/** A Response whose body streams the given SSE frames. */
function sseResponse(frames, { status = 200, headers = {} } = {}) {
  const encoder = new TextEncoder()
  const chunks = frames.map(f => encoder.encode(f))
  let i = 0
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => ({ 'content-type': 'text/event-stream', ...headers })[k.toLowerCase()] ?? null },
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }) },
    text: async () => frames.join(''),
  }
}

function errorResponse(status, body = '') {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => body,
    body: null,
  }
}

const delta = (obj) => `data: ${JSON.stringify({ choices: [{ delta: obj }] })}\n\n`

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('streaming', () => {
  it('emits tokens as they arrive and settles with the full answer', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      delta({ content: 'Hel' }), delta({ content: 'lo' }), 'data: [DONE]\n\n',
    ]))
    const tokens = []
    const done = vi.fn()
    await streamChat({
      provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
      onToken: t => tokens.push(t), onDone: done,
    })
    expect(tokens.join('')).toBe('Hello')
    expect(done).toHaveBeenCalled()
  })

  it('assembles a tool call split across deltas', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      delta({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'web_search', arguments: '{"que' } }] }),
      delta({ tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }] }),
      'data: [DONE]\n\n',
    ]))
    const calls = []
    await streamChat({
      provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'web_search', parameters: { type: 'object', properties: {} } } }],
      onToolCall: c => calls.push(c), onDone: () => {},
    })
    expect(calls.length).toBeGreaterThan(0)
    const flat = JSON.stringify(calls)
    expect(flat).toContain('web_search')
    expect(flat).toContain('"query":"x"')
  })

  it('reports a proxy that answers 200 with HTML instead of a stream', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'text/html' },
      body: null, text: async () => '<!doctype html>',
    })
    const onError = vi.fn()
    await streamChat({
      provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
      onError, onDone: () => {},
    })
    expect(onError).toHaveBeenCalled()
    expect(String(onError.mock.calls[0][0].message)).toMatch(/html/i)
  })
})

describe('abort', () => {
  it('an aborted stream still settles — a swallowed AbortError hangs the turn', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      const e = new Error('aborted')
      e.name = 'AbortError'
      throw e
    })
    const done = vi.fn()
    const onError = vi.fn()
    await streamChat({
      provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal, onDone: done, onError,
    })
    expect(done).toHaveBeenCalled()
  })
})

describe('retry', () => {
  it('retries a 429 and honours Retry-After, reporting progress', async () => {
    vi.useFakeTimers()
    try {
      const rateLimited = {
        ok: false, status: 429,
        headers: { get: (k) => (k.toLowerCase() === 'retry-after' ? '1' : null) },
        text: async () => 'slow down', body: null,
      }
      fetchMock
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValueOnce(sseResponse([delta({ content: 'ok' }), 'data: [DONE]\n\n']))

      const status = []
      const tokens = []
      const p = streamChat({
        provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
        onStatus: s => status.push(s), onToken: t => tokens.push(t), onDone: () => {},
      })
      await vi.advanceTimersByTimeAsync(2000)
      await p

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(status.join(' ')).toMatch(/rate limited/i)
      expect(tokens.join('')).toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('400 handling', () => {
  it('a withdrawn model is reported as a model error, not as tools-rejected', async () => {
    // NVIDIA 400s a retired model instead of 404ing it. Misreading that as
    // "tools rejected" wastes a second call on the same dead model.
    fetchMock.mockResolvedValue(errorResponse(400, 'The model meta/llama-x does not exist'))
    const onError = vi.fn()
    const onToolsRejected = vi.fn()
    await streamChat({
      provider: 'nvidia', apiKey: 'k', model: 'meta/llama-x', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'x', parameters: { type: 'object', properties: {} } } }],
      onError, onToolsRejected, onDone: () => {},
    })
    expect(onToolsRejected).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
    expect(String(onError.mock.calls[0][0].message)).toMatch(/not found or unavailable/i)
  })

  it('a model that rejects a tools array falls back AND settles', async () => {
    // onDone must fire here: the agent awaits it before retrying in prompted
    // mode, so skipping it leaves the promise pending forever.
    fetchMock.mockResolvedValue(errorResponse(400, 'tools are not supported for this model'))
    const onToolsRejected = vi.fn()
    const onDone = vi.fn()
    await streamChat({
      provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'x', parameters: { type: 'object', properties: {} } } }],
      onToolsRejected, onDone,
    })
    expect(onToolsRejected).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('retries without tools when no onToolsRejected hook is supplied', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(400, 'tools not supported'))
      .mockResolvedValueOnce(sseResponse([delta({ content: 'plain' }), 'data: [DONE]\n\n']))
    const tokens = []
    await streamChat({
      provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'x', parameters: { type: 'object', properties: {} } } }],
      onToken: t => tokens.push(t), onDone: () => {},
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toBeUndefined()
    expect(tokens.join('')).toBe('plain')
  })
})

describe('request shaping', () => {
  const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1].body)
  const headersOf = () => fetchMock.mock.calls[0][1].headers

  it('sends a Bearer key for OpenAI-shaped providers', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    await streamChat({ provider: 'groq', apiKey: 'secret', model: 'llama', messages: [{ role: 'user', content: 'hi' }], onDone: () => {} })
    expect(headersOf().Authorization).toBe('Bearer secret')
    expect(bodyOf().stream).toBe(true)
  })

  it('hoists the system turn and uses x-api-key for Anthropic', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    await streamChat({
      provider: 'anthropic', apiKey: 'sk-ant', model: 'claude-x',
      messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }],
      onDone: () => {},
    })
    // Anthropic is proxied, so the real destination rides in X-Target-URL
    // rather than in the fetch URL.
    const url = String(fetchMock.mock.calls[0][0])
    const target = headersOf()['X-Target-URL'] || headersOf()['x-target-url'] || url
    expect(target).toMatch(/\/messages$/)
    expect(headersOf()['x-api-key']).toBe('sk-ant')
    expect(headersOf()['anthropic-version']).toBeTruthy()
    const body = bodyOf()
    expect(body.system).toBe('be brief')
    expect(body.messages.some(m => m.role === 'system')).toBe(false)
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('omits tool_choice for providers that 400 on it', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    const tools = [{ type: 'function', function: { name: 'x', parameters: { type: 'object', properties: {} } } }]
    await streamChat({ provider: 'nvidia', apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }], tools, onDone: () => {} })
    expect(bodyOf().tool_choice).toBeUndefined()
  })

  it('rejects an unknown provider instead of guessing an endpoint', async () => {
    await expect(streamChat({
      provider: 'nope', apiKey: 'k', model: 'm', messages: [], onDone: () => {},
    })).rejects.toThrow(/unknown provider/i)
  })
})

describe('chatComplete', () => {
  it('returns the assistant message content', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
      text: async () => '{}',
    })
    const out = await chatComplete({ provider: 'groq', apiKey: 'k', model: 'llama', messages: [{ role: 'user', content: 'ping' }] })
    expect(JSON.stringify(out)).toContain('pong')
  })
})

describe('parseProviderError', () => {
  it('pulls the message out of a provider error envelope', () => {
    expect(parseProviderError(400, JSON.stringify({ error: { message: 'bad thing' } }))).toContain('bad thing')
  })

  it('never returns an empty string for an empty body', () => {
    expect(String(parseProviderError(500, '')).length).toBeGreaterThan(0)
  })
})
