/**
 * castControl.cjs — cast Yogatik's own already-rendered media (video/render
 * output, generated images) to a UPnP/DLNA TV or receiver on the LAN.
 *
 * Same shape as ollamaDaemon.cjs / comfyDaemon.cjs: probe/discover first,
 * never assume, never pretend a capability that isn't there. Unlike those
 * two there is no external app to detect or spawn — UPnP AVTransport is an
 * open protocol every mainstream smart TV already speaks, so this is pure
 * network protocol work (SSDP + a tiny local HTTP server + SOAP), no
 * bundled binary and no new npm dependency: dgram/http/os are Node builtins.
 *
 * IPC surface:
 *   cast:discover      { timeoutMs? } → { devices: [{id,friendlyName,modelName,canVolume}] }
 *   cast:list-devices   → devices already found by the last discover (no new network round-trip)
 *   cast:cast           { deviceId, bytesBase64?, filePath?, filename, mime?, title? }
 *                        → { success, device, url }
 *   cast:pause/resume/stop  { deviceId? } → { success }
 *   cast:set-volume     { deviceId?, volume } → { success }
 *   cast:status         { deviceId? } → { success, state, status }
 */

'use strict'

const dgram = require('dgram')
const http = require('http')
const https = require('https')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { ipcMain, app } = require('electron')
const {
  buildSsdpSearchMessage, parseSsdpResponse, parseDeviceDescription, findService,
  AV_TRANSPORT_RE, RENDERING_CONTROL_RE, mimeForFilename, buildDidlLite,
  soapActionHeader, buildSetAvTransportUriEnvelope, buildPlayEnvelope, buildPauseEnvelope,
  buildStopEnvelope, buildGetTransportInfoEnvelope, buildSetVolumeEnvelope, buildGetVolumeEnvelope,
  parseSoapFault, parseTransportInfoResponse, parseVolumeResponse, isSafeServedName,
} = require('./castCore.cjs')

const DISCOVER_TIMEOUT_MS = 2500
const DESC_FETCH_TIMEOUT_MS = 2500
const SOAP_TIMEOUT_MS = 6000

function log(msg) { console.log(`[cast] ${msg}`) }

const _devices = new Map() // id -> { friendlyName, modelName, avTransport, renderingControl }
let _currentDeviceId = null
let _server = null
let _servedDir = null
let _lanIp = null

/* ── LAN address ────────────────────────────────────────────────────────── */

// The served URL must be reachable FROM THE TV, so 127.0.0.1 is useless here
// — this must be an address on an interface the LAN can actually route to.
// Picks the first non-internal IPv4 interface; on a machine with several
// (VPN, Docker, a second NIC) this is a best-effort guess, not a guarantee,
// same honesty as every other "best available" fallback in this app.
function lanIp() {
  if (_lanIp) return _lanIp
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) { _lanIp = iface.address; return _lanIp }
    }
  }
  _lanIp = '127.0.0.1'
  return _lanIp
}

/* ── discovery ──────────────────────────────────────────────────────────── */

function fetchText(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { reject(e); return }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.get(u, { timeout: timeoutMs }, (res) => {
      if ((res.statusCode || 0) >= 400) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve(body))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

// Sends one SSDP M-SEARCH, collects unique LOCATION replies for `timeoutMs`,
// then fetches + parses each device description in parallel. A device whose
// description does not expose AVTransport is dropped — nothing this app can
// cast to. Never throws: no network / multicast blocked (sandboxes, some
// corporate networks, WSL) resolves to an empty list with a reason, the same
// "say what it cannot do" discipline as every other honest-empty-result path
// in this app.
async function discover({ timeoutMs = DISCOVER_TIMEOUT_MS } = {}) {
  const locations = new Set()
  try {
    await new Promise((resolve) => {
      let sock
      try { sock = dgram.createSocket('udp4') } catch { resolve(); return }
      const msg = Buffer.from(buildSsdpSearchMessage())
      sock.on('message', (buf) => {
        const parsed = parseSsdpResponse(buf)
        if (parsed && parsed.location) locations.add(parsed.location)
      })
      sock.on('error', () => { try { sock.close() } catch { /* already closed */ } })
      sock.bind(0, () => {
        try { sock.send(msg, 1900, '239.255.255.250') } catch { /* network unavailable */ }
      })
      setTimeout(() => { try { sock.close() } catch { /* already closed */ } resolve() }, timeoutMs)
    })
  } catch (e) {
    log(`discovery socket failed: ${e.message}`)
  }

  const found = await Promise.all([...locations].map(async (loc) => {
    try {
      const xml = await fetchText(loc, DESC_FETCH_TIMEOUT_MS)
      const desc = parseDeviceDescription(xml, loc)
      if (!desc) return null
      const avTransport = findService(desc.services, AV_TRANSPORT_RE)
      if (!avTransport) return null // nothing this app can cast to
      const renderingControl = findService(desc.services, RENDERING_CONTROL_RE)
      const id = desc.udn || crypto.createHash('sha1').update(loc).digest('hex').slice(0, 16)
      return { id, friendlyName: desc.friendlyName, modelName: desc.modelName, avTransport, renderingControl }
    } catch (e) {
      log(`could not read device description at ${loc}: ${e.message}`)
      return null
    }
  }))

  for (const dev of found) if (dev) _devices.set(dev.id, dev)

  return listPublicDevices()
}

function listPublicDevices() {
  return [..._devices.values()].map(d => ({
    id: d.id, friendlyName: d.friendlyName, modelName: d.modelName || '', canVolume: !!d.renderingControl,
  }))
}

/* ── local file server ──────────────────────────────────────────────────── */

// Serves ONLY files this process itself wrote into its own scoped temp
// directory, under names it generated — never a client- or model-supplied
// path. The request-path check is defense in depth for a server that is,
// necessarily, bound to a real LAN interface (the TV has to reach it): any
// other device on the same network can hit this port, so a malformed or
// hostile request path is refused rather than trusted.
function servedDir() {
  if (!_servedDir) _servedDir = path.join(app.getPath('temp'), 'yogatik-cast')
  try { fs.mkdirSync(_servedDir, { recursive: true }) } catch { /* already exists */ }
  return _servedDir
}

function ensureServer() {
  if (_server) return _server
  const dir = servedDir()
  _server = http.createServer((req, res) => {
    // decodeURIComponent throws on a malformed %-sequence, and this handler
    // is reachable by anything on the same LAN, not just the TV — an
    // uncaught throw here would take the WHOLE Electron main process down,
    // the same "one bad regex freezes the app" class of risk safeRegex.cjs
    // exists to prevent elsewhere in this app. Never let a request crash it.
    let reqPath
    try { reqPath = decodeURIComponent((req.url || '').split('?')[0]) } catch { reqPath = '' }
    const name = reqPath.replace(/^\/+/, '')
    if (!isSafeServedName(name)) { res.writeHead(400); res.end('bad request'); return }
    const full = path.join(dir, name)
    if (path.dirname(full) !== path.resolve(dir)) { res.writeHead(400); res.end('bad request'); return }
    fs.stat(full, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); res.end('not found'); return }
      const mime = mimeForFilename(name)
      const range = req.headers.range
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        const start = m && m[1] ? parseInt(m[1], 10) : 0
        const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1
        if (start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return
        }
        res.writeHead(206, {
          'Content-Type': mime, 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1,
        })
        fs.createReadStream(full, { start, end }).pipe(res)
        return
      }
      res.writeHead(200, { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size })
      fs.createReadStream(full).pipe(res)
    })
  })
  // Bound to every interface deliberately — the TV is on the LAN, not
  // localhost. The URL handed out always uses lanIp(), never 0.0.0.0.
  _server.listen(0, '0.0.0.0')
  return _server
}

function servedPort() {
  return new Promise((resolve, reject) => {
    const s = ensureServer()
    if (s.listening) { resolve(s.address().port); return }
    s.once('listening', () => resolve(s.address().port))
    s.once('error', reject)
  })
}

async function saveAndServe({ bytesBase64, filePath, filename, mime }) {
  const dir = servedDir()
  const safeExt = (filename && /\.[A-Za-z0-9]+$/.exec(filename)) ? filename.match(/\.[A-Za-z0-9]+$/)[0] : ''
  const servedName = `${crypto.randomBytes(8).toString('hex')}${safeExt}`
  const dest = path.join(dir, servedName)

  if (filePath) {
    // A local file path the user picked (e.g. via file_dialog) — copy rather
    // than serve in place, so it survives the source being moved/deleted
    // mid-playback and so the served-name allowlist above stays exhaustive.
    await fs.promises.copyFile(filePath, dest)
  } else if (bytesBase64) {
    await fs.promises.writeFile(dest, Buffer.from(bytesBase64, 'base64'))
  } else {
    throw new Error('bytesBase64 or filePath is required')
  }

  const port = await servedPort()
  const resolvedMime = mime || mimeForFilename(filename || servedName)
  return { url: `http://${lanIp()}:${port}/${servedName}`, mime: resolvedMime }
}

/* ── SOAP calls ─────────────────────────────────────────────────────────── */

function postSoap(controlUrl, serviceType, action, envelope) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(controlUrl) } catch (e) { reject(e); return }
    const mod = u.protocol === 'https:' ? https : http
    const body = Buffer.from(envelope, 'utf8')
    const req = mod.request(u, {
      method: 'POST',
      timeout: SOAP_TIMEOUT_MS,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': body.length,
        SOAPACTION: soapActionHeader(serviceType, action),
      },
    }, (res) => {
      let out = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { out += c })
      res.on('end', () => resolve({ status: res.statusCode, body: out }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function callAction(controlUrl, serviceType, action, envelope) {
  const { status, body } = await postSoap(controlUrl, serviceType, action, envelope)
  const fault = parseSoapFault(body)
  if (fault) throw new Error(fault)
  if (status >= 300) throw new Error(`Device returned HTTP ${status}`)
  return body
}

function requireDevice(deviceId) {
  const id = deviceId || _currentDeviceId
  if (!id) throw new Error('No device specified and nothing has been cast to yet — call discover, then cast with a deviceId.')
  const dev = _devices.get(id)
  if (!dev) throw new Error(`Unknown device "${id}" — call discover again, devices can drop off the network.`)
  return dev
}

/* ── public actions ─────────────────────────────────────────────────────── */

async function castTo({ deviceId, bytesBase64, filePath, filename, mime, title, url: remoteUrl } = {}) {
  if (!deviceId) throw new Error('deviceId is required — call discover first and pass one of its ids.')
  const dev = requireDevice(deviceId)
  // An already-public http(s) URL is cast DIRECTLY — no reason to pull it
  // through this app's own file server first when the TV can already reach
  // it itself. Only Yogatik's own generated media (bytesBase64/filePath)
  // needs serving, since that is the part with no URL of its own yet.
  let url, resolvedMime
  if (remoteUrl && /^https?:\/\//i.test(remoteUrl)) {
    url = remoteUrl
    resolvedMime = mime || mimeForFilename(remoteUrl)
  } else {
    ({ url, mime: resolvedMime } = await saveAndServe({ bytesBase64, filePath, filename, mime }))
  }
  const metadataXml = buildDidlLite({ title: title || filename || 'Yogatik media', mime: resolvedMime, url })
  const st = dev.avTransport.serviceType
  await callAction(dev.avTransport.controlURL, st, 'SetAVTransportURI',
    buildSetAvTransportUriEnvelope(st, { uri: url, metadataXml }))
  await callAction(dev.avTransport.controlURL, st, 'Play', buildPlayEnvelope(st))
  _currentDeviceId = deviceId
  return { success: true, device: dev.friendlyName, url }
}

async function pause({ deviceId } = {}) {
  const dev = requireDevice(deviceId)
  const st = dev.avTransport.serviceType
  await callAction(dev.avTransport.controlURL, st, 'Pause', buildPauseEnvelope(st))
  return { success: true }
}

async function resume({ deviceId } = {}) {
  const dev = requireDevice(deviceId)
  const st = dev.avTransport.serviceType
  await callAction(dev.avTransport.controlURL, st, 'Play', buildPlayEnvelope(st))
  return { success: true }
}

async function stop({ deviceId } = {}) {
  const dev = requireDevice(deviceId)
  const st = dev.avTransport.serviceType
  await callAction(dev.avTransport.controlURL, st, 'Stop', buildStopEnvelope(st))
  return { success: true }
}

async function status({ deviceId } = {}) {
  const dev = requireDevice(deviceId)
  const st = dev.avTransport.serviceType
  const body = await callAction(dev.avTransport.controlURL, st, 'GetTransportInfo', buildGetTransportInfoEnvelope(st))
  return { success: true, device: dev.friendlyName, ...parseTransportInfoResponse(body) }
}

async function setVolume({ deviceId, volume } = {}) {
  const dev = requireDevice(deviceId)
  if (!dev.renderingControl) throw new Error(`${dev.friendlyName} does not expose volume control over UPnP.`)
  const st = dev.renderingControl.serviceType
  await callAction(dev.renderingControl.controlURL, st, 'SetVolume', buildSetVolumeEnvelope(st, { volume }))
  const body = await callAction(dev.renderingControl.controlURL, st, 'GetVolume', buildGetVolumeEnvelope(st))
  return { success: true, volume: parseVolumeResponse(body) }
}

/* ── IPC ────────────────────────────────────────────────────────────────── */

function registerCastIpc() {
  ipcMain.handle('cast:discover', async (_e, { timeoutMs } = {}) => {
    try { return { success: true, devices: await discover({ timeoutMs }) } }
    catch (e) { return { success: false, error: e?.message || String(e), devices: [] } }
  })
  ipcMain.handle('cast:list-devices', async () => ({ success: true, devices: listPublicDevices() }))
  ipcMain.handle('cast:cast', async (_e, args = {}) => {
    try { return await castTo(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
  })
  ipcMain.handle('cast:pause', async (_e, args = {}) => {
    try { return await pause(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
  })
  ipcMain.handle('cast:resume', async (_e, args = {}) => {
    try { return await resume(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
  })
  ipcMain.handle('cast:stop', async (_e, args = {}) => {
    try { return await stop(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
  })
  ipcMain.handle('cast:set-volume', async (_e, args = {}) => {
    try { return await setVolume(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
  })
  ipcMain.handle('cast:status', async (_e, args = {}) => {
    try { return await status(args) } catch (e) { return { success: false, error: e?.message || String(e) } }
  })
  log('IPC registered')
}

function destroyCastControl() {
  if (_server) { try { _server.close() } catch { /* already closed */ } _server = null }
  if (_servedDir) { try { fs.rmSync(_servedDir, { recursive: true, force: true }) } catch { /* best effort */ } }
  _devices.clear()
  _currentDeviceId = null
}

module.exports = {
  registerCastIpc, destroyCastControl,
  // exported for the Electron-harness smoke test (npm run test:browser-style
  // runs); not used by the pure vitest suite, which only reaches castCore.cjs.
  discover, castTo, pause, resume, stop, status, setVolume, listPublicDevices,
}
