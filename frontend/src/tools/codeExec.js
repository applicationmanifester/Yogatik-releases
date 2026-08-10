// Pyodide — full Python interpreter in the browser via WASM.
// Stateful: the interpreter and its global namespace persist across calls
// (variables, imports and installed packages carry over), like a Jupyter kernel.
let pyodideReady = null
let micropip = null

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
    description:
      'Execute Python in the browser (Pyodide WASM). STATEFUL: variables, imports and installed ' +
      'packages persist across calls in this conversation, like a Jupyter kernel. numpy/pandas/etc. ' +
      'from imports load automatically; top-level await is supported. Pass packages[] to pip-install ' +
      'pure-Python wheels via micropip, or reset:true to clear the kernel.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code. Builds on state from previous calls.' },
        packages: { type: 'array', items: { type: 'string' }, description: 'Extra packages to pip-install (micropip) before running.' },
        reset: { type: 'boolean', description: 'Clear all variables/imports before running.' },
      },
      required: ['code'],
    },
  },
  async execute({ code, packages, reset }) {
    let py
    try {
      py = await getPyodide()
    } catch (e) {
      return { success: false, tool: 'code_execute', error: `Pyodide load failed: ${e.message}`, code }
    }

    try {
      if (reset) py.globals.clear()

      // Auto-load any package the code imports that Pyodide ships (numpy, pandas…).
      try { await py.loadPackagesFromImports(code) } catch { /* import may be pure-python */ }

      // pip-install extra pure-Python wheels on request.
      const installed = []
      if (packages?.length) {
        if (!micropip) { await py.loadPackage('micropip'); micropip = py.pyimport('micropip') }
        for (const pkg of packages) {
          try { await micropip.install(String(pkg)); installed.push(pkg) } catch (e) {
            return { success: false, tool: 'code_execute', error: `Could not install "${pkg}": ${e.message}`, code }
          }
        }
      }

      // Capture stdout + stderr around the run.
      py.runPython('import sys, io\n_out = io.StringIO()\n_err = io.StringIO()\n_o, _e = sys.stdout, sys.stderr\nsys.stdout, sys.stderr = _out, _err')
      let result
      try {
        result = await py.runPythonAsync(code)   // async → top-level await works
      } catch (e) {
        py.runPython('sys.stdout, sys.stderr = _o, _e')
        const err = py.runPython('_err.getvalue()')
        return { success: false, tool: 'code_execute', error: (err || e.message || '').trim(), code }
      }
      py.runPython('sys.stdout, sys.stderr = _o, _e')
      const stdout = py.runPython('_out.getvalue()')
      const stderr = py.runPython('_err.getvalue()')

      const output = stdout || (result !== undefined && result !== null ? String(result) : '')
      return {
        success: true, tool: 'code_execute', output,
        ...(stderr ? { stderr } : {}),
        ...(installed.length ? { installed } : {}),
        stateful: true, code,
      }
    } catch (e) {
      return { success: false, tool: 'code_execute', error: e.message, code }
    }
  },
}
