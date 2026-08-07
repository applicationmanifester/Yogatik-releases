import { describe, it, expect, vi, beforeEach } from 'vitest'

// streamChat is the only network edge; drive it from a scripted queue.
vi.mock('./llm', () => ({ streamChat: vi.fn() }))
vi.mock('./tools/index', () => ({
  getToolSchemas: vi.fn(() => []),
  executeTool: vi.fn(async () => ({ ok: true })),
}))

const { streamChat } = await import('./llm')
const { getToolSchemas, executeTool } = await import('./tools/index')
const { runAgent } = await import('./agent')

/** Queue a scripted response per LLM round. */
function scriptRounds(rounds) {
  let call = 0
  streamChat.mockImplementation(async (opts) => {
    const round = rounds[call++] || {}
    if (round.throws) { opts.onError(round.throws); return }
    for (const t of round.tokens || []) opts.onToken(t)
    for (const tc of round.toolCalls || []) opts.onToolCall(tc)
    opts.onDone()
  })
}

const base = { provider: 'groq', apiKey: 'k', model: 'm', userMessage: 'hi' }

beforeEach(() => {
  vi.clearAllMocks()
  getToolSchemas.mockReturnValue([])
  executeTool.mockResolvedValue({ ok: true })
})

describe('plain answers', () => {
  it('streams tokens and returns the full content', async () => {
    scriptRounds([{ tokens: ['Hel', 'lo'] }])
    const onToken = vi.fn()
    const onDone = vi.fn()
    await runAgent({ ...base, onToken, onDone })

    expect(onToken.mock.calls.flat().join('')).toBe('Hello')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hello' }))
    expect(streamChat).toHaveBeenCalledTimes(1)
  })

  it('passes no tools when tools are disabled', async () => {
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({ ...base, toolsEnabled: false, onDone: vi.fn() })
    expect(streamChat.mock.calls[0][0].tools).toBeNull()
  })
})

describe('tool round-trip', () => {
  it('emits ONE assistant message holding every tool_call, then one tool message each', async () => {
    // Regression: interleaved assistant/tool pairs make NVIDIA return 400.
    scriptRounds([
      { toolCalls: [
        { id: 'a', name: 'weather', parsedArgs: { city: 'x' } },
        { id: 'b', name: 'calculator', parsedArgs: { expr: '1+1' } },
      ] },
      { tokens: ['done'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })

    const sent = streamChat.mock.calls[1][0].messages
    const assistants = sent.filter(m => m.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0].tool_calls).toHaveLength(2)

    const toolMsgs = sent.filter(m => m.role === 'tool')
    expect(toolMsgs.map(m => m.tool_call_id)).toEqual(['a', 'b'])
    // tool messages must follow the assistant message that declared them
    expect(sent.indexOf(assistants[0])).toBeLessThan(sent.indexOf(toolMsgs[0]))
  })

  it('runs independent tools in parallel, not serially', async () => {
    let active = 0
    let peak = 0
    executeTool.mockImplementation(async () => {
      peak = Math.max(peak, ++active)
      await new Promise(r => setTimeout(r, 10))
      active--
      return { ok: true }
    })
    scriptRounds([
      { toolCalls: [
        { id: '1', name: 'a', parsedArgs: {} },
        { id: '2', name: 'b', parsedArgs: {} },
        { id: '3', name: 'c', parsedArgs: {} },
      ] },
      { tokens: ['ok'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(peak).toBe(3)
  })

  it('synthesises ids when the provider omits them', async () => {
    scriptRounds([
      { toolCalls: [{ name: 'weather', parsedArgs: {} }] },
      { tokens: ['ok'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })
    const sent = streamChat.mock.calls[1][0].messages
    const id = sent.find(m => m.role === 'tool').tool_call_id
    expect(id).toBeTruthy()
    expect(sent.find(m => m.role === 'assistant').tool_calls[0].id).toBe(id)
  })

  it('keeps text generated before a tool call', async () => {
    // Regression: fullContent was reset between rounds, losing the preamble.
    scriptRounds([
      { tokens: ['Let me check. '], toolCalls: [{ id: '1', name: 'weather', parsedArgs: {} }] },
      { tokens: ['It is sunny.'] },
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })
    expect(onDone.mock.calls[0][0].content).toBe('Let me check. It is sunny.')
  })

  it('survives a throwing tool instead of aborting the turn', async () => {
    executeTool.mockRejectedValueOnce(new Error('boom'))
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'weather', parsedArgs: {} }] },
      { tokens: ['recovered'] },
    ])
    const onDone = vi.fn()
    const onError = vi.fn()
    await runAgent({ ...base, onDone, onError })

    expect(onError).not.toHaveBeenCalled()
    expect(onDone.mock.calls[0][0].content).toBe('recovered')
    const toolMsg = streamChat.mock.calls[1][0].messages.find(m => m.role === 'tool')
    expect(toolMsg.content).toContain('boom')
  })

  it('stops after 5 tool rounds', async () => {
    streamChat.mockImplementation(async (opts) => {
      opts.onToolCall({ id: 'x', name: 'loop', parsedArgs: {} })
      opts.onDone()
    })
    await runAgent({ ...base, onDone: vi.fn() })
    expect(streamChat.mock.calls.length).toBeLessThanOrEqual(6) // initial + 5 rounds
  })

  it('excludes disabled tools from the schema list', async () => {
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({ ...base, disabledTools: ['tts', 'stt'], onDone: vi.fn() })
    expect(getToolSchemas).toHaveBeenCalledWith(['tts', 'stt'])
  })
})

describe('sources', () => {
  it('collects and de-duplicates research sources', async () => {
    executeTool.mockResolvedValue({
      pages: [{ title: 'A', url: 'https://a.com' }],
      sources: [{ title: 'A', url: 'https://a.com' }, { title: 'B', url: 'https://b.com' }],
    })
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'deep_research', parsedArgs: {} }] },
      { tokens: ['answer'] },
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })
    expect(onDone.mock.calls[0][0].sources.map(s => s.url)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('ignores sources from non-research tools', async () => {
    executeTool.mockResolvedValue({ url: 'https://weather.example' })
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'weather', parsedArgs: {} }] },
      { tokens: ['sunny'] },
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })
    expect(onDone.mock.calls[0][0].sources).toEqual([])
  })
})

describe('abort', () => {
  it('keeps the partial answer when the user stops', async () => {
    // Regression: AbortError was swallowed and the partial reply thrown away.
    streamChat.mockImplementation(async (opts) => {
      opts.onToken('partial ')
      opts.onError(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    })
    const onDone = vi.fn()
    const onError = vi.fn()
    await runAgent({ ...base, onDone, onError })

    expect(onError).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ content: 'partial ', aborted: true }))
  })

  it('reports real errors', async () => {
    streamChat.mockImplementation(async (opts) => opts.onError(new Error('502 bad gateway')))
    const onError = vi.fn()
    await runAgent({ ...base, onError, onDone: vi.fn() })
    expect(onError.mock.calls[0][0].message).toBe('502 bad gateway')
  })
})

describe('system prompt', () => {
  const promptOf = () => streamChat.mock.calls[0][0].messages[0].content

  it('advertises research when the web is enabled', async () => {
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({ ...base, webEnabled: true, onDone: vi.fn() })
    expect(promptOf()).toContain('deep_research')
  })

  it('states the web is off when disabled', async () => {
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({ ...base, webEnabled: false, onDone: vi.fn() })
    expect(promptOf()).toMatch(/Web access is currently disabled/)
  })

  it('appends the persona without dropping the tool rules', async () => {
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({ ...base, persona: 'You are a pirate.', onDone: vi.fn() })
    expect(promptOf()).toContain('You are a pirate.')
    expect(promptOf()).toContain('WHEN TO USE TOOLS')
  })

  it("includes today's date so the model can reason about recency", async () => {
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(promptOf()).toContain(String(new Date().getFullYear()))
  })
})

describe('history window', () => {
  it('keeps recent messages whole rather than truncating each one', async () => {
    // Regression: a blanket 3000-char cut shredded inlined documents.
    const doc = 'D'.repeat(9000)
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({
      ...base,
      history: [{ role: 'user', content: doc }, { role: 'assistant', content: 'ok' }],
      onDone: vi.fn(),
    })
    const sent = streamChat.mock.calls[0][0].messages
    expect(sent.find(m => m.content.startsWith('DDD')).content).toHaveLength(9000)
  })

  it('drops the oldest turns once the budget is spent', async () => {
    const big = 'x'.repeat(9000)
    scriptRounds([{ tokens: ['x'] }])
    await runAgent({
      ...base,
      history: Array.from({ length: 6 }, (_, i) => ({ role: 'user', content: `${i}${big}` })),
      onDone: vi.fn(),
    })
    const sent = streamChat.mock.calls[0][0].messages
    const total = sent.slice(1, -1).reduce((n, m) => n + m.content.length, 0)
    expect(total).toBeLessThanOrEqual(24000)
    // the newest turn must survive
    expect(sent.some(m => m.content.startsWith('5'))).toBe(true)
  })
})
