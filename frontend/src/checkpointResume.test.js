import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./llm', () => ({ streamChat: vi.fn() }))
vi.mock('./tools/index', () => ({
  getToolSchemas: vi.fn(() => [
    { type: 'function', function: { name: 'fs_read', description: 'read a file' } },
    { type: 'function', function: { name: 'fs_write', description: 'write a file' } }
  ]),
  executeTool: vi.fn(async () => ({ ok: true, data: 'file content' })),
  prioritizeToolSchemas: vi.fn(schemas => schemas),
}))
vi.mock('./vision/source', () => ({
  describeWithoutModel: vi.fn(async () => ({ via: 'ocr', text: 'text' })),
}))
vi.mock('./mcp', () => ({
  getMcpServers: vi.fn(async () => []),
  setMcpServers: vi.fn(async () => {}),
  refreshMcpTools: vi.fn(async () => []),
}))

const { streamChat } = await import('./llm')
const { executeTool } = await import('./tools/index')
const { runAgent } = await import('./agent')

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

const base = { provider: 'groq', apiKey: 'k', model: 'm', userMessage: 'inspect and update files' }

beforeEach(() => {
  vi.clearAllMocks()
  executeTool.mockResolvedValue({ ok: true, data: 'file content' })
})

describe('Turn Checkpoint & Resume Engine', () => {
  it('emits onCheckpoint after tool execution round with toolResults and actionCount', async () => {
    scriptRounds([
      { toolCalls: [{ id: 'c1', name: 'fs_read', parsedArgs: { path: 'a.js' } }] },
      { tokens: ['Done examining files!'] },
    ])

    const checkpoints = []
    const onCheckpoint = vi.fn((cp) => checkpoints.push(cp))
    const onDone = vi.fn()

    await runAgent({
      ...base,
      onCheckpoint,
      onDone,
    })

    expect(onCheckpoint).toHaveBeenCalled()
    expect(checkpoints.length).toBeGreaterThan(0)
    const latest = checkpoints[checkpoints.length - 1]
    expect(latest.actionCount).toBe(1)
    expect(latest.toolResults['fs_read']).toBeDefined()
    expect(onDone).toHaveBeenCalled()
    expect(onDone.mock.calls[0][0].checkpoint).toBeDefined()
    expect(onDone.mock.calls[0][0].checkpoint.actionCount).toBe(1)
  })

  it('attaches checkpoint to error when mid-flight failure occurs', async () => {
    scriptRounds([
      { toolCalls: [{ id: 'c1', name: 'fs_read', parsedArgs: { path: 'config.json' } }] },
      { throws: new Error('Watchdog timeout') },
    ])

    const checkpoints = []
    const onCheckpoint = vi.fn((cp) => checkpoints.push(cp))
    const onError = vi.fn()

    await runAgent({
      ...base,
      onCheckpoint,
      onError,
    })

    expect(onError).toHaveBeenCalled()
    const [err, cp] = onError.mock.calls[0]
    expect(err.message).toBe('Watchdog timeout')
    expect(cp).toBeDefined()
    expect(cp.actionCount).toBe(1)
    expect(cp.toolResults['fs_read']).toBeDefined()
  })

  it('resumes from checkpoint: retains tool results, injects resume directive, and completes turn', async () => {
    const resumeCheckpoint = {
      round: 1,
      messages: [
        { role: 'system', content: 'Base prompt' },
        { role: 'user', content: 'inspect and update files' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fs_read', arguments: '{"path":"config.json"}' } }] },
        { role: 'tool', tool_call_id: 'c1', name: 'fs_read', content: '{"ok":true,"data":"file content"}' },
      ],
      toolResults: {
        fs_read: { ok: true, data: 'file content' },
      },
      trace: [{ tool: 'fs_read', args: { path: 'config.json' }, status: 'done' }],
      actionCount: 1,
    }

    // Model resumes and writes file
    scriptRounds([
      { toolCalls: [{ id: 'c2', name: 'fs_write', parsedArgs: { path: 'config.json', content: 'updated' } }] },
      { tokens: ['Successfully applied updates from checkpoint!'] },
    ])

    const onDone = vi.fn()
    await runAgent({
      ...base,
      resumeCheckpoint,
      onDone,
    })

    expect(onDone).toHaveBeenCalled()
    const result = onDone.mock.calls[0][0]
    expect(result.content).toContain('Successfully applied updates from checkpoint!')
    expect(result.toolResults['fs_read']).toBeDefined()
    expect(result.toolResults['fs_write']).toBeDefined()
    expect(result.checkpoint.actionCount).toBe(2)
  })
})
