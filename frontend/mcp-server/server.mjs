#!/usr/bin/env node
/**
 * Yogatik MCP server — standalone, zero-Electron, zero-browser Node process
 * that exposes a slice of Yogatik's own tool registry over MCP stdio, so any
 * MCP client (Claude Code, Cursor, Claude Desktop, a company's own agent)
 * can call straight into Yogatik's tools without Yogatik itself running.
 *
 * This is the flip side of mcp.js/electron/mcpStdio.cjs, which make Yogatik
 * an MCP CLIENT (it connects OUT to other people's servers, over http or
 * stdio). This file makes Yogatik an MCP SERVER — something else connects IN
 * to it. Same protocol, opposite direction, and deliberately a SEPARATE tiny
 * process rather than a mode flag on the desktop app: an MCP server has to
 * speak nothing but newline-delimited JSON-RPC on stdout (electron/
 * mcpStdio.cjs's own client-side comment says the same thing about the
 * processes IT spawns), and Yogatik's real process logs, renders a UI and
 * imports Electron/DOM-dependent modules that would either corrupt that
 * stream or simply fail to load under plain Node.
 *
 * WHICH TOOLS, AND WHY ONLY THESE: hand-picked to what can run standalone
 * with zero risk — no provider API key, no browser (DOM/canvas/WebGPU), no
 * Electron, no access to this app's own IndexedDB/settings/working folders.
 * Everything here is either pure arithmetic/text (calculator, unit_convert,
 * hash, regex, data_convert, diff, uuid, password_generate, number_base,
 * cron_next, timezone) or one of two well-known, keyless, CORS-friendly
 * public APIs (thesaurus via Datamuse, country_info via REST Countries).
 * Every tool below is IMPORTED DIRECTLY from the real frontend/src/tools/
 * source — never reimplemented or copied — so this server can never drift
 * from what the app itself does; a fix to calculator.js is a fix here too,
 * for free, the next time this process restarts.
 *
 * NOT exposed, deliberately, and why: fs_* / terminal_run / browser_control /
 * computer_control (need a granted working folder + a real desktop app
 * instance — the whole point of this process is that Yogatik is NOT
 * running); web_search/deep_research/weather/image_generate/etc. (need
 * Yogatik's own proxy worker cooldown/relay-health state, which lives only
 * inside the running app, or a provider key the app manages); memory/todo/
 * scheduler (need this app's own IndexedDB, which a bare Node process has
 * no access to — there is no browser here to hold it); finance_analytics
 * (deferred — its import chain is deep enough, five sibling pure modules
 * plus whatever THEY import, that verifying every hop is Node-ESM-safe
 * without a real Node process to run it in was not something to guess at;
 * a concrete, scoped follow-up, not a silent omission).
 *
 * Two source files needed a one-line fix to be reachable from plain Node at
 * all, both still 100% Vite-compatible (Vite resolves an explicit `.js`
 * extension exactly like an extensionless one, so this changes nothing for
 * the browser build): tools/http.js's and tools/moretools.js's imports
 * lacked file extensions, which Vite's bundler resolves but Node's own ESM
 * loader refuses ("Directory import" / "Cannot find module") — see the
 * comments left at each of those two import lines, and in llm.js where
 * `import.meta.env` needed a `typeof import.meta !== 'undefined'` guard for
 * the same reason (a bare read of it threw immediately under plain Node,
 * before this server could load `tools/http.js`'s import of it, at all).
 *
 * RUN IT:
 *   node mcp-server/server.mjs
 * or, from Yogatik's own package.json:
 *   npm run mcp:server
 *
 * POINT A CLIENT AT IT (e.g. Claude Desktop's claude_desktop_config.json, or
 * Claude Code's `claude mcp add`):
 *   {
 *     "mcpServers": {
 *       "yogatik": { "command": "node", "args": ["/absolute/path/to/frontend/mcp-server/server.mjs"] }
 *     }
 *   }
 */

import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { calculatorTool } from '../src/tools/calculator.js'
import { unitConvertTool } from '../src/tools/unitConvert.js'
import { hashTool } from '../src/tools/hash.js'
import { regexTool } from '../src/tools/regex.js'
import { dataConvertTool } from '../src/tools/dataConvert.js'
import { diffTool } from '../src/tools/diff.js'
import {
  uuidTool, passwordTool, numberBaseTool, cronTool, timezoneTool, thesaurusTool, countryTool,
} from '../src/tools/moretools.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

export const TOOLS = {
  calculator: calculatorTool,
  unit_convert: unitConvertTool,
  hash: hashTool,
  regex: regexTool,
  data_convert: dataConvertTool,
  diff: diffTool,
  uuid: uuidTool,
  password_generate: passwordTool,
  number_base: numberBaseTool,
  cron_next: cronTool,
  timezone: timezoneTool,
  thesaurus: thesaurusTool,
  country_info: countryTool,
}

// The baseline MCP stdio protocol version this server speaks when a client
// does not name one in `initialize` (per spec, a server should otherwise
// echo back whatever the client requested — most clients send their own
// supported version and expect it reflected, not overridden).
const PROTOCOL_VERSION_FALLBACK = '2024-11-05'

/** MCP stdio: ONLY JSON-RPC messages may ever reach stdout. A stray log line
 * here corrupts the stream for every message after it — every diagnostic in
 * this file goes to stderr instead. */
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function toInputSchema(schema) {
  const params = schema?.parameters
  if (params && typeof params === 'object' && params.type) return params
  return { type: 'object', properties: {}, required: [] }
}

/** @returns the JSON-RPC reply object, or null for a request this server
 * intentionally does not answer (should not happen for a real request — see
 * the notification short-circuit in main() for the id-less case). */
export async function handleRequest(msg) {
  const { id, method, params } = msg

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: 'yogatik', version: pkg.version || '0.0.0' },
      },
    }
  }

  if (method === 'tools/list') {
    const tools = Object.entries(TOOLS).map(([name, t]) => ({
      name,
      description: t.schema?.description || name,
      inputSchema: toInputSchema(t.schema),
    }))
    return { jsonrpc: '2.0', id, result: { tools } }
  }

  if (method === 'tools/call') {
    const name = params?.name
    const tool = TOOLS[name]
    if (!tool) {
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Unknown tool "${name}". Available: ${Object.keys(TOOLS).join(', ')}` }],
          isError: true,
        },
      }
    }
    try {
      const result = await tool.execute(params?.arguments || {})
      // Yogatik's own tool contract: {success:false, error} on failure.
      // Surfacing that as MCP's isError:true (rather than a 200-shaped
      // success) is what lets a client retry or explain instead of reading
      // a failure as a real answer.
      const isError = !!(result && typeof result === 'object' && result.success === false)
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError,
        },
      }
    } catch (e) {
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Tool "${name}" threw: ${e?.message || e}` }],
          isError: true,
        },
      }
    }
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} }
  }

  // A request (has an id) for anything else is a real "we don't support
  // this" — e.g. resources/list or prompts/list, which this server never
  // declared in its `initialize` capabilities.
  if (id === undefined) return null
  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` },
  }
}

export function main() {
  const rl = createInterface({ input: process.stdin, terminal: false })
  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      return
    }
    // A JSON-RPC NOTIFICATION (no id) must never get a reply — most
    // commonly notifications/initialized, sent right after initialize.
    if (msg?.id === undefined && typeof msg?.method === 'string') {
      if (msg.method.startsWith('notifications/')) return
    }
    try {
      const reply = await handleRequest(msg)
      if (reply) send(reply)
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: e?.message || 'Internal error' } })
    }
  })
  process.stderr.write(`Yogatik MCP server ready — ${Object.keys(TOOLS).length} tools over stdio.\n`)
}

// Only run the server when executed directly (`node server.mjs`) — importing
// this module from a test must not start reading stdin.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
