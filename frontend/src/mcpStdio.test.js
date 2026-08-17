import { describe, it, expect } from 'vitest'
import { createFramer, buildRpc, isValidServerSpec } from '../electron/mcpStdioCore.cjs'

describe('createFramer', () => {
  it('emits one message per newline-delimited JSON line', () => {
    const seen = []
    const f = createFramer(m => seen.push(m))
    f.push('{"jsonrpc":"2.0","id":1,"result":{}}\n')
    expect(seen).toHaveLength(1)
    expect(seen[0].id).toBe(1)
  })

  it('reassembles a message split across chunks', () => {
    const seen = []
    const f = createFramer(m => seen.push(m))
    f.push('{"jsonrpc":"2.0","id":')
    expect(seen).toHaveLength(0)
    f.push('7,"result":{"ok":true}}\n')
    expect(seen[0].id).toBe(7)
    expect(seen[0].result.ok).toBe(true)
  })

  it('handles several messages in one chunk', () => {
    const seen = []
    const f = createFramer(m => seen.push(m))
    f.push('{"id":1}\n{"id":2}\n{"id":3}\n')
    expect(seen.map(m => m.id)).toEqual([1, 2, 3])
  })

  it('skips a malformed line instead of throwing', () => {
    const seen = []
    const f = createFramer(m => seen.push(m))
    expect(() => f.push('not json\n{"id":9}\n')).not.toThrow()
    expect(seen.map(m => m.id)).toEqual([9])
  })

  it('ignores blank lines', () => {
    const seen = []
    const f = createFramer(m => seen.push(m))
    f.push('\n\n{"id":1}\n\n')
    expect(seen).toHaveLength(1)
  })

  it('drops a pathologically long line rather than buffering forever', () => {
    const seen = []
    const f = createFramer(m => seen.push(m), { maxLine: 100 })
    f.push('x'.repeat(500))
    f.push('\n{"id":1}\n')
    expect(seen.map(m => m.id)).toEqual([1])
  })
})

describe('buildRpc', () => {
  it('builds a JSON-RPC request with an incrementing id', () => {
    const rpc = buildRpc()
    const a = rpc.request('tools/list', {})
    const b = rpc.request('tools/call', { name: 'x' })
    expect(a.jsonrpc).toBe('2.0')
    expect(b.id).toBe(a.id + 1)
    expect(b.method).toBe('tools/call')
  })

  it('builds a notification with no id', () => {
    const n = buildRpc().notify('notifications/initialized')
    expect(n.id).toBeUndefined()
    expect(n.method).toBe('notifications/initialized')
  })
})

describe('isValidServerSpec', () => {
  it('accepts a command with args', () => {
    expect(isValidServerSpec({ command: 'npx', args: ['-y', 'some-server'] })).toBe(true)
  })

  it('rejects a missing or empty command', () => {
    expect(isValidServerSpec({})).toBe(false)
    expect(isValidServerSpec({ command: '   ' })).toBe(false)
  })

  it('rejects shell metacharacters — the command is spawned, never shelled', () => {
    expect(isValidServerSpec({ command: 'npx; rm -rf /' })).toBe(false)
    expect(isValidServerSpec({ command: 'npx', args: ['`whoami`'] })).toBe(false)
  })

  it('rejects non-string args', () => {
    expect(isValidServerSpec({ command: 'npx', args: [1, 2] })).toBe(false)
  })
})
