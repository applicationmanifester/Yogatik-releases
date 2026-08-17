// Local (stdio) MCP servers — impossible in the browser. Spawns a user-configured
// MCP server as a child process and speaks newline-delimited JSON-RPC 2.0 over
// its stdin/stdout (the MCP stdio transport). This lets Yogatik desktop reach
// filesystem / git / sqlite / any local MCP server that has no HTTP endpoint.
//
// Renderer bridge: window.__YOGATIK_MCP_STDIO__.{start,rpc,notify,stop}. mcp.js
// routes servers with transport:'stdio' here instead of fetch.

const { ipcMain } = require('electron')
const { spawn } = require('child_process')

const servers = new Map() // id -> { proc, pending: Map, buffer, nextId }

function getOrError(id) {
  const s = servers.get(id)
  if (!s || !s.proc || s.proc.killed) return null
  return s
}

function handleLine(s, line) {
  const text = line.trim()
  if (!text) return
  let msg
  try { msg = JSON.parse(text) } catch { return } // ignore non-JSON (server logging)
  if (msg.id != null && s.pending.has(msg.id)) {
    const { resolve } = s.pending.get(msg.id)
    s.pending.delete(msg.id)
    resolve(msg)
  }
}

function registerMcpStdio() {
  ipcMain.handle('mcp-stdio:start', (_e, { id, command, args = [], env = {}, cwd } = {}) => {
    if (!id || !command) return { success: false, error: 'id and command are required' }
    // Reuse a live process.
    if (getOrError(id)) return { success: true, reused: true }
    try {
      const proc = spawn(command, Array.isArray(args) ? args : [], {
        cwd: cwd || undefined,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const s = { proc, pending: new Map(), buffer: '', nextId: 0 }
      servers.set(id, s)

      proc.stdout.on('data', (chunk) => {
        s.buffer += chunk.toString('utf8')
        let nl
        while ((nl = s.buffer.indexOf('\n')) >= 0) {
          const line = s.buffer.slice(0, nl)
          s.buffer = s.buffer.slice(nl + 1)
          handleLine(s, line)
        }
      })
      proc.stderr.on('data', () => { /* server logs — ignored */ })
      proc.on('exit', () => {
        for (const { reject } of s.pending.values()) reject(new Error('MCP server exited'))
        s.pending.clear()
        if (servers.get(id) === s) servers.delete(id)
      })
      proc.on('error', (err) => {
        for (const { reject } of s.pending.values()) reject(err)
        s.pending.clear()
        servers.delete(id)
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp-stdio:rpc', (_e, { id, method, params } = {}) => {
    const s = getOrError(id)
    if (!s) return Promise.resolve({ error: { message: `Local MCP server ${id} is not running` } })
    const rpcId = ++s.nextId
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (s.pending.has(rpcId)) {
          s.pending.delete(rpcId)
          resolve({ error: { message: `MCP ${method} timed out` } })
        }
      }, 30000)
      s.pending.set(rpcId, {
        resolve: (msg) => { clearTimeout(timer); resolve({ result: msg.result, error: msg.error }) },
        reject: (err) => { clearTimeout(timer); resolve({ error: { message: err.message } }) },
      })
      try {
        s.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rpcId, method, params: params || {} }) + '\n')
      } catch (err) {
        s.pending.delete(rpcId)
        clearTimeout(timer)
        resolve({ error: { message: err.message } })
      }
    })
  })

  ipcMain.handle('mcp-stdio:notify', (_e, { id, method, params } = {}) => {
    const s = getOrError(id)
    if (!s) return { success: false }
    try {
      s.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params: params || {} }) + '\n')
      return { success: true }
    } catch { return { success: false } }
  })

  ipcMain.handle('mcp-stdio:stop', (_e, id) => {
    const s = servers.get(id)
    if (s) { try { s.proc.kill() } catch { /* ignore */ } servers.delete(id) }
    return { success: true }
  })
}

function killAllMcpStdio() {
  for (const s of servers.values()) { try { s.proc.kill() } catch { /* ignore */ } }
  servers.clear()
}

module.exports = { registerMcpStdio, killAllMcpStdio }
