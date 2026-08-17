// stdio MCP servers: spawn, handshake, tools/list, tools/call.
//
// Unlocks the npx-launched MCP ecosystem, which the HTTP-only client in
// src/mcp.js cannot reach. The server process is spawned with an argument
// array — never a shell string — and is killed on quit.

const { ipcMain } = require('electron')
const { spawn } = require('child_process')
const { createFramer, buildRpc, isValidServerSpec } = require('./mcpStdioCore.cjs')

const servers = new Map() // name -> { child, framer, rpc, pending, tools, ready }
const CALL_TIMEOUT = 60000

function send(srv, msg) {
  try { srv.child.stdin.write(JSON.stringify(msg) + '\n') } catch { /* dead pipe */ }
}

function call(srv, method, params, timeout = CALL_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const msg = srv.rpc.request(method, params)
    const timer = setTimeout(() => {
      srv.pending.delete(msg.id)
      reject(new Error(`MCP ${method} timed out`))
    }, timeout)
    srv.pending.set(msg.id, { resolve, reject, timer })
    send(srv, msg)
  })
}

async function startServer(name, spec) {
  if (!isValidServerSpec(spec)) throw new Error('Invalid MCP server command.')
  await stopServer(name)

  const child = spawn(spec.command, spec.args || [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    cwd: spec.cwd || undefined,
    env: { ...process.env, ...(spec.env || {}) },
  })

  const srv = { child, rpc: buildRpc(), pending: new Map(), tools: [], stderr: '' }
  srv.framer = createFramer((msg) => {
    if (msg.id != null && srv.pending.has(msg.id)) {
      const p = srv.pending.get(msg.id)
      srv.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(msg.error.message || 'MCP error'))
      else p.resolve(msg.result)
    }
  })

  child.stdout.on('data', d => srv.framer.push(d.toString('utf8')))
  child.stderr.on('data', d => { srv.stderr = (srv.stderr + d.toString('utf8')).slice(-4000) })
  child.on('close', () => {
    for (const [, p] of srv.pending) { clearTimeout(p.timer); p.reject(new Error('MCP server exited')) }
    srv.pending.clear()
    servers.delete(name)
  })
  child.on('error', () => { servers.delete(name) })

  servers.set(name, srv)

  await call(srv, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'Yogatik', version: '3.9' },
  }, 20000)
  send(srv, srv.rpc.notify('notifications/initialized'))

  const listed = await call(srv, 'tools/list', {}, 20000)
  srv.tools = listed?.tools || []
  return srv.tools
}

async function stopServer(name) {
  const srv = servers.get(name)
  if (!srv) return
  try { srv.child.kill() } catch { /* ignore */ }
  servers.delete(name)
}

function stopAll() {
  for (const name of [...servers.keys()]) stopServer(name)
}

function registerMcpStdioIpc() {
  ipcMain.handle('mcp_stdio_start', async (_e, { name, spec } = {}) => {
    try {
      const tools = await startServer(name, spec)
      return { success: true, name, tools }
    } catch (e) {
      const srv = servers.get(name)
      const detail = srv?.stderr ? ` — ${srv.stderr.slice(-300)}` : ''
      return { success: false, error: (e.message || String(e)) + detail }
    }
  })

  ipcMain.handle('mcp_stdio_call', async (_e, { name, tool, args } = {}) => {
    const srv = servers.get(name)
    if (!srv) return { success: false, error: `MCP server "${name}" is not running.` }
    try {
      const result = await call(srv, 'tools/call', { name: tool, arguments: args || {} })
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('mcp_stdio_stop', async (_e, { name } = {}) => {
    await stopServer(name)
    return { success: true }
  })

  ipcMain.handle('mcp_stdio_list', () =>
    [...servers.entries()].map(([name, s]) => ({ name, tools: s.tools.map(t => t.name) })))
}

module.exports = { registerMcpStdioIpc, startServer, stopServer, stopAll }
