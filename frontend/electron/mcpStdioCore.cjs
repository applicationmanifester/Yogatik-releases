// stdio MCP transport primitives. Pure and electron-free.
//
// mcp.js speaks Streamable HTTP only, and most published MCP servers are
// npx-launched stdio processes — so the app could reach almost none of the
// ecosystem. This is the wire layer for the stdio half; mcpStdio.cjs does the
// spawning.
//
// stdio MCP frames messages as newline-delimited JSON.

/** Buffers partial chunks and emits one parsed message per complete line. */
function createFramer(onMessage, { maxLine = 4 * 1024 * 1024 } = {}) {
  let buf = ''
  let skipping = false

  return {
    push(chunk) {
      buf += String(chunk ?? '')

      // A line longer than the cap means the peer is malfunctioning; discard
      // until the next newline rather than growing the buffer without bound.
      if (buf.length > maxLine && !buf.includes('\n')) {
        buf = ''
        skipping = true
        return
      }

      let nl
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (skipping) { skipping = false; continue }
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue } // skip malformed frame
        try { onMessage(msg) } catch { /* a handler error must not kill the stream */ }
      }
    },
    reset() { buf = ''; skipping = false },
  }
}

function buildRpc() {
  let id = 0
  return {
    request(method, params) {
      id += 1
      return { jsonrpc: '2.0', id, method, params: params ?? {} }
    },
    notify(method, params) {
      return { jsonrpc: '2.0', method, params: params ?? {} }
    },
  }
}

// The server command is spawned with an argument array, never through a shell.
// These characters are still rejected: their presence means the config was
// written expecting shell interpretation, which would silently not happen.
const DANGEROUS = /[;&|`$><\n\r]/

function isValidServerSpec(spec) {
  if (!spec || typeof spec.command !== 'string') return false
  const cmd = spec.command.trim()
  if (!cmd || DANGEROUS.test(cmd)) return false
  const args = spec.args ?? []
  if (!Array.isArray(args)) return false
  return args.every(a => typeof a === 'string' && !DANGEROUS.test(a))
}

module.exports = { createFramer, buildRpc, isValidServerSpec }
