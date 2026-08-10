/**
 * Minimal browser MCP (Model Context Protocol) client over Streamable HTTP.
 * Connects to remote MCP servers, discovers their tools, and exposes them to the
 * agent as ordinary function-calling tools (namespaced mcp__<server>__<tool>).
 *
 * No SDK dependency — it's a small JSON-RPC 2.0 client — to keep the bundle lean.
 * NOTE: the target MCP server must send CORS headers (a browser cannot reach a
 * non-CORS server directly, same as any cross-origin API). stdio servers are not
 * reachable from a browser at all.
 */
import { getSetting, setSetting } from './db'

const PROTOCOL_VERSION = '2025-06-18'
const SERVERS_KEY = 'mcp_servers'

// name → { serverId, url, headers, sessionId, tool } for cached discovered tools.
const _tools = new Map()
let _connected = []

export async function getMcpServers() { return (await getSetting(SERVERS_KEY, [])) || [] }
export async function setMcpServers(list) { return setSetting(SERVERS_KEY, list || []) }

/** Parse a Streamable-HTTP response body: JSON, or SSE with data: lines. */
export function parseRpcBody(contentType, text) {
  if (/text\/event-stream/i.test(contentType || '')) {
    // Take the last complete `data:` JSON payload in the stream.
    const payloads = [...text.matchAll(/^data:\s*(.+)$/gm)].map(m => m[1])
    for (let i = payloads.length - 1; i >= 0; i--) {
      try { return JSON.parse(payloads[i]) } catch { /* keep looking */ }
    }
    return null
  }
  try { return JSON.parse(text) } catch { return null }
}

let _id = 0
async function rpc(url, method, params, { headers = {}, sessionId } = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++_id, method, params }),
  })
  const newSession = resp.headers.get('Mcp-Session-Id') || sessionId
  const body = parseRpcBody(resp.headers.get('content-type'), await resp.text())
  if (!resp.ok || body?.error) {
    throw new Error(body?.error?.message || `MCP ${method} failed (${resp.status})`)
  }
  return { result: body?.result, sessionId: newSession }
}

/** Namespaced tool name so calls route back to the right server. */
export const mcpToolName = (serverId, tool) => `mcp__${serverId}__${tool}`

/** Connect to one server: initialize handshake + list tools. Returns tool count. */
export async function connectMcpServer(server) {
  const { id: serverId, url, headers } = server
  const init = await rpc(url, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'Yogatik', version: '3' },
  }, { headers })
  const sessionId = init.sessionId
  // Best-effort "initialized" notification (no id, no response expected).
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}), ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
  } catch { /* not fatal */ }

  const listed = await rpc(url, 'tools/list', {}, { headers, sessionId })
  const tools = listed.result?.tools || []
  for (const t of tools) {
    _tools.set(mcpToolName(serverId, t.name), { serverId, url, headers, sessionId, tool: t })
  }
  return tools.length
}

/** Connect every configured server; returns a per-server status list. */
export async function refreshMcpTools() {
  _tools.clear()
  const servers = await getMcpServers()
  const status = await Promise.all(servers.map(async (s) => {
    try { return { id: s.id, name: s.name, ok: true, tools: await connectMcpServer(s) } }
    catch (e) { return { id: s.id, name: s.name, ok: false, error: e.message } }
  }))
  _connected = status
  return status
}

export function mcpStatus() { return _connected }

/** OpenAI-style function schemas for all discovered MCP tools (from cache). */
export function getMcpSchemas() {
  return [..._tools.entries()].map(([name, { tool }]) => ({
    type: 'function',
    function: {
      name,
      description: `[MCP:${name.split('__')[1]}] ${tool.description || tool.name}`,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  }))
}

export function isMcpTool(name) { return typeof name === 'string' && name.startsWith('mcp__') }

/** Invoke a discovered MCP tool by its namespaced name. */
export async function callMcpTool(name, args) {
  const entry = _tools.get(name)
  if (!entry) return { success: false, error: `Unknown MCP tool: ${name}` }
  try {
    const { result } = await rpc(entry.url, 'tools/call',
      { name: entry.tool.name, arguments: args || {} },
      { headers: entry.headers, sessionId: entry.sessionId })
    // MCP returns content parts; flatten text for the model, keep structured too.
    const text = (result?.content || [])
      .map(c => c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text || '') : '')
      .filter(Boolean).join('\n')
    return { success: !result?.isError, tool: name, text, content: result?.content, structured: result?.structuredContent }
  } catch (e) {
    return { success: false, tool: name, error: e.message }
  }
}
