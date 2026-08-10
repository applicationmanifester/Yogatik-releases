import { describe, it, expect } from 'vitest'
import { parseRpcBody, mcpToolName, isMcpTool, getMcpSchemas } from './mcp'

describe('MCP client helpers', () => {
  it('parses a plain JSON-RPC body', () => {
    const body = parseRpcBody('application/json', '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')
    expect(body.result.ok).toBe(true)
  })

  it('parses the last data: frame from an SSE stream', () => {
    const sse = 'event: message\ndata: {"id":1,"result":{"tools":[]}}\n\ndata: {"id":2,"result":{"final":true}}\n\n'
    const body = parseRpcBody('text/event-stream', sse)
    expect(body.result.final).toBe(true)
  })

  it('namespaces tool names and recognizes them', () => {
    const n = mcpToolName('github', 'create_issue')
    expect(n).toBe('mcp__github__create_issue')
    expect(isMcpTool(n)).toBe(true)
    expect(isMcpTool('weather')).toBe(false)
  })

  it('returns no schemas before any server connects', () => {
    expect(getMcpSchemas()).toEqual([])
  })
})
