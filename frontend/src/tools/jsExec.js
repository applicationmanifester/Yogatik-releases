/**
 * js_execute — run JavaScript in a sandboxed Web Worker. Open, keyless, offline.
 * The counterpart to code_execute (Pyodide/Python): a worker has NO DOM, no page
 * access and no shared scope, so model-written code cannot touch the app. It is
 * killed at a hard timeout. Mirrors the code-interpreter tool the major agents
 * ship, using only the platform.
 */

const WORKER_SRC = `
self.onmessage = async (e) => {
  const logs = []
  const orig = console.log
  console.log = (...a) => { logs.push(a.map(String).join(' ')); orig(...a) }
  try {
    // Explicit 'return' or a trailing expression both work: the code is the body
    // of an async function, and a bare last expression is captured via eval only
    // when the author returns it. We wrap so 'return' is valid.
    const fn = new Function('return (async () => {' + e.data.code + '\\n})()')
    const value = await fn()
    self.postMessage({ ok: true, value, logs })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.stack || err), logs })
  }
}
`

function serialize(v) {
  if (v === undefined) return undefined
  try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
}

import { isDesktop } from './localFs'
import { terminalRunTool } from './terminalRun'

export const jsExecTool = {
  schema: {
    description:
      'Execute JavaScript in a sandboxed runner or Node environment. ' +
      'Returns anything console.log-ged and the value you `return`. ' +
      'Use for calculations, data transforms, JSON manipulation, string/regex work, algorithms, and quick simulations. ' +
      'Async/await is supported.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript to run. Use return X or console.log to output a value.' },
        timeout_ms: { type: 'number', description: 'Hard timeout (default 5000, max 15000)' },
      },
      required: ['code'],
    },
  },
  async execute({ code, timeout_ms = 5000 }) {
    if (!code?.trim()) return { success: false, error: 'No code provided' }

    // In Desktop Electron, prioritize direct VM eval or safe script runner (0 command-line length limit)
    if (isDesktop()) {
      try {
        const desktopBridge = typeof window !== 'undefined' ? window.__YOGATIK_DESKTOP__ : null
        if (desktopBridge?.evalJs) {
          const res = await desktopBridge.evalJs(code, timeout_ms)
          if (res.success) {
            return {
              success: true,
              tool: 'js_execute',
              result: res.result,
              output: res.output || (typeof res.result === 'string' ? res.result : JSON.stringify(res.result)),
              logs: res.logs || [],
            }
          }
          return {
            success: false,
            tool: 'js_execute',
            error: res.error || 'Execution failed',
            logs: res.logs || [],
          }
        }

        // Fallback: execute via Node terminal runner with temp file if code is large, avoiding cmd.exe length limit
        const wrapped = `(async () => {\n${code}\n})().then(v => { if (v !== undefined) console.log(typeof v === 'object' ? JSON.stringify(v, null, 2) : v); }).catch(e => { console.error(e && e.stack || e); process.exit(1); })`
        
        let res
        if (wrapped.length > 500) {
          const { fsWriteTool, fsDeleteTool } = await import('./localFs')
          const tmpFile = `.tmp_exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.cjs`
          try {
            await fsWriteTool.execute({ path: tmpFile, content: wrapped })
            res = await terminalRunTool.execute({ command: `node "${tmpFile}"`, timeout_ms })
          } finally {
            try { await fsDeleteTool.execute({ path: tmpFile }) } catch { /* best effort */ }
          }
        } else {
          const base64Code = typeof globalThis.Buffer !== 'undefined'
            ? globalThis.Buffer.from(wrapped, 'utf8').toString('base64')
            : btoa(unescape(encodeURIComponent(wrapped)))
          res = await terminalRunTool.execute({ command: `node -e "eval(Buffer.from('${base64Code}','base64').toString('utf8'))"`, timeout_ms })
        }

        if (res?.exit_code === 0 || res?.exitCode === 0) {
          const out = (res.stdout || res.output || '').trim()
          return { success: true, tool: 'js_execute', result: out, output: out, logs: out ? out.split('\n') : [] }
        }
        const err = (res?.stderr || res?.stdout || res?.error || '').trim()
        return { success: false, tool: 'js_execute', error: err || `Node process exited with code ${res?.exitCode ?? 1}`, logs: err ? err.split('\n') : [] }
      } catch (err) {
        return { success: false, tool: 'js_execute', error: String(err && err.message || err) }
      }
    }

    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      return { success: false, error: 'JavaScript execution needs a browser environment with Web Workers or Desktop app.' }
    }
    const limit = Math.min(Math.max(250, timeout_ms | 0), 15000)
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' }))
    const worker = new Worker(url)
    try {
      return await new Promise((resolve) => {
        const timer = setTimeout(() => {
          worker.terminate()
          resolve({ success: false, error: `Execution timed out after ${limit}ms (possible infinite loop).` })
        }, limit)
        worker.onmessage = (e) => {
          clearTimeout(timer)
          const { ok, value, error, logs = [] } = e.data || {}
          if (!ok && error && String(error).includes('unsafe-eval')) {
            resolve({
              success: false,
              tool: 'js_execute',
              error: 'Browser Content Security Policy blocks runtime eval in workers. In the Desktop App, full Node.js execution is available.',
              logs,
            })
            return
          }
          resolve(ok
            ? { success: true, tool: 'js_execute', result: serialize(value), logs, output: logs.join('\n') }
            : { success: false, tool: 'js_execute', error, logs })
        }
        worker.onerror = (e) => {
          clearTimeout(timer)
          resolve({ success: false, error: e.message || 'Worker error' })
        }
        worker.postMessage({ code: String(code || '') })
      })
    } finally {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  },
}
