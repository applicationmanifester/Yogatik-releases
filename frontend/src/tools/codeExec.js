// Pyodide — full Python interpreter in the browser via WASM.
// Stateful: the interpreter and its global namespace persist across calls
// (variables, imports and installed packages carry over), like a Jupyter kernel.
import { saveMedia } from '../db'

let pyodideReady = null
let micropip = null

const MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', csv: 'text/csv', txt: 'text/plain',
  json: 'application/json', html: 'text/html', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip', wav: 'audio/wav', mp3: 'audio/mpeg', mp4: 'video/mp4',
}
const MAX_FILE_BYTES = 20 * 1024 * 1024   // don't try to surface a huge artefact
const MAX_FILES = 6

/** Recursively map path → mtime|size for the dirs the code might write to. */
function snapshotFiles(py, dirs) {
  const out = {}
  const walk = (dir) => {
    let entries
    try { entries = py.FS.readdir(dir) } catch { return }
    for (const name of entries) {
      if (name === '.' || name === '..') continue
      const path = dir.endsWith('/') ? dir + name : dir + '/' + name
      let st
      try { st = py.FS.stat(path) } catch { continue }
      if (py.FS.isDir(st.mode)) { if (!/\/(proc|dev|lib|sys)$/.test(path)) walk(path) }
      else out[path] = `${st.mtime?.getTime?.() ?? 0}:${st.size}`
    }
  }
  dirs.forEach(walk)
  return out
}

/** Read files that were created/modified during the run, save them as blobs. */
async function collectNewFiles(py, before) {
  const dirs = ['/tmp']
  try { dirs.push(py.FS.cwd()) } catch { /* default cwd only */ }
  const after = snapshotFiles(py, dirs)
  const changed = Object.keys(after).filter(p => after[p] !== before[p])
  const files = []
  for (const path of changed.slice(0, MAX_FILES)) {
    try {
      const bytes = py.FS.readFile(path, { encoding: 'binary' })   // Uint8Array
      if (!bytes?.length || bytes.length > MAX_FILE_BYTES) continue
      const name = path.split('/').pop()
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
      const mime = MIME[ext] || 'application/octet-stream'
      const blob = new Blob([bytes], { type: mime })
      const media_id = await saveMedia({ blob, mime, filename: name, meta: { from: 'code_execute' } })
      files.push({ name, bytes: bytes.length, mime, media_id })
    } catch { /* skip unreadable file */ }
  }
  return files
}

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

export function prewarmPyodide() {
  getPyodide().catch(() => {})
}

export const codeExecTool = {
  schema: {
    description:
      'Execute Python in the browser (Pyodide WASM). STATEFUL: variables, imports and installed ' +
      'packages persist across calls in this conversation, like a Jupyter kernel. numpy/pandas/etc. ' +
      'from imports load automatically; top-level await is supported. Pass packages[] to pip-install ' +
      'pure-Python wheels via micropip, or reset:true to clear the kernel. ' +
      'IT CANNOT REACH THE REAL MACHINE: no access to the user’s files, no OS or shell commands, ' +
      'no starting servers, no installing system software. To run a real command use terminal_run; ' +
      'to start a dev server use proc_start; to read the user’s files use fs_read/fs_list.',
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
    // Guard first: loading Pyodide is a multi-MB download, not something to do
    // for a call that has nothing to run.
    if (typeof code !== 'string' || !code.trim()) return { success: false, tool: 'code_execute', error: 'code is required' }
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

      // Snapshot the filesystem so we can surface any file the code writes.
      const filesBefore = snapshotFiles(py, ['/tmp', (() => { try { return py.FS.cwd() } catch { return '/home/pyodide' } })()])

      const startedAt = Date.now()
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

      // A script that BOTH prints and returns used to lose the returned value:
      // `stdout || String(result)` discarded it whenever anything was printed.
      const returned = result !== undefined && result !== null ? String(result) : ''
      const output = [stdout, returned && returned !== stdout.trim() ? returned : ''].filter(Boolean).join('\n')
      // Surface any files the code created (PDF, images, CSV…) as downloadables.
      let files = []
      try { files = await collectNewFiles(py, filesBefore) } catch { /* best-effort */ }
      return {
        success: true, tool: 'code_execute', output,
        // The card shows a duration when given one.
        execution_time: Date.now() - startedAt,
        ...(stderr ? { stderr } : {}),
        ...(installed.length ? { installed } : {}),
        ...(files.length ? { files, files_note: `${files.length} file(s) are offered to the user as download buttons in the UI. Tell the user they can download ${files.map(f => f.name).join(', ')} directly — never mention a server/temp file path, which does not exist on their device.` } : {}),
        stateful: true, code,
      }
    } catch (e) {
      return { success: false, tool: 'code_execute', error: e.message, code }
    }
  },
}
