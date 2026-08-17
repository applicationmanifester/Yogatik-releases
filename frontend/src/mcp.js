/**
 * MCP (Model Context Protocol) client — two transports behind one interface:
 *   - http  : Streamable HTTP / SSE (JSON-RPC 2.0 over fetch). Works in the
 *             browser AND desktop, but the target server must send CORS headers.
 *   - stdio : LOCAL servers spawned by the Electron desktop app (filesystem,
 *             git, sqlite, …) that a browser can never reach. Routed through
 *             window.__YOGATIK_MCP_STDIO__; unavailable in the web build.
 *
 * Discovers each server's tools, resources and prompts and exposes them to the
 * agent as namespaced function-calling tools (mcp__<server>__<tool>) plus the
 * generic mcp_resource / mcp_prompt tools (see tools/mcpTools.js).
 *
 * Reliability: a call that fails on an expired session / 401 reconnects the
 * server once and retries. refreshMcpTools records per-server latency + status.
 * Auth: each server entry may carry `token` (Bearer) or raw `headers`.
 */
import { getSetting, setSetting } from './db'

const PROTOCOL_VERSION = '2025-06-18'
const SERVERS_KEY = 'mcp_servers'

// name → { serverId, tool } for cached discovered tools (routing via _servers).
const _tools = new Map()
const _resources = new Map()   // serverId → [{ uri, name, description, mimeType }]
const _prompts = new Map()     // serverId → [{ name, description, arguments }]
const _servers = new Map()     // serverId → server object (for reconnect/routing)
const _sessions = new Map()    // serverId → sessionId (http)
let _connected = []

export async function getMcpServers() {
  const own = (await getSetting(SERVERS_KEY, [])) || []
  // Plugin-contributed servers merge in (read-time, not persisted here).
  let fromPlugins = []
  try {
    const { pluginMcpServers } = await import('./plugins')
    fromPlugins = await pluginMcpServers()
  } catch { /* plugins optional */ }
  const ownIds = new Set(own.map(s => s.id))
  return [...own, ...fromPlugins.filter(s => !ownIds.has(s.id))]
}
export async function setMcpServers(list) { return setSetting(SERVERS_KEY, list || []) }

/** Build auth headers for a server entry. Supports `token` (Bearer) or raw `headers`. */
function buildServerHeaders(server) {
  const custom = server.headers || {}
  if (server.token && !custom['Authorization']) {
    return { Authorization: `Bearer ${server.token}`, ...custom }
  }
  return custom
}

/** Parse a Streamable-HTTP response body: JSON, or SSE with data: lines. */
export function parseRpcBody(contentType, text) {
  if (/text\/event-stream/i.test(contentType || '')) {
    const payloads = [...text.matchAll(/^data:\s*(.+)$/gm)].map(m => m[1])
    for (let i = payloads.length - 1; i >= 0; i--) {
      try { return JSON.parse(payloads[i]) } catch { /* keep looking */ }
    }
    return null
  }
  try { return JSON.parse(text) } catch { return null }
}

/** True if an error looks like an expired/invalid session or auth failure. */
export function isSessionError(msg = '') {
  return /\b(401|403|404)\b/.test(msg) || /session|expired|unauthor/i.test(msg)
}

const stdioBridge = () =>
  (typeof window !== 'undefined' && window.__YOGATIK_MCP_STDIO__) || null

let _id = 0

/** One JSON-RPC round-trip over HTTP. */
async function httpRpc(url, method, params, { headers = {}, sessionId } = {}) {
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

/** Transport-aware JSON-RPC: routes to HTTP or the desktop stdio bridge. */
async function transportRpc(server, method, params) {
  if (server.transport === 'stdio') {
    const br = stdioBridge()
    if (!br) throw new Error('Local (stdio) MCP servers require the Yogatik desktop app.')
    const res = await br.rpc(server.id, method, params)
    if (res?.error) throw new Error(res.error.message || `MCP ${method} failed`)
    return { result: res?.result, sessionId: null }
  }
  const out = await httpRpc(server.url, method, params, {
    headers: buildServerHeaders(server),
    sessionId: _sessions.get(server.id),
  })
  if (out.sessionId) _sessions.set(server.id, out.sessionId)
  return out
}

/** Best-effort "initialized" notification (no response expected). */
async function sendInitialized(server) {
  try {
    if (server.transport === 'stdio') {
      await stdioBridge()?.notify?.(server.id, 'notifications/initialized', {})
      return
    }
    await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_sessions.get(server.id) ? { 'Mcp-Session-Id': _sessions.get(server.id) } : {}),
        ...buildServerHeaders(server),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
  } catch { /* not fatal */ }
}

/** Namespaced tool name so calls route back to the right server. */
export const mcpToolName = (serverId, tool) => `mcp__${serverId}__${tool}`

/** Connect to one server: (start stdio) + initialize + list tools/resources/prompts. */
export async function connectMcpServer(server) {
  const serverId = server.id
  _servers.set(serverId, server)

  // Spawn the local process first for stdio transport.
  if (server.transport === 'stdio') {
    const br = stdioBridge()
    if (!br) throw new Error('Local (stdio) MCP servers require the Yogatik desktop app.')
    const started = await br.start({ id: serverId, command: server.command, args: server.args, env: server.env, cwd: server.cwd })
    if (started && started.success === false) throw new Error(started.error || 'Failed to start local MCP server')
  }

  const init = await transportRpc(server, 'initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { resources: {}, prompts: {} },
    clientInfo: { name: 'Yogatik', version: '3' },
  })
  const serverCapabilities = init.result?.capabilities || {}
  await sendInitialized(server)

  const listed = await transportRpc(server, 'tools/list', {})
  const tools = listed.result?.tools || []
  for (const t of tools) _tools.set(mcpToolName(serverId, t.name), { serverId, tool: t })

  if (serverCapabilities.resources !== undefined) {
    try {
      const r = await transportRpc(server, 'resources/list', {})
      _resources.set(serverId, r.result?.resources || [])
    } catch { /* optional */ }
  }
  if (serverCapabilities.prompts !== undefined) {
    try {
      const p = await transportRpc(server, 'prompts/list', {})
      _prompts.set(serverId, p.result?.prompts || [])
    } catch { /* optional */ }
  }

  return {
    toolCount: tools.length,
    toolNames: tools.map(t => t.name),
    resourceCount: (_resources.get(serverId) || []).length,
    promptCount: (_prompts.get(serverId) || []).length,
  }
}

/** Connect every configured server; returns a per-server status list with latency. */
export async function refreshMcpTools() {
  _tools.clear(); _resources.clear(); _prompts.clear(); _servers.clear(); _sessions.clear()
  const servers = await getMcpServers()
  const status = await Promise.all(servers.map(async (s) => {
    const startedAt = Date.now()
    try {
      const info = await connectMcpServer(s)
      return {
        id: s.id, name: s.name, ok: true, transport: s.transport || 'http',
        latencyMs: Date.now() - startedAt, at: Date.now(),
        tools: info.toolCount, toolNames: info.toolNames,
        resources: info.resourceCount, prompts: info.promptCount,
      }
    } catch (e) {
      return { id: s.id, name: s.name, ok: false, transport: s.transport || 'http', error: e.message, at: Date.now() }
    }
  }))
  _connected = status
  return status
}

export function mcpStatus() { return _connected }

/** Reconnect a single server (fresh session) — used to heal an expired session. */
async function reconnectServer(serverId) {
  const server = _servers.get(serverId)
  if (!server) return false
  _sessions.delete(serverId)
  try { await connectMcpServer(server); return true } catch { return false }
}

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

/** Invoke a discovered MCP tool by its namespaced name (reconnect-once on session loss). */
export async function callMcpTool(name, args, _retried = false) {
  const entry = _tools.get(name)
  if (!entry) return { success: false, error: `Unknown MCP tool: ${name}` }
  const server = _servers.get(entry.serverId)
  if (!server) return { success: false, error: `Server ${entry.serverId} not connected` }
  try {
    const { result } = await transportRpc(server, 'tools/call', { name: entry.tool.name, arguments: args || {} })
    const text = (result?.content || [])
      .map(c => c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text || '') : '')
      .filter(Boolean).join('\n')
    return { success: !result?.isError, tool: name, text, content: result?.content, structured: result?.structuredContent, _mcpResult: true }
  } catch (e) {
    if (!_retried && isSessionError(e.message) && await reconnectServer(entry.serverId)) {
      return callMcpTool(name, args, true)
    }
    return { success: false, tool: name, error: e.message }
  }
}

/** List resources for a specific server (by serverId), or all servers if omitted. */
export function getMcpResources(serverId) {
  if (serverId) return _resources.get(serverId) || []
  const all = []
  for (const [sid, list] of _resources) all.push(...list.map(r => ({ ...r, _serverId: sid })))
  return all
}

/** Read a specific MCP resource by URI (reconnect-once on session loss). */
export async function readMcpResource(serverId, uri, _retried = false) {
  const server = _servers.get(serverId)
  if (!server) return { success: false, error: `Server ${serverId} not connected` }
  try {
    const { result } = await transportRpc(server, 'resources/read', { uri })
    return { success: true, uri, contents: result?.contents || [] }
  } catch (e) {
    if (!_retried && isSessionError(e.message) && await reconnectServer(serverId)) {
      return readMcpResource(serverId, uri, true)
    }
    return { success: false, uri, error: e.message }
  }
}

/** List prompts across all connected servers (or one specific server). */
export function getMcpPrompts(serverId) {
  if (serverId) return _prompts.get(serverId) || []
  const all = []
  for (const [sid, list] of _prompts) all.push(...list.map(p => ({ ...p, _serverId: sid })))
  return all
}

/** Retrieve a specific prompt by name from a server (reconnect-once on session loss). */
export async function getMcpPrompt(serverId, name, args = {}, _retried = false) {
  const server = _servers.get(serverId)
  if (!server) return { success: false, error: `Server ${serverId} not connected` }
  try {
    const { result } = await transportRpc(server, 'prompts/get', { name, arguments: args })
    return { success: true, name, messages: result?.messages || [] }
  } catch (e) {
    if (!_retried && isSessionError(e.message) && await reconnectServer(serverId)) {
      return getMcpPrompt(serverId, name, args, true)
    }
    return { success: false, name, error: e.message }
  }
}
