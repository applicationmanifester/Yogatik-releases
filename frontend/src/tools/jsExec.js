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

export const jsExecTool = {
  schema: {
    description:
      'Execute JavaScript in a sandboxed Web Worker (no DOM, no network to the page, no app access). ' +
      'Returns anything console.log-ged and the value you `return`. ' +
      'Use for calculations, data transforms, JSON manipulation, string/regex work, algorithms, and quick simulations — anything more reliable done in code than by hand. Async/await is supported.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript to run. Use return X to output a value.' },
        timeout_ms: { type: 'number', description: 'Hard timeout (default 5000, max 15000)' },
      },
      required: ['code'],
    },
  },
  async execute({ code, timeout_ms = 5000 }) {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      return { success: false, error: 'JavaScript execution needs a browser environment with Web Workers.' }
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
          const { ok, value, error, logs } = e.data || {}
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
