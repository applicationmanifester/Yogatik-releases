// Pyodide — full Python interpreter in the browser via WASM
let pyodideReady = null

async function getPyodide() {
  if (pyodideReady) return pyodideReady
  pyodideReady = (async () => {
    if (!window.loadPyodide) {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js'
      document.head.appendChild(script)
      await new Promise((res, rej) => { script.onload = res; script.onerror = rej })
    }
    return await window.loadPyodide()
  })()
  return pyodideReady
}

export const codeExecTool = {
  schema: {
    description: 'Execute Python code in the browser (via Pyodide WASM). Supports numpy, pandas, etc.',
    parameters: { type: 'object', properties: {
      code: { type: 'string', description: 'Python code to execute' },
    }, required: ['code'] },
  },
  async execute({ code }) {
    try {
      const py = await getPyodide()
      // Capture stdout
      py.runPython(`
import sys, io
_stdout = io.StringIO()
sys.stdout = _stdout
`)
      let result
      try {
        result = py.runPython(code)
      } catch (e) {
        return { success: false, tool: 'code_execute', error: e.message, code }
      }
      const stdout = py.runPython('_stdout.getvalue()')
      py.runPython('sys.stdout = sys.__stdout__')

      const output = stdout || (result !== undefined && result !== null ? String(result) : '')
      return { success: true, tool: 'code_execute', output, code }
    } catch (e) {
      return { success: false, tool: 'code_execute', error: `Pyodide load failed: ${e.message}`, code }
    }
  }
}
