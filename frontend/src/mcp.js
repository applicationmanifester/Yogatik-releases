/**
 * MCP (Model Context Protocol) client — two transports behind one unified interface:
 *   - http  : Streamable HTTP / SSE (JSON-RPC 2.0 over fetch). Works in the
 *             browser AND desktop, but the target server must send CORS headers.
 *   - stdio : LOCAL servers spawned by the Electron desktop app (filesystem,
 *             git, sqlite, postgres, …) that a browser can never reach. Routed through
 *             window.__YOGATIK_MCP_STDIO__; unavailable in the web build.
 *
 * High-Speed & Advanced Features:
 *   1. Stale-While-Revalidate Persistent Discovery Cache for instant schema availability.
 *   2. Parallel High-Throughput Handshake (tools/list, resources/list, prompts/list, templates/list).
 *   3. Resource Templates support (dynamic parameterized URIs).
 *   4. Multimodal & Multi-Part Response Normalization (images, binary resources, text).
 *   5. True JSON-RPC Ping / Health Liveness Checks.
 *   6. Dynamic On-Demand Search & Tool Filtering.
 */
import { getSetting, setSetting } from './db'
import { normalizeMcpCallResult, compactToolSchema } from './tools/mcpAdvanced'

const PROTOCOL_VERSION = '2025-06-18'
const SERVERS_KEY = 'mcp_servers'
const MCP_CACHE_KEY = 'mcp_discovery_cache_v2'

// In-memory registries
const _tools = new Map()       // name → { serverId, tool }
const _resources = new Map()   // serverId → [{ uri, name, description, mimeType }]
const _templates = new Map()   // serverId → [{ uriTemplate, name, description, mimeType }]
const _prompts = new Map()     // serverId → [{ name, description, arguments }]
const _servers = new Map()     // serverId → server object (for reconnect/routing)
const _sessions = new Map()    // serverId → sessionId (http)
let _connected = []

// Initialize cache from local storage if available for instant warm boot
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(MCP_CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Array.isArray(cached.tools)) {
        for (const t of cached.tools) _tools.set(t.name, { serverId: t.serverId, tool: t.tool })
      }
      if (cached.resources && typeof cached.resources === 'object') {
        for (const [k, v] of Object.entries(cached.resources)) _resources.set(k, v)
      }
      if (cached.templates && typeof cached.templates === 'object') {
        for (const [k, v] of Object.entries(cached.templates)) _templates.set(k, v)
      }
      if (cached.prompts && typeof cached.prompts === 'object') {
        for (const [k, v] of Object.entries(cached.prompts)) _prompts.set(k, v)
      }
      if (Array.isArray(cached.connected)) _connected = cached.connected
    }
  }
} catch { /* non-fatal */ }

function persistDiscoveryCache() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const dump = {
      tools: [..._tools.entries()].map(([name, val]) => ({ name, serverId: val.serverId, tool: val.tool })),
      resources: Object.fromEntries(_resources),
      templates: Object.fromEntries(_templates),
      prompts: Object.fromEntries(_prompts),
      connected: _connected,
      updatedAt: Date.now(),
    }
    window.localStorage.setItem(MCP_CACHE_KEY, JSON.stringify(dump))
  } catch { /* storage full or unavailable */ }
}

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

/** One JSON-RPC round-trip over HTTP with timeout guard. */
async function httpRpc(url, method, params, { headers = {}, sessionId, timeoutMs = 25000 } = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++_id, method, params }),
      signal: controller.signal,
    })
    const newSession = resp.headers.get('Mcp-Session-Id') || sessionId
    const body = parseRpcBody(resp.headers.get('content-type'), await resp.text())
    if (!resp.ok || body?.error) {
      throw new Error(body?.error?.message || `MCP ${method} failed (${resp.status})`)
    }
    return { result: body?.result, sessionId: newSession }
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Transport-aware JSON-RPC: routes to HTTP or the desktop stdio bridge. */
async function transportRpc(server, method, params, options = {}) {
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
    ...options,
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

/** Connect to one server: (start stdio) + initialize + list tools/resources/templates/prompts in parallel. */
export async function connectMcpServer(server) {
  if (server.enabled === false) {
    return { disabled: true, toolCount: 0, toolNames: [], resourceCount: 0, templateCount: 0, promptCount: 0 }
  }

  const serverId = server.id
  _servers.set(serverId, server)

  // Spawn local process first for stdio transport.
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

  // Fetch capabilities concurrently with Promise.allSettled for maximum throughput
  const [toolsRes, resourcesRes, templatesRes, promptsRes] = await Promise.allSettled([
    transportRpc(server, 'tools/list', {}, { timeoutMs: 10000 }),
    serverCapabilities.resources !== undefined
      ? transportRpc(server, 'resources/list', {}, { timeoutMs: 8000 })
      : Promise.resolve({ result: { resources: [] } }),
    serverCapabilities.resources !== undefined
      ? transportRpc(server, 'resources/templates/list', {}, { timeoutMs: 8000 })
      : Promise.resolve({ result: { resourceTemplates: [] } }),
    serverCapabilities.prompts !== undefined
      ? transportRpc(server, 'prompts/list', {}, { timeoutMs: 8000 })
      : Promise.resolve({ result: { prompts: [] } }),
  ])

  // Process tools
  const tools = toolsRes.status === 'fulfilled' ? (toolsRes.value.result?.tools || []) : []
  for (const t of tools) {
    _tools.set(mcpToolName(serverId, t.name), { serverId, tool: t })
  }

  // Process resources
  if (resourcesRes.status === 'fulfilled') {
    _resources.set(serverId, resourcesRes.value.result?.resources || [])
  }

  // Process templates
  if (templatesRes.status === 'fulfilled') {
    _templates.set(serverId, templatesRes.value.result?.resourceTemplates || [])
  }

  // Process prompts
  if (promptsRes.status === 'fulfilled') {
    _prompts.set(serverId, promptsRes.value.result?.prompts || [])
  }

  persistDiscoveryCache()

  return {
    toolCount: tools.length,
    toolNames: tools.map(t => t.name),
    resourceCount: (_resources.get(serverId) || []).length,
    templateCount: (_templates.get(serverId) || []).length,
    promptCount: (_prompts.get(serverId) || []).length,
  }
}

/** Check health and RTT ping of a specific server. */
export async function pingMcpServer(server) {
  const started = Date.now()
  try {
    if (server.transport === 'stdio') {
      const br = stdioBridge()
      if (!br) return { ok: false, error: 'Desktop stdio bridge not available' }
      const res = await br.rpc(server.id, 'ping', {})
      return { ok: !res?.error, latencyMs: Date.now() - started }
    }
    await httpRpc(server.url, 'ping', {}, { headers: buildServerHeaders(server), timeoutMs: 5000 })
    return { ok: true, latencyMs: Date.now() - started }
  } catch (e) {
    return { ok: false, error: e.message, latencyMs: Date.now() - started }
  }
}

/** Connect every configured server in parallel; returns a per-server status list with latency. */
export async function refreshMcpTools() {
  _tools.clear(); _resources.clear(); _templates.clear(); _prompts.clear(); _servers.clear(); _sessions.clear()
  const servers = await getMcpServers()

  const status = await Promise.all(servers.map(async (s) => {
    if (s.enabled === false) {
      return {
        id: s.id, name: s.name, ok: true, enabled: false, transport: s.transport || 'http',
        tools: 0, toolNames: [], resources: 0, prompts: 0, templates: 0, at: Date.now(),
      }
    }
    const startedAt = Date.now()
    try {
      const info = await connectMcpServer(s)
      return {
        id: s.id, name: s.name, ok: true, enabled: true, transport: s.transport || 'http',
        latencyMs: Date.now() - startedAt, at: Date.now(),
        tools: info.toolCount, toolNames: info.toolNames,
        resources: info.resourceCount, templates: info.templateCount, prompts: info.promptCount,
      }
    } catch (e) {
      return { id: s.id, name: s.name, ok: false, enabled: true, transport: s.transport || 'http', error: e.message, at: Date.now() }
    }
  }))

  _connected = status
  persistDiscoveryCache()
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

/** OpenAI-style function schemas for all discovered MCP tools (from cache) with schema compaction. */
export function getMcpSchemas() {
  return [..._tools.entries()].map(([name, { tool }]) => ({
    type: 'function',
    function: {
      name,
      description: `[MCP:${name.split('__')[1]}] ${tool.description || tool.name}`,
      parameters: compactToolSchema(tool.inputSchema || { type: 'object', properties: {} }),
    },
  }))
}

export function isMcpTool(name) { return typeof name === 'string' && name.startsWith('mcp__') }

/** Invoke a discovered MCP tool by its namespaced name with multi-part normalization & session retry. */
export async function callMcpTool(name, args, _retried = false) {
  const entry = _tools.get(name)
  if (!entry) return { success: false, error: `Unknown MCP tool: ${name}` }
  const server = _servers.get(entry.serverId)
  if (!server) return { success: false, error: `Server ${entry.serverId} not connected` }

  try {
    const { result } = await transportRpc(server, 'tools/call', { name: entry.tool.name, arguments: args || {} })
    const normalized = normalizeMcpCallResult(result)

    return {
      success: !result?.isError,
      tool: name,
      text: normalized.text,
      images: normalized.images,
      resources: normalized.resources,
      content: result?.content,
      structured: normalized.structured,
      _mcpResult: true,
    }
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

/** List resource templates across all connected servers (or one specific server). */
export function getMcpResourceTemplates(serverId) {
  if (serverId) return _templates.get(serverId) || []
  const all = []
  for (const [sid, list] of _templates) all.push(...list.map(t => ({ ...t, _serverId: sid })))
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

/** Directly test an MCP tool from the UI with arbitrary JSON arguments. */
export async function testMcpTool(serverId, toolName, args = {}) {
  const fullToolName = mcpToolName(serverId, toolName)
  const started = Date.now()
  const result = await callMcpTool(fullToolName, args)
  return {
    ...result,
    latencyMs: Date.now() - started,
  }
}
