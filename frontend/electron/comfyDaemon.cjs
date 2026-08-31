/**
 * comfyDaemon.cjs — local image/video generation via a user-installed ComfyUI.
 *
 * Same shape as ollamaDaemon.cjs, deliberately: probe the HTTP endpoint first
 * (covers ComfyUI Desktop, or a copy the user already has running), spawn a
 * managed process only if a folder has been pointed at and nothing answers,
 * and never pretend a capability that isn't there.
 *
 * WHY THIS IS A "POINT ME AT YOUR INSTALL" MODEL, NOT A BUNDLED ONE — unlike
 * Ollama (one official installer per OS), ComfyUI ships as a portable zip, a
 * git clone + venv, or its own Desktop app, with no single binary this process
 * could locate by convention. Bundling diffusers/torch/CUDA into the Electron
 * installer was rejected for the same reason google/sam was: multi-GB,
 * platform- and driver-specific, architecturally opposite to this app's
 * zero-backend design. So the user installs ComfyUI once, themselves, same as
 * Ollama — the daemon's job is detecting it, starting it, and talking to it,
 * never installing it.
 *
 * IPC surface:
 *   comfy:status         → { installed, running, root, port, checkpoints, svdCheckpoints, samplers, schedulers }
 *   comfy:set-root        { root } → validate + persist + return status
 *   comfy:start           → spawn the managed process if a root is known and nothing is running
 *   comfy:generate-image   { prompt, negative, width, height, steps, cfg, seed, checkpoint, sampler, scheduler }
 *                          → { success, bytes (base64 PNG), mime, filename, seed, width, height }
 *   comfy:generate-video   { imageBytes (base64), imageMime, checkpoint, width, height, videoFrames, fps,
 *                            motionBucketId, seed, steps, cfg }
 *                          → { success, bytes (base64 animated WEBP), mime, filename, seed, frames, fps }
 *   comfy:cancel          → best-effort POST /interrupt
 */

'use strict'

const { ipcMain } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { safeSend } = require('./safeWindow.cjs')
const {
  buildTxt2ImgGraph, buildImg2VidGraph, parseObjectInfo,
} = require('./comfyWorkflows.cjs')

const DEFAULT_PORT = 8188
const IMAGE_TIMEOUT_MS = 3 * 60 * 1000
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 900

function log(msg) { console.log(`[comfy] ${msg}`) }

/* ── config persistence ─────────────────────────────────────────────────── */

let configPath = null
let _config = { root: null, port: DEFAULT_PORT }
let _daemonProcess = null
let _startPromise = null

function loadConfig(userDataDir) {
  configPath = path.join(userDataDir, 'comfy-config.json')
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    _config = { root: raw.root || null, port: Number(raw.port) || DEFAULT_PORT }
  } catch { /* no config yet */ }
}

function saveConfig() {
  if (!configPath) return
  try { fs.writeFileSync(configPath, JSON.stringify(_config, null, 2)) } catch { /* best effort */ }
}

/* ── HTTP helpers against the ComfyUI server ────────────────────────────── */

function port() { return _config.port || DEFAULT_PORT }

function httpJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null
    const req = http.request({
      host: '127.0.0.1', port: port(), path: urlPath, method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
        : undefined,
    }, (res) => {
      let buf = ''
      res.on('data', c => { buf += c })
      res.on('end', () => {
        if (res.statusCode >= 400) { reject(new Error(`ComfyUI ${method} ${urlPath} → ${res.statusCode}: ${buf.slice(0, 500)}`)); return }
        try { resolve(buf ? JSON.parse(buf) : null) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(new Error('ComfyUI request timed out')) })
    if (payload) req.write(payload)
    req.end()
  })
}

/** Raw bytes — used for /view (image/webp output) and multipart upload. */
function httpBytes(method, urlPath, headers, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: port(), path: urlPath, method, headers }, (res) => {
      if (res.statusCode >= 400) {
        let buf = ''
        res.on('data', c => { buf += c })
        res.on('end', () => reject(new Error(`ComfyUI ${method} ${urlPath} → ${res.statusCode}: ${buf.slice(0, 300)}`)))
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }))
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(new Error('ComfyUI request timed out')) })
    if (bodyBuffer) req.write(bodyBuffer)
    req.end()
  })
}

function probeHttp(timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: port(), path: '/system_stats', method: 'GET' }, () => resolve(true))
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
    req.end()
  })
}

async function waitForServer(maxMs = 45000, intervalMs = 700) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await probeHttp(2000)) return true
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return false
}

/* ── locating an install to spawn ───────────────────────────────────────── */

/**
 * Resolve how to launch a configured ComfyUI folder. Three layouts, tried in
 * order — a Windows PORTABLE build ships its own interpreter and must use it
 * (the system Python, if any, has none of ComfyUI's dependencies installed);
 * a git-clone-plus-venv layout has one at <root>/venv; anything else falls
 * back to whatever `python`/`python3` resolves to on PATH, which only works
 * if the user activated their environment before pointing Yogatik at it.
 */
function resolveEntry(root) {
  if (!root) return null
  const portableWin = {
    python: path.join(root, 'python_embeded', 'python.exe'),
    script: path.join(root, 'ComfyUI', 'main.py'),
    cwd: path.join(root, 'ComfyUI'),
  }
  if (fs.existsSync(portableWin.python) && fs.existsSync(portableWin.script)) return portableWin

  const directMain = path.join(root, 'main.py')
  if (fs.existsSync(directMain)) {
    const venvPy = process.platform === 'win32'
      ? path.join(root, 'venv', 'Scripts', 'python.exe')
      : path.join(root, 'venv', 'bin', 'python')
    const python = fs.existsSync(venvPy) ? venvPy : (process.platform === 'win32' ? 'python' : 'python3')
    return { python, script: directMain, cwd: root }
  }
  return null
}

async function isRootValid(root) {
  return !!resolveEntry(root)
}

async function spawnServer(entry) {
  if (_startPromise) return _startPromise
  _startPromise = (async () => {
    if (await probeHttp()) { log('server already running'); return { ok: true, already: true } }

    log(`spawning: ${entry.python} ${entry.script} --listen 127.0.0.1 --port ${port()}`)
    _daemonProcess = spawn(entry.python, [entry.script, '--listen', '127.0.0.1', '--port', String(port())], {
      cwd: entry.cwd,
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env },
    })
    _daemonProcess.on('error', err => log(`spawn error: ${err.message}`))
    _daemonProcess.on('exit', (code, sig) => {
      log(`server exited code=${code} sig=${sig}`)
      if (_daemonProcess) _daemonProcess = null
    })

    const ready = await waitForServer()
    if (!ready) return { ok: false, error: 'ComfyUI did not come up within 45 seconds. Check that the folder is correct and dependencies are installed.' }
    log('server ready')
    return { ok: true, already: false }
  })()

  try { return await _startPromise }
  finally { _startPromise = null }
}

/* ── generation ──────────────────────────────────────────────────────────── */

async function submitAndWait(graph, outputNodeId, timeoutMs) {
  const submitted = await httpJson('POST', '/prompt', { prompt: graph, client_id: 'yogatik' })
  const promptId = submitted?.prompt_id
  if (!promptId) throw new Error('ComfyUI accepted no prompt_id — the graph was likely rejected. Check the checkpoint name.')

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    let history
    try { history = await httpJson('GET', `/history/${promptId}`) } catch { continue }
    const entry = history?.[promptId]
    if (!entry) continue
    const outputs = entry.outputs?.[outputNodeId]
    // Different save nodes use different output keys (SaveImage/SaveAnimatedWEBP
    // use "images"; some video-combine custom nodes use "gifs") — check both
    // rather than assume the one this build happens to use.
    const files = outputs?.images || outputs?.gifs
    if (Array.isArray(files) && files.length) return files[0]
    if (entry.status?.status_str === 'error') {
      throw new Error('ComfyUI reported an error while generating. Open the ComfyUI window/log for details.')
    }
  }
  throw new Error(`Timed out waiting for ComfyUI after ${Math.round(timeoutMs / 1000)}s.`)
}

async function fetchOutputBytes(file) {
  const qs = new URLSearchParams({
    filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output',
  })
  const { buffer, contentType } = await httpBytes('GET', `/view?${qs}`)
  return { buffer, contentType, filename: file.filename }
}

async function uploadImage(buffer, mime, filename) {
  const boundary = `----yogatik${Date.now()}`
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([head, buffer, tail])
  const res = await httpBytes('POST', '/upload/image', {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  }, body)
  let parsed
  try { parsed = JSON.parse(res.buffer.toString('utf8')) } catch { throw new Error('Unexpected response from ComfyUI image upload') }
  if (!parsed?.name) throw new Error('ComfyUI did not return an uploaded filename')
  return parsed.name
}

/* ── status ──────────────────────────────────────────────────────────────── */

async function buildStatus() {
  const running = await probeHttp()
  let checkpoints = [], svdCheckpoints = [], samplers = [], schedulers = []
  if (running) {
    try {
      const info = await httpJson('GET', '/object_info')
      const parsed = parseObjectInfo(info)
      checkpoints = parsed.checkpoints
      svdCheckpoints = parsed.svdCheckpoints
      samplers = parsed.samplers
      schedulers = parsed.schedulers
    } catch { /* server up but object_info failed — report running with empty lists */ }
  }
  const installed = running || !!(_config.root && await isRootValid(_config.root))
  return {
    installed, running, root: _config.root, port: port(),
    checkpoints, svdCheckpoints, samplers, schedulers,
  }
}

/* ── IPC ─────────────────────────────────────────────────────────────────── */

function registerComfyIpc(getWindow) {
  ipcMain.handle('comfy:status', async () => buildStatus())

  ipcMain.handle('comfy:set-root', async (_e, { root } = {}) => {
    if (!root || typeof root !== 'string') return { ok: false, error: 'root is required' }
    const entry = resolveEntry(root)
    if (!entry) {
      return {
        ok: false,
        error: 'No main.py found there (checked the portable python_embeded layout and a direct clone). Point this at the folder that contains ComfyUI\'s main.py.',
      }
    }
    _config.root = root
    saveConfig()
    return { ok: true, status: await buildStatus() }
  })

  ipcMain.handle('comfy:start', async () => {
    if (await probeHttp()) return { ok: true, already: true }
    if (!_config.root) return { ok: false, error: 'No ComfyUI folder is set. Pick the folder ComfyUI is installed in, or start it yourself — Yogatik will detect it.' }
    const entry = resolveEntry(_config.root)
    if (!entry) return { ok: false, error: 'The configured ComfyUI folder no longer looks valid.' }
    return spawnServer(entry)
  })

  ipcMain.handle('comfy:generate-image', async (_e, args = {}) => {
    const win = getWindow?.()
    try {
      if (!await probeHttp()) throw new Error('ComfyUI is not running. Call comfy:start first, or start it yourself.')
      const { graph, outputNodeId, seed, width, height } = buildTxt2ImgGraph(args)
      safeSend(win, 'comfy:progress', { phase: 'queued', kind: 'image' })
      const file = await submitAndWait(graph, outputNodeId, IMAGE_TIMEOUT_MS)
      safeSend(win, 'comfy:progress', { phase: 'fetching', kind: 'image' })
      const { buffer, contentType } = await fetchOutputBytes(file)
      return {
        success: true, bytes: buffer.toString('base64'), mime: contentType || 'image/png',
        filename: file.filename, seed, width, height,
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('comfy:generate-video', async (_e, args = {}) => {
    const win = getWindow?.()
    try {
      if (!await probeHttp()) throw new Error('ComfyUI is not running. Call comfy:start first, or start it yourself.')
      if (!args.imageBytes) throw new Error('imageBytes (base64) is required — img2vid animates a still image, it does not generate one from text.')
      const imgBuf = Buffer.from(args.imageBytes, 'base64')
      const ext = /jpeg|jpg/i.test(args.imageMime || '') ? 'jpg' : 'png'
      safeSend(win, 'comfy:progress', { phase: 'uploading', kind: 'video' })
      const imageName = await uploadImage(imgBuf, args.imageMime || 'image/png', `yogatik-src-${Date.now()}.${ext}`)
      const { graph, outputNodeId, seed, fps, videoFrames } = buildImg2VidGraph({ ...args, imageName })
      safeSend(win, 'comfy:progress', { phase: 'queued', kind: 'video' })
      const file = await submitAndWait(graph, outputNodeId, VIDEO_TIMEOUT_MS)
      safeSend(win, 'comfy:progress', { phase: 'fetching', kind: 'video' })
      const { buffer, contentType } = await fetchOutputBytes(file)
      return {
        success: true, bytes: buffer.toString('base64'), mime: contentType || 'image/webp',
        filename: file.filename, seed, fps, frames: videoFrames,
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('comfy:cancel', async () => {
    try { await httpJson('POST', '/interrupt'); return { ok: true } }
    catch (e) { return { ok: false, error: e?.message || String(e) } }
  })

  log('IPC registered')
}

function destroyComfyDaemon() {
  if (_daemonProcess) {
    try { _daemonProcess.kill('SIGTERM') } catch { /* already gone */ }
    _daemonProcess = null
  }
}

module.exports = { loadConfig, registerComfyIpc, destroyComfyDaemon }
