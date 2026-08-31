/**
 * ollamaDaemon.cjs — Zero-touch Ollama manager for the Electron main process.
 *
 * What it does automatically (no terminal needed by the user):
 *  1. Detects whether `ollama` is installed on the PATH.
 *  2. Probes http://localhost:11434 — if already running, done.
 *  3. If not running, spawns `ollama serve` as a managed child process.
 *  4. Lists models already pulled with `ollama list`.
 *  5. Pulls any missing model with `ollama pull <name>` and streams progress
 *     back to the renderer as { type:'progress', model, percent, status }.
 *
 * IPC channels registered:
 *  ollama:status   → { installed, running, models[] }
 *  ollama:start    → starts daemon if not running; resolves when ready
 *  ollama:list     → [ { name, size, modified } ]
 *  ollama:pull     → streams progress events, resolves on success
 *  ollama:cancel   → cancels an in-progress pull
 */

'use strict'

const { ipcMain } = require('electron')
const { spawn, exec } = require('child_process')
const http = require('http')
const path = require('path')
const os = require('os')
const { safeSend } = require('./safeWindow.cjs')

// ── Ollama binary resolution ───────────────────────────────────────────────
// Common install locations per platform.
// os.homedir(), NOT 'C:\Users\' + os.userInfo().username.
//
// Windows truncates a long account name when it creates the profile folder, so
// the two routinely disagree — an account called "Bhargav G K" can live in
// C:\Users\bharg_4mtuttl. Building the path from the username then points at a
// directory that does not exist, findOllamaBin returns null, and the app
// reports "Ollama is not installed" on a machine where it plainly is.
// homedir() asks the OS where the profile actually is.
const HOME = os.homedir()

const OLLAMA_PATHS = {
  win32: [
    'ollama',
    path.join(HOME, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
    // A machine-wide install, and the winget/choco shim location.
    'C:\\Program Files\\Ollama\\ollama.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || '', 'Ollama', 'ollama.exe'),
  ].filter(p => p && !p.startsWith('\\')),
  darwin: [
    'ollama',
    '/usr/local/bin/ollama',
    '/opt/homebrew/bin/ollama',
    // The .app bundle ships the CLI inside it, and a user who installed by
    // dragging to Applications has nothing on PATH at all.
    '/Applications/Ollama.app/Contents/Resources/ollama',
    path.join(HOME, 'Applications', 'Ollama.app', 'Contents', 'Resources', 'ollama'),
  ],
  linux: ['ollama', '/usr/bin/ollama', '/usr/local/bin/ollama', path.join(HOME, '.local', 'bin', 'ollama')],
}

let _daemonProcess = null   // child_process for the managed daemon
let _pullProcesses = {}     // { [model]: child_process }
let _startPromise = null    // deduplicate concurrent start requests
let _ollamaBin = null       // resolved binary path (cached after first find)

// ── Utility ────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[ollama] ${msg}`) }

/** Find the ollama binary: try each candidate path in order. */
async function findOllamaBin() {
  if (_ollamaBin) return _ollamaBin
  const candidates = OLLAMA_PATHS[process.platform] || ['ollama']
  for (const bin of candidates) {
    const found = await new Promise(resolve => {
      exec(`"${bin}" --version`, { timeout: 3000, windowsHide: true }, (err) =>
        resolve(err ? null : bin)
      )
    })
    if (found) { _ollamaBin = found; return found }
  }
  return null
}

/** Probe the Ollama HTTP endpoint. Returns true if the daemon is responding. */
function probeHttp(host = '127.0.0.1', port = 11434, timeoutMs = 3000) {
  return new Promise(resolve => {
    const req = http.request({ host, port, path: '/', method: 'GET' }, () => resolve(true))
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
    req.end()
  })
}

/**
 * List models straight from the daemon's HTTP API.
 *
 * The fallback for when the daemon is running but the BINARY could not be
 * found — the common Windows case where a GUI app's inherited PATH predates
 * the Ollama install. `ollama list` is unavailable there, but /api/tags is
 * not, and it is the same information.
 */
function listModelsHttp(host = '127.0.0.1', port = 11434, timeoutMs = 4000) {
  return new Promise(resolve => {
    const req = http.request({ host, port, path: '/api/tags', method: 'GET' }, (res) => {
      let body = ''
      res.on('data', c => { body += c })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          resolve((parsed?.models || []).map(m => ({
            name: m.name,
            size: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '',
            modified: m.modified_at || '',
          })))
        } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve([]) })
    req.end()
  })
}

/** Wait until the daemon HTTP endpoint is up, with a deadline. */
async function waitForDaemon(maxMs = 12000, intervalMs = 400) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await probeHttp()) return true
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return false
}

/** Start the Ollama daemon process; resolves when the HTTP endpoint answers. */
async function startDaemon(bin) {
  if (_startPromise) return _startPromise
  _startPromise = (async () => {
    if (await probeHttp()) { log('daemon already running'); return { ok: true, already: true } }

    log(`spawning: ${bin} serve`)
    _daemonProcess = spawn(bin, ['serve'], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
      // Inherit parent env so PATH is correct inside the child.
      env: { ...process.env },
    })

    _daemonProcess.on('error', err => log(`daemon error: ${err.message}`))
    _daemonProcess.on('exit', (code, sig) => {
      log(`daemon exited code=${code} sig=${sig}`)
      if (_daemonProcess) _daemonProcess = null
    })

    const ready = await waitForDaemon(15000)
    if (!ready) {
      log('daemon did not become ready in 15s')
      return { ok: false, error: 'Ollama daemon did not start within 15 seconds.' }
    }
    log('daemon ready')
    return { ok: true, already: false }
  })()

  try { return await _startPromise }
  finally { _startPromise = null }
}

/** Run `ollama list` and return parsed model entries. */
function listLocalModels(bin) {
  return new Promise(resolve => {
    exec(`"${bin}" list`, { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) { resolve([]); return }
      // Header: NAME  ID  SIZE  MODIFIED
      const lines = stdout.trim().split('\n').slice(1)  // skip header
      const models = lines
        .map(l => {
          const parts = l.trim().split(/\s{2,}/)
          return parts[0] ? { name: parts[0], size: parts[2] || '', modified: parts[3] || '' } : null
        })
        .filter(Boolean)
      resolve(models)
    })
  })
}

/** Pull a model, streaming progress events. Returns a promise that resolves on success. */
function pullModel(bin, modelName, onProgress, signal) {
  return new Promise((resolve, reject) => {
    if (_pullProcesses[modelName]) {
      reject(new Error(`A pull for "${modelName}" is already in progress.`))
      return
    }

    const child = spawn(bin, ['pull', modelName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env },
    })
    _pullProcesses[modelName] = child

    let lastLine = ''
    const parseLine = (line) => {
      // Typical output: "pulling manifest"  /  "pulling abc123... 45%"  /  "success"
      const percentMatch = line.match(/(\d+)%/)
      const percent = percentMatch ? parseInt(percentMatch[1], 10) : null
      onProgress({ model: modelName, status: line.trim(), percent })
    }

    child.stdout.on('data', chunk => {
      const text = lastLine + chunk.toString()
      const lines = text.split('\n')
      lastLine = lines.pop()
      lines.forEach(l => { if (l.trim()) parseLine(l) })
    })
    child.stderr.on('data', chunk => {
      const text = chunk.toString()
      text.split('\n').forEach(l => { if (l.trim()) parseLine(l) })
    })

    signal?.addEventListener('abort', () => {
      child.kill('SIGTERM')
      delete _pullProcesses[modelName]
      reject(new Error('Pull cancelled'))
    }, { once: true })

    child.on('error', err => {
      delete _pullProcesses[modelName]
      reject(err)
    })

    child.on('exit', (code) => {
      if (lastLine.trim()) parseLine(lastLine)
      delete _pullProcesses[modelName]
      if (code === 0) {
        onProgress({ model: modelName, status: 'success', percent: 100 })
        resolve({ ok: true })
      } else {
        reject(new Error(`ollama pull exited with code ${code}`))
      }
    })
  })
}

/** Pull a model via HTTP when binary CLI is not accessible. */
function pullModelHttp(host = '127.0.0.1', port = 11434, modelName, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ name: modelName, stream: true })
    const req = http.request({
      host,
      port,
      path: '/api/pull',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let buffer = ''
      res.on('data', chunk => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            let percent = null
            if (data.total && data.completed) {
              percent = Math.round((data.completed / data.total) * 100)
            }
            onProgress({ model: modelName, status: data.status || '', percent })
          } catch {}
        }
      })
      res.on('end', () => {
        onProgress({ model: modelName, status: 'success', percent: 100 })
        resolve({ ok: true })
      })
    })
    req.on('error', reject)
    signal?.addEventListener('abort', () => {
      req.destroy()
      reject(new Error('Pull cancelled'))
    }, { once: true })
    req.write(postData)
    req.end()
  })
}

// ── IPC handlers ───────────────────────────────────────────────────────────
function registerOllamaIpc(getWindow) {
  /**
   * ollama:status → { installed, running, models, bin }
   * Called by the renderer on startup and whenever the Ollama card is shown.
   */
  ipcMain.handle('ollama:status', async () => {
    // Probe the PORT first, and treat a responding daemon as installed even
    // when no binary was found.
    //
    // A GUI app on Windows inherits the PATH from whenever Explorer started,
    // which is often BEFORE Ollama was installed — so `ollama --version` fails
    // in this process while the daemon is running perfectly well on 11434.
    // Reporting "not installed" there is both wrong and unfixable by the user,
    // who can see Ollama running in their tray. The HTTP endpoint is the fact
    // that matters; the binary is only needed for `list` and `pull`.
    const running = await probeHttp()
    const bin = await findOllamaBin()
    if (!bin && !running) return { installed: false, running: false, models: [], bin: null }

    const models = running
      ? (bin ? await listLocalModels(bin) : await listModelsHttp())
      : []
    return { installed: true, running, models, bin, viaHttp: !bin }
  })

  /**
   * ollama:start → { ok, already, error? }
   * Starts the daemon if it isn't running. Safe to call redundantly.
   */
  ipcMain.handle('ollama:start', async () => {
    const bin = await findOllamaBin()
    if (!bin) return { ok: false, error: 'Ollama is not installed. Download it from https://ollama.com/download' }
    return startDaemon(bin)
  })

  /**
   * ollama:list → [{ name, size, modified }]
   * Returns models that are already pulled locally.
   */
  ipcMain.handle('ollama:list', async () => {
    const running = await probeHttp()
    if (!running) return []
    const bin = await findOllamaBin()
    // Same reasoning as ollama:status — a running daemon can list its models
    // over HTTP whether or not this process can find the CLI.
    return bin ? listLocalModels(bin) : listModelsHttp()
  })

  /**
   * ollama:pull { model } → { ok }
   * Pulls a model and pushes progress events back to the renderer window
   * via 'ollama:pull-progress' push event.
   */
  ipcMain.handle('ollama:pull', async (event, { model }) => {
    const bin = await findOllamaBin()
    if (!bin) {
      const running = await probeHttp()
      if (!running) throw new Error('Ollama not installed')
    }

    // Make sure daemon is running first
    const running = await probeHttp()
    if (!running) {
      const r = await startDaemon(bin)
      if (!r.ok) throw new Error(r.error || 'Could not start Ollama daemon')
    }

    const win = getWindow?.()
    const push = (payload) => {
      safeSend(win, 'ollama:pull-progress', payload)
    }

    if (bin) {
      return pullModel(bin, model, push)
    }
    return pullModelHttp('127.0.0.1', 11434, model, push)
  })

  /**
   * ollama:cancel { model } — kill an in-progress pull.
   */
  ipcMain.handle('ollama:cancel', async (_, { model }) => {
    const child = _pullProcesses[model]
    if (child) { child.kill('SIGTERM'); delete _pullProcesses[model] }
    return { ok: true }
  })

  log('IPC registered')
}

/** Kill managed daemon and all pull processes cleanly at app exit. */
function destroyOllamaDaemon() {
  Object.values(_pullProcesses).forEach(c => { try { c.kill('SIGTERM') } catch {} })
  _pullProcesses = {}
  if (_daemonProcess) {
    try { _daemonProcess.kill('SIGTERM') } catch {}
    _daemonProcess = null
  }
}

module.exports = { registerOllamaIpc, destroyOllamaDaemon }
