import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// streamChat is the only network edge; drive it from a scripted queue.
vi.mock('./llm', () => ({ streamChat: vi.fn() }))
vi.mock('./tools/index', () => ({
  getToolSchemas: vi.fn(() => []),
  executeTool: vi.fn(async () => ({ ok: true })),
  prioritizeToolSchemas: vi.fn(schemas => schemas),
}))
vi.mock('./vision/source', () => ({
  describeWithoutModel: vi.fn(async () => ({ via: 'ocr', text: 'INVOICE TOTAL 42.00' })),
}))

const { streamChat } = await import('./llm')
const { getToolSchemas, executeTool } = await import('./tools/index')
const { describeWithoutModel } = await import('./vision/source')
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

  it('caps tool rounds then forces a final answer', async () => {
    streamChat.mockImplementation(async (opts) => {
      opts.onToolCall({ id: 'x', name: 'loop', parsedArgs: {} })
      opts.onDone()
    })
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })
    // initial + default 8 rounds + 1 forced final-answer pass = 10, never unbounded
    expect(streamChat.mock.calls.length).toBeLessThanOrEqual(10)
    expect(onDone).toHaveBeenCalled()
    // The last call must instruct the model to stop requesting tools.
    const last = streamChat.mock.calls.at(-1)[0]
    expect(last.messages.at(-1).content).toMatch(/tool-use limit|final answer/i)
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

describe('prompted tool calling (models without native tools)', () => {
  const schema = [{ type: 'function', function: { name: 'web_search', description: 'Search the web.', parameters: { properties: { query: { type: 'string' } }, required: ['query'] } } }]

  /** Rounds where a `rejects` flag fires onToolsRejected instead of answering. */
  function scriptWithRejection(rounds) {
    let call = 0
    streamChat.mockImplementation(async (opts) => {
      const round = rounds[call++] || {}
      if (round.rejects) { opts.onToolsRejected?.(); opts.onDone(); return }
      for (const t of round.tokens || []) opts.onToken(t)
      for (const tc of round.toolCalls || []) opts.onToolCall(tc)
      opts.onDone()
    })
  }

  it('falls back to the text protocol and still runs the tool', async () => {
    getToolSchemas.mockReturnValue(schema)
    executeTool.mockResolvedValue({ answer: 42 })
    scriptWithRejection([
      { rejects: true },
      { tokens: ['```json\n{"tool_calls":[{"name":"web_search","arguments":{"query":"x"}}]}\n```'] },
      { tokens: ['The answer is 42.'] },
    ])
    const onDone = vi.fn()
    const onToken = vi.fn()
    const onToolModeChange = vi.fn()
    await runAgent({ ...base, onDone, onToken, onToolModeChange })

    expect(onToolModeChange).toHaveBeenCalledWith('prompted')
    expect(executeTool).toHaveBeenCalledWith('web_search', { query: 'x' }, { signal: undefined })
    expect(onDone.mock.calls[0][0].content).toBe('The answer is 42.')
    // The JSON block must never reach the user.
    expect(onToken.mock.calls.flat().join('')).not.toContain('tool_calls')
  })

  it('sends no tools array once in prompted mode, and describes them in the prompt', async () => {
    getToolSchemas.mockReturnValue(schema)
    scriptWithRejection([{ rejects: true }, { tokens: ['hi'] }])
    await runAgent({ ...base })

    const second = streamChat.mock.calls[1][0]
    expect(second.tools).toBeNull()
    expect(second.messages[0].content).toContain('web_search(query: string)')
  })

  it('replays results as ordinary turns, never role:tool', async () => {
    getToolSchemas.mockReturnValue(schema)
    scriptWithRejection([
      { rejects: true },
      { tokens: ['{"tool_calls":[{"name":"web_search","arguments":{"query":"y"}}]}'] },
      { tokens: ['done'] },
    ])
    await runAgent({ ...base })

    const last = streamChat.mock.calls[2][0].messages
    expect(last.some(m => m.role === 'tool')).toBe(false)
    expect(last[last.length - 1].role).toBe('user')
    expect(last[last.length - 1].content).toContain('TOOL_RESULTS')
  })

  it('starts in prompted mode when the model is already known to need it', async () => {
    getToolSchemas.mockReturnValue(schema)
    scriptRounds([{ tokens: ['hello'] }])
    await runAgent({ ...base, initialToolMode: 'prompted' })

    expect(streamChat).toHaveBeenCalledTimes(1)   // no wasted rejected request
    expect(streamChat.mock.calls[0][0].tools).toBeNull()
  })

  it('prose in prompted mode still reaches the user', async () => {
    getToolSchemas.mockReturnValue(schema)
    scriptRounds([{ tokens: ['Paris', ' is', ' the', ' capital.'] }])
    const onDone = vi.fn()
    await runAgent({ ...base, initialToolMode: 'prompted', onDone })
    expect(onDone.mock.calls[0][0].content).toBe('Paris is the capital.')
  })
})

describe('vision plumbing', () => {
  const seeSchema = [{ type: 'function', function: { name: 'see', description: 'Look.', parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } } }]
  const IMG = 'data:image/jpeg;base64,AAAAAAAA'

  it('shows the frame to the model as a real image part', async () => {
    getToolSchemas.mockReturnValue(seeSchema)
    executeTool.mockResolvedValue({ success: true, image: IMG, question: 'what is this' })
    scriptRounds([
      { toolCalls: [{ name: 'see', parsedArgs: { question: 'what is this' } }] },
      { tokens: ['A mug.'] },
    ])
    await runAgent({ ...base, modelCanSee: true })

    const msgs = streamChat.mock.calls[1][0].messages
    const imgMsg = msgs.find(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'))
    expect(imgMsg.role).toBe('user')
    expect(imgMsg.content.find(p => p.type === 'image_url').image_url.url).toBe(IMG)
  })

  it('never inlines base64 into the tool message as text', async () => {
    getToolSchemas.mockReturnValue(seeSchema)
    executeTool.mockResolvedValue({ success: true, image: IMG, observation: 'a mug' })
    scriptRounds([
      { toolCalls: [{ name: 'see', parsedArgs: {} }] },
      { tokens: ['ok'] },
    ])
    await runAgent({ ...base, modelCanSee: true })

    const toolMsg = streamChat.mock.calls[1][0].messages.find(m => m.role === 'tool')
    expect(toolMsg.content).not.toContain('base64')
    expect(toolMsg.content).toContain('observation')   // the useful part survives
  })

  it('passes only text when the model cannot see', async () => {
    getToolSchemas.mockReturnValue(seeSchema)
    executeTool.mockResolvedValue({ success: true, image: IMG, observation: 'a mug on a desk', via: 'local-vlm' })
    scriptRounds([
      { toolCalls: [{ name: 'see', parsedArgs: {} }] },
      { tokens: ['A mug.'] },
    ])
    await runAgent({ ...base, modelCanSee: false })

    const msgs = streamChat.mock.calls[1][0].messages
    expect(msgs.some(m => Array.isArray(m.content))).toBe(false)
    expect(msgs.find(m => m.role === 'tool').content).toContain('a mug on a desk')
  })

  it('keeps only the newest frame in context', async () => {
    getToolSchemas.mockReturnValue(seeSchema)
    executeTool.mockResolvedValue({ success: true, image: IMG })
    scriptRounds([
      { toolCalls: [{ name: 'see', parsedArgs: {} }] },
      { toolCalls: [{ name: 'see', parsedArgs: {} }] },
      { tokens: ['done'] },
    ])
    await runAgent({ ...base, modelCanSee: true })

    const msgs = streamChat.mock.calls[2][0].messages
    const withImages = msgs.filter(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'))
    expect(withImages).toHaveLength(1)
    // The superseded one degrades to a text note rather than vanishing.
    expect(msgs.some(m => typeof m.content === 'string' && m.content.includes('earlier camera frame'))).toBe(true)
  })

  it('does not stringify multimodal history turns', async () => {
    getToolSchemas.mockReturnValue([])
    scriptRounds([{ tokens: ['ok'] }])
    const history = [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: IMG } }] }]
    await runAgent({ ...base, history })

    const sent = streamChat.mock.calls[0][0].messages[1]
    expect(Array.isArray(sent.content)).toBe(true)
    expect(sent.content[1].image_url.url).toBe(IMG)
  })
})

describe('Stop', () => {
  it('does not wait for a slow tool round', async () => {
    const ctrl = new AbortController()
    scriptRounds([{ toolCalls: [{ name: 'deep_research', parsedArgs: {} }] }, { tokens: ['late'] }])
    // A tool that never finishes on its own.
    executeTool.mockImplementation(() => new Promise(() => {}))

    const onDone = vi.fn()
    const run = runAgent({ ...base, onDone, signal: ctrl.signal })
    await Promise.resolve()
    ctrl.abort()
    await run

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ aborted: true }))
    expect(streamChat).toHaveBeenCalledTimes(1)     // never asked for round 2
  })

  it('keeps the partial answer and marks it aborted', async () => {
    const ctrl = new AbortController()
    streamChat.mockImplementation(async (opts) => {
      opts.onToken('half an ans')
      ctrl.abort()
      opts.onDone()                                  // llm.js fires onDone on abort
    })
    const onDone = vi.fn()
    await runAgent({ ...base, onDone, signal: ctrl.signal })

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'half an ans', aborted: true }),
    )
  })

  it('never starts a round when the signal is already aborted', async () => {
    const onDone = vi.fn()
    await runAgent({ ...base, onDone, signal: AbortSignal.abort() })
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ aborted: true }))
  })
})


describe('an attached image', () => {
  const IMG = 'data:image/jpeg;base64,AAAA'

  it('goes to the model as an image part when it can see', async () => {
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, userMessage: 'what is this?', userImage: IMG, modelCanSee: true })

    const turn = streamChat.mock.calls[0][0].messages.at(-1)
    expect(Array.isArray(turn.content)).toBe(true)
    expect(turn.content).toEqual(expect.arrayContaining([
      { type: 'image_url', image_url: { url: IMG } },
    ]))
    expect(describeWithoutModel).not.toHaveBeenCalled()
  })

  it('is read on-device and passed as text when the model is blind', async () => {
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, userMessage: 'total?', userImage: IMG, modelCanSee: false })

    expect(describeWithoutModel).toHaveBeenCalledWith(IMG, 'total?')
    const turn = streamChat.mock.calls[0][0].messages.at(-1)
    expect(typeof turn.content).toBe('string')
    expect(turn.content).toContain('INVOICE TOTAL 42.00')
    // The base64 must never reach a text-only model as prompt text.
    expect(turn.content).not.toContain(IMG)
  })

  it('tells the user when the image cannot be read at all, instead of dropping it', async () => {
    describeWithoutModel.mockRejectedValueOnce(new Error('no text found'))
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, userMessage: 'read this', userImage: IMG, modelCanSee: false })

    const turn = streamChat.mock.calls[0][0].messages.at(-1)
    expect(turn.content).toMatch(/could not be read/i)
    expect(turn.content).toMatch(/vision-capable|On-device vision/i)
  })

  it('leaves a normal turn as a plain string', async () => {
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, userMessage: 'hello' })
    expect(typeof streamChat.mock.calls[0][0].messages.at(-1).content).toBe('string')
  })
})

describe('prompted mode text release', () => {
  it('releases text on first turn even if text contains unparseable brackets', async () => {
    // Model rejects native tools, switches to prompted mode
    const onToken = vi.fn()
    const onDone = vi.fn()
    let call = 0
    streamChat.mockImplementation(async (opts) => {
      call++
      if (call === 1) {
        opts.onToolsRejected?.()
        opts.onDone()
      } else {
        opts.onToken('[Here is some text with brackets]')
        opts.onDone()
      }
    })
    await runAgent({ ...base, onToken, onDone })
    expect(onToken).toHaveBeenCalledWith('[Here is some text with brackets]')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ content: '[Here is some text with brackets]' }))
  })
})

describe('empty final answer', () => {
  // Reported in the field: a tool ran, then the follow-up call produced neither
  // text nor tool calls, so the turn ended and the user got an empty bubble
  // ("The model returned an empty response"). The cap-hit path already forces a
  // final synthesis pass; this is the same failure with the cap never reached.
  it('forces a final pass when the turn would otherwise end with no answer', async () => {
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'fs_read', parsedArgs: {} }] },
      {},                                    // model says nothing after the results
      { tokens: ['The file lists three routes.'] },
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'The file lists three routes.' }),
    )
    expect(streamChat).toHaveBeenCalledTimes(3)
    const last = streamChat.mock.calls.at(-1)[0]
    expect(last.messages.at(-1).content).toMatch(/answer now|final answer/i)
  })

  it('never hands back an empty answer even if the retry also says nothing', async () => {
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'fs_read', parsedArgs: {} }] },
      {},
      {},
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })

    const { content } = onDone.mock.calls[0][0]
    expect(content.trim()).not.toBe('')
    expect(content).toMatch(/could not|no answer|tool results/i)
  })

  it('treats a reasoning-only reply as empty and asks for the answer', async () => {
    scriptRounds([
      { tokens: ['<think>weighing options</think>'] },
      { tokens: ['42.'] },
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })

    expect(onDone.mock.calls[0][0].content).toContain('42.')
    expect(streamChat).toHaveBeenCalledTimes(2)
  })

  it('does NOT add a round when the model already answered', async () => {
    scriptRounds([{ tokens: ['Done.'] }])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(streamChat).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry after the user pressed Stop', async () => {
    const ctrl = new AbortController()
    streamChat.mockImplementation(async (opts) => { ctrl.abort(); opts.onDone() })
    const onDone = vi.fn()
    await runAgent({ ...base, signal: ctrl.signal, onDone })
    expect(streamChat).toHaveBeenCalledTimes(1)
  })
})

describe('runtime platform awareness', () => {
  // The model used to be told it had "browser-native tools" and nothing else,
  // so on the desktop build it confidently refused real work: "I cannot run a
  // dev server — I have no shell/terminal access, no Node.js runtime." It was
  // believing the system prompt, not misbehaving.
  afterEach(() => { delete window.__YOGATIK_ELECTRON__ })

  const systemOf = () => streamChat.mock.calls[0][0].messages[0].content

  it('tells the model it has REAL machine access in the desktop app', async () => {
    window.__YOGATIK_ELECTRON__ = true
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, onDone: vi.fn() })

    const sys = systemOf()
    expect(sys).toMatch(/desktop app/i)
    expect(sys).toMatch(/terminal_run/)
    expect(sys).toMatch(/proc_start/)
    expect(sys).toMatch(/never say you have no shell/i)
  })

  it('tells the model desktop-only tools will refuse in the web build', async () => {
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, onDone: vi.fn() })

    const sys = systemOf()
    expect(sys).toMatch(/browser/i)
    expect(sys).toMatch(/will refuse/i)
  })

  it('never claims browser-native tools on desktop', async () => {
    window.__YOGATIK_ELECTRON__ = true
    scriptRounds([{ tokens: ['ok'] }])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(systemOf()).not.toMatch(/browser-native tools/i)
  })
})

describe('repeated tool calls', () => {
  // Seen twice in the field: video_render called TEN times in one turn with
  // steadily worse arguments, and web_search NINE times with the same ones. The
  // round cap bounded it, but nothing stopped a model re-issuing a call it had
  // already made — so a failing tool was retried until the budget ran out.
  const callsTo = (name) => executeTool.mock.calls.filter((c) => c[0] === name)

  it('runs an identical call only once per turn', async () => {
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'web_search', parsedArgs: { query: 'ai news' } }] },
      { toolCalls: [{ id: '2', name: 'web_search', parsedArgs: { query: 'ai news' } }] },
      { tokens: ['Here you go.'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(callsTo('web_search')).toHaveLength(1)
  })

  it('still runs the same tool with different arguments', async () => {
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'web_search', parsedArgs: { query: 'a' } }] },
      { toolCalls: [{ id: '2', name: 'web_search', parsedArgs: { query: 'b' } }] },
      { tokens: ['ok'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(callsTo('web_search')).toHaveLength(2)
  })

  it('ignores key ORDER when deciding a call is a repeat', async () => {
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'weather', parsedArgs: { city: 'x', units: 'c' } }] },
      { toolCalls: [{ id: '2', name: 'weather', parsedArgs: { units: 'c', city: 'x' } }] },
      { tokens: ['ok'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(callsTo('weather')).toHaveLength(1)
  })

  it('does not re-run a call that FAILED — that is the flail case', async () => {
    executeTool.mockResolvedValue({ success: false, error: 'bad scene' })
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'video_render', parsedArgs: { scenes: [] } }] },
      { toolCalls: [{ id: '2', name: 'video_render', parsedArgs: { scenes: [] } }] },
      { toolCalls: [{ id: '3', name: 'video_render', parsedArgs: { scenes: [] } }] },
      { tokens: ['I could not build it.'] },
    ])
    await runAgent({ ...base, onDone: vi.fn() })
    expect(callsTo('video_render')).toHaveLength(1)
  })

  it('tells the model the repeat was not executed', async () => {
    executeTool.mockResolvedValue({ success: true, data: 1 })
    scriptRounds([
      { toolCalls: [{ id: '1', name: 'weather', parsedArgs: { city: 'x' } }] },
      { toolCalls: [{ id: '2', name: 'weather', parsedArgs: { city: 'x' } }] },
      { tokens: ['ok'] },
    ])
    const onDone = vi.fn()
    await runAgent({ ...base, onDone })
    const sent = JSON.stringify(streamChat.mock.calls.at(-1)[0].messages)
    expect(sent).toMatch(/already called|repeated/i)
  })
})
