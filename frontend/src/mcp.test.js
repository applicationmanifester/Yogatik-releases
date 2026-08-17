import { describe, it, expect } from 'vitest'
import { parseRpcBody, isSessionError, mcpToolName, isMcpTool } from './mcp'

describe('mcp transport helpers', () => {
  it('parses a plain JSON-RPC body', () => {
    expect(parseRpcBody('application/json', '{"result":{"ok":true}}')).toEqual({ result: { ok: true } })
  })

  it('parses the last data: frame from an SSE body', () => {
    const sse = 'event: message\ndata: {"result":1}\n\ndata: {"result":2}\n\n'
    expect(parseRpcBody('text/event-stream', sse)).toEqual({ result: 2 })
  })

  it('returns null on unparseable bodies', () => {
    expect(parseRpcBody('application/json', 'not json')).toBe(null)
  })

  it('detects session / auth errors for reconnect', () => {
    expect(isSessionError('MCP tools/call failed (401)')).toBe(true)
    expect(isSessionError('session expired')).toBe(true)
    expect(isSessionError('Not Found (404)')).toBe(true)
    expect(isSessionError('rate limit (429)')).toBe(false)
    expect(isSessionError('network error')).toBe(false)
  })

  it('namespaces and recognises MCP tool names', () => {
    expect(mcpToolName('srv', 'read')).toBe('mcp__srv__read')
    expect(isMcpTool('mcp__srv__read')).toBe(true)
    expect(isMcpTool('web_search')).toBe(false)
  })
})
