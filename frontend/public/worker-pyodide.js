/**
 * Pyodide Web Worker — Runs Python code off the main thread
 * Communicates via postMessage
 */

let pyodide = null
let isLoading = false
let loadPromise = null

// Load Pyodide and core packages
async function loadPyodideCore() {
  if (pyodide) return pyodide
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    isLoading = true
    try {
      // Import Pyodide from CDN
      const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js')
      pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
        stdout: (text) => postMessage({ type: 'stdout', data: text }),
        stderr: (text) => postMessage({ type: 'stderr', data: text }),
      })
      
      // Preload common packages
      await pyodide.loadPackage(['micropip', 'numpy', 'pandas', 'matplotlib'])
      
      postMessage({ type: 'ready' })
      return pyodide
    } catch (error) {
      postMessage({ type: 'error', data: error.message || String(error) })
      throw error
    } finally {
      isLoading = false
    }
  })()

  return loadPromise
}

// Execute Python code
async function runPython(code, packages = []) {
  if (!pyodide) {
    await loadPyodideCore()
  }
  
  // Install additional packages if requested
  if (packages.length > 0) {
    await pyodide.loadPackage(packages)
  }

  try {
    const result = await pyodide.runPythonAsync(code)
    // Convert result to JSON-serializable
    let serialized
    if (result === undefined || result === null) {
      serialized = null
    } else if (typeof result === 'object' && result.to_py) {
      // PyProxy object
      serialized = result.toJs({ dict_converter: Object.fromEntries })
    } else {
      serialized = result
    }
    return { success: true, result: serialized }
  } catch (error) {
    return { success: false, error: error.message || String(error), traceback: error.stack }
  }
}

// Handle messages from main thread
self.onmessage = async function(e) {
  const { id, type, code, packages, stdin } = e.data

  switch (type) {
    case 'init':
      try {
        await loadPyodideCore()
        postMessage({ id, type: 'ready' })
      } catch (error) {
        postMessage({ id, type: 'error', error: error.message || String(error) })
      }
      break

    case 'run':
      try {
        // Provide stdin if given
        if (stdin !== undefined) {
          pyodide.stdin = () => stdin
        }
        
        const result = await runPython(code, packages || [])
        postMessage({ id, ...result })
      } catch (error) {
        postMessage({ id, success: false, error: error.message || String(error) })
      }
      break

    case 'install':
      try {
        if (!pyodide) await loadPyodideCore()
        await pyodide.loadPackage(packages || [])
        postMessage({ id, type: 'installed', packages })
      } catch (error) {
        postMessage({ id, type: 'error', error: error.message || String(error) })
      }
      break

    case 'get-globals':
      try {
        if (!pyodide) await loadPyodideCore()
        const globals = {}
        for (const name of pyodide.globals.get('dir')()) {
          if (!name.startsWith('_')) {
            try {
              globals[name] = pyodide.globals.get(name).toJs()
            } catch {}
          }
        }
        postMessage({ id, type: 'globals', data: globals })
      } catch (error) {
        postMessage({ id, type: 'error', error: error.message || String(error) })
      }
      break

    case 'terminate':
      if (pyodide) {
        pyodide = null
        loadPromise = null
      }
      postMessage({ id, type: 'terminated' })
      break
  }
}

// Signal worker is loaded
postMessage({ type: 'worker-loaded' })
