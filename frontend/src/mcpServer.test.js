/**
 * Exercises the standalone MCP server's protocol logic (mcp-server/server.mjs)
 * by calling handleRequest() directly with real JSON-RPC message shapes — the
 * same object shape the stdin readline loop in main() hands it, so this is a
 * genuine test of the protocol layer, not a reimplementation of it. main()'s
 * own stdin/stdout wiring is a thin thirty-line pass-through (parse a line,
 * call handleRequest, write the reply) and is not separately unit-tested here.
 */
import { describe, it, expect } from 'vitest'
import { TOOLS, handleRequest } from '../mcp-server/server.mjs'

describe('Yogatik MCP server', () => {
  it('initialize echoes the client\'s protocol version and advertises the tools capability', async () => {
    const reply = await handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(reply.result.protocolVersion).toBe('2025-06-18')
    expect(reply.result.capabilities).toEqual({ tools: {} })
    expect(reply.result.serverInfo.name).toBe('yogatik')
    expect(typeof reply.result.serverInfo.version).toBe('string')
  })

  it('initialize falls back to a baseline protocol version when the client names none', async () => {
    const reply = await handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(typeof reply.result.protocolVersion).toBe('string')
    expect(reply.result.protocolVersion.length).toBeGreaterThan(0)
  })

  it('tools/list exposes exactly the registered tools, each with a real object-typed inputSchema', async () => {
    const reply = await handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const names = reply.result.tools.map(t => t.name).sort()
    expect(names).toEqual(Object.keys(TOOLS).sort())
    for (const t of reply.result.tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('tools/call runs the REAL calculator tool (imported from the app, not reimplemented) and returns its exact result', async () => {
    const reply = await handleRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'calculator', arguments: { expression: '6 * 7' } },
    })
    expect(reply.result.isError).toBe(false)
    const payload = JSON.parse(reply.result.content[0].text)
    expect(payload.result).toBe(42)
  })

  it('a tool-level failure ({success:false}) is reported as MCP isError:true, never a JSON-RPC-level error', async () => {
    const reply = await handleRequest({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'calculator', arguments: { expression: '' } },
    })
    expect(reply.result.isError).toBe(true)
    expect(reply.error).toBeUndefined()
  })

  it('calling an unknown tool names the tools that actually exist, so a client can recover in one turn', async () => {
    const reply = await handleRequest({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'not_a_real_tool', arguments: {} },
    })
    expect(reply.result.isError).toBe(true)
    expect(reply.result.content[0].text).toMatch(/calculator/)
  })

  it('a thrown tool implementation is caught and reported as isError, never crashes the server', async () => {
    const reply = await handleRequest({
      jsonrpc: '2.0', id: 5.5, method: 'tools/call',
      // number_base with a value that is not a string at all exercises a
      // code path most tools do not explicitly guard — the server itself
      // must survive regardless of what the individual tool does with it.
      params: { name: 'number_base', arguments: { value: null } },
    })
    expect(reply.result.isError).toBe(true)
  })

  it('an unknown REQUEST (carries an id) gets a real JSON-RPC method-not-found error', async () => {
    const reply = await handleRequest({ jsonrpc: '2.0', id: 6, method: 'resources/list' })
    expect(reply.error.code).toBe(-32601)
  })

  it('a NOTIFICATION (no id) is never answered — replying to one violates JSON-RPC', async () => {
    const reply = await handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(reply).toBeNull()
  })

  it('ping answers with an empty result', async () => {
    const reply = await handleRequest({ jsonrpc: '2.0', id: 7, method: 'ping' })
    expect(reply.result).toEqual({})
  })

  it('every exposed tool actually runs end to end — real tools, not stubs', async () => {
    const cases = [
      ['unit_convert', { value: 5, from: 'km', to: 'mi' }, r => expect(r.result).toBeCloseTo(3.1069, 3)],
      ['hash', { text: 'hi', algorithm: 'sha256' }, r => expect(r.result).toHaveLength(64)],
      ['regex', { text: 'a1b2', pattern: '\\d', operation: 'find' }, r => expect(r.result).toHaveLength(2)],
      ['data_convert', { data: '{"a":1}', operation: 'prettify' }, r => expect(r.result).toContain('\n')],
      ['diff', { text1: 'a\nb', text2: 'a\nc' }, r => expect(r.changes).toBe(1)],
      ['uuid', {}, r => expect(r.ids).toHaveLength(1)],
      ['number_base', { value: '255' }, r => expect(r.hex).toBe('FF')],
      ['password_generate', { length: 12 }, r => expect(r.value).toHaveLength(12)],
      ['cron_next', { expression: '0 9 * * *' }, r => expect(r.next_runs.length).toBeGreaterThan(0)],
      ['timezone', { to: ['UTC'] }, r => expect(r.times.UTC).toBeTruthy()],
    ]
    for (const [name, args, assertFn] of cases) {
      const reply = await handleRequest({ jsonrpc: '2.0', id: name, method: 'tools/call', params: { name, arguments: args } })
      expect(reply.result.isError, `${name} should not error`).toBe(false)
      assertFn(JSON.parse(reply.result.content[0].text))
    }
  })
})
