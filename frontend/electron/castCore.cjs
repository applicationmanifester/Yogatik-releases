// Pure protocol logic for casting local media to a UPnP/DLNA renderer (a
// "smart TV" in the common case, but the protocol doesn't care — any AVTransport
// device qualifies).
//
// MUST NOT require('electron') or touch the network: vitest collects
// src/**/*.test.js under jsdom, where neither exists. This is the same PURE/
// impure split as rootsCore.cjs/roots.cjs and comfyWorkflows.cjs/comfyDaemon.cjs
// — the wire-format logic (build this exact message, parse that exact response)
// is what is actually worth pinning; castControl.cjs is the thin Electron glue
// (dgram socket, http server, http requests) that calls into this.
//
// SCOPE NOTE (why this exists and what it deliberately is NOT): casting to a TV
// was evaluated once before as a wholesale port of a third-party CLI tool that
// needed ffmpeg for on-the-fly transcoding plus CDP stream-sniffing to capture
// a browser tab. Both of those solve a harder problem than Yogatik actually
// has — Yogatik never needs to CAST AN ARBITRARY SOURCE, only its own
// already-rendered media (an MP4 muxed by video_render.js's WebCodecs
// pipeline, or a PNG/JPEG from image_generate/local_image_generate). Every
// mainstream DLNA renderer plays H.264/MP4 and JPEG/PNG natively, so there is
// nothing to transcode and therefore no reason to bundle ffmpeg at all — this
// only ever serves bytes Yogatik already produced, over UPnP's own open,
// dependency-free HTTP+SOAP protocol (stable since 2008, no client library
// needed). That is the whole reason this can be genuinely independent where
// the wholesale port could not be.

const SSDP_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const AV_TRANSPORT_RE = /AVTransport/i
const RENDERING_CONTROL_RE = /RenderingControl/i

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// A deliberately NARROW, regex-based extractor for the small, fixed set of
// tags this needs — not a general XML parser (this codebase hand-rolls a
// parser only for the exact shape it consumes elsewhere too: the CSV reader,
// the git-porcelain reader). A real parser is unjustified weight for reading
// four tag names out of a device-description document whose shape has not
// changed since the UPnP 1.0 spec.
function tagContent(xml, tag) {
  const m = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i').exec(xml)
  return m ? m[1].trim() : ''
}

function allBlocks(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml))) out.push(m[1])
  return out
}

/* ── SSDP discovery ─────────────────────────────────────────────────────── */

// M-SEARCH is unicast-replied-to, not multicast-replied-to: a client sends
// this ONE datagram to the multicast address and every renderer on the
// segment replies directly to the sender's own socket/port — so discovery
// never needs to join the multicast group, only send and then listen.
function buildSsdpSearchMessage({ mx = 2, st = 'urn:schemas-upnp-org:device:MediaRenderer:1' } = {}) {
  return [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    `MX: ${mx}`,
    `ST: ${st}`,
    '', '',
  ].join('\r\n')
}

// An SSDP reply is an HTTP/1.1-shaped response with no body — parse it as
// headers only. Returns null for anything that isn't a 200-ish reply with a
// LOCATION header, so a malformed or unrelated datagram on the same socket
// never becomes a fake "device".
function parseSsdpResponse(raw) {
  const text = typeof raw === 'string' ? raw : (raw ? raw.toString('utf8') : '')
  const lines = text.split(/\r\n/)
  const statusLine = lines[0] || ''
  if (!/^HTTP\/1\.[01]\s+200/i.test(statusLine)) return null
  const headers = {}
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()
    if (key) headers[key] = val
  }
  if (!headers.location) return null
  return {
    location: headers.location,
    usn: headers.usn || '',
    st: headers.st || '',
    server: headers.server || '',
  }
}

/* ── device description ────────────────────────────────────────────────── */

// Resolves a service's (often relative) controlURL against the device
// description's own URL — required: the spec allows either form, and a
// renderer that returns "/AVTransport/control" is common, not an edge case.
function resolveUrl(base, maybeRelative) {
  try { return new URL(maybeRelative, base).toString() } catch { return maybeRelative }
}

// Extracts exactly what casting needs from a UPnP device description
// document: identity (friendlyName/UDN/modelName) and, per <service>, its
// type and control URL. Returns null on anything that doesn't look like a
// device description at all — a renderer whose description Yogatik cannot
// read is a renderer it cannot cast to, and the caller needs to know that
// rather than get a half-populated device.
function parseDeviceDescription(xml, baseUrl) {
  if (!xml || !/<device\b/i.test(xml)) return null
  const deviceBlockMatch = /<device\b[^>]*>([\s\S]*)<\/device>/i.exec(xml)
  const deviceXml = deviceBlockMatch ? deviceBlockMatch[1] : xml
  const friendlyName = tagContent(deviceXml, 'friendlyName')
  const udn = tagContent(deviceXml, 'UDN')
  const modelName = tagContent(deviceXml, 'modelName')
  const services = allBlocks(xml, 'service').map((block) => ({
    serviceType: tagContent(block, 'serviceType'),
    controlURL: resolveUrl(baseUrl, tagContent(block, 'controlURL')),
    eventSubURL: resolveUrl(baseUrl, tagContent(block, 'eventSubURL')),
  })).filter(s => s.serviceType && s.controlURL)
  return { friendlyName: friendlyName || 'Unnamed device', udn, modelName, services }
}

function findService(services, re) {
  return (services || []).find(s => re.test(s.serviceType)) || null
}

/* ── media metadata (DIDL-Lite) ────────────────────────────────────────── */

const EXT_MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
}

function mimeForFilename(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase()
  return EXT_MIME[ext] || 'application/octet-stream'
}

function upnpClassForMime(mime) {
  const m = String(mime || '')
  if (m.startsWith('video/')) return 'object.item.videoItem'
  if (m.startsWith('image/')) return 'object.item.imageItem'
  if (m.startsWith('audio/')) return 'object.item.audioItem'
  return 'object.item'
}

// Many minimal casters skip metadata entirely (an empty CurrentURIMetaData
// string), which some renderers accept and some quietly refuse — this sends
// real DIDL-Lite so the widest range of TVs actually plays what is sent,
// rather than silently doing nothing.
function buildDidlLite({ title, mime, url }) {
  const cls = upnpClassForMime(mime)
  return '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" '
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    + 'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">'
    + '<item id="0" parentID="-1" restricted="1">'
    + `<dc:title>${xmlEscape(title || 'Yogatik media')}</dc:title>`
    + `<upnp:class>${cls}</upnp:class>`
    + `<res protocolInfo="http-get:*:${xmlEscape(mime || 'application/octet-stream')}:*">${xmlEscape(url)}</res>`
    + '</item></DIDL-Lite>'
}

/* ── SOAP (AVTransport / RenderingControl) ─────────────────────────────── */

function buildSoapEnvelope(serviceType, action, argsXml) {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
    + 's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
    + '<s:Body>'
    + `<u:${action} xmlns:u="${serviceType}">${argsXml}</u:${action}>`
    + '</s:Body></s:Envelope>'
}

function soapActionHeader(serviceType, action) {
  return `"${serviceType}#${action}"`
}

function buildSetAvTransportUriEnvelope(serviceType, { instanceId = 0, uri, metadataXml = '' } = {}) {
  const args = `<InstanceID>${instanceId}</InstanceID>`
    + `<CurrentURI>${xmlEscape(uri)}</CurrentURI>`
    + `<CurrentURIMetaData>${xmlEscape(metadataXml)}</CurrentURIMetaData>`
  return buildSoapEnvelope(serviceType, 'SetAVTransportURI', args)
}

function buildPlayEnvelope(serviceType, { instanceId = 0, speed = '1' } = {}) {
  const args = `<InstanceID>${instanceId}</InstanceID><Speed>${xmlEscape(speed)}</Speed>`
  return buildSoapEnvelope(serviceType, 'Play', args)
}

function buildPauseEnvelope(serviceType, { instanceId = 0 } = {}) {
  return buildSoapEnvelope(serviceType, 'Pause', `<InstanceID>${instanceId}</InstanceID>`)
}

function buildStopEnvelope(serviceType, { instanceId = 0 } = {}) {
  return buildSoapEnvelope(serviceType, 'Stop', `<InstanceID>${instanceId}</InstanceID>`)
}

function buildGetTransportInfoEnvelope(serviceType, { instanceId = 0 } = {}) {
  return buildSoapEnvelope(serviceType, 'GetTransportInfo', `<InstanceID>${instanceId}</InstanceID>`)
}

// RenderingControl, not AVTransport — a different service entirely, but the
// same envelope shape, so this reuses buildSoapEnvelope rather than
// duplicating it. Volume is clamped 0-100 here (not just at the tool layer)
// because this function is the one thing standing between whatever a caller
// passes and a real SOAP call to a device on the user's network.
function buildSetVolumeEnvelope(serviceType, { instanceId = 0, channel = 'Master', volume } = {}) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)))
  const args = `<InstanceID>${instanceId}</InstanceID><Channel>${xmlEscape(channel)}</Channel>`
    + `<DesiredVolume>${clamped}</DesiredVolume>`
  return buildSoapEnvelope(serviceType, 'SetVolume', args)
}

function buildGetVolumeEnvelope(serviceType, { instanceId = 0, channel = 'Master' } = {}) {
  const args = `<InstanceID>${instanceId}</InstanceID><Channel>${xmlEscape(channel)}</Channel>`
  return buildSoapEnvelope(serviceType, 'GetVolume', args)
}

// A SOAP fault carries no HTTP-level signal a caller can rely on alone (some
// renderers fault with a 500, some with a 200 that is a fault body) — always
// inspect the body. Returns the human-readable text, or null when the
// response is not a fault.
function parseSoapFault(xml) {
  if (!xml) return null
  if (!/<(?:[\w-]+:)?Fault\b/i.test(xml)) return null
  const detail = tagContent(xml, 'errorDescription') || tagContent(xml, 'faultstring')
  return detail || 'The device rejected the request (SOAP fault, no detail given).'
}

function parseTransportInfoResponse(xml) {
  const state = tagContent(xml, 'CurrentTransportState')
  const status = tagContent(xml, 'CurrentTransportStatus')
  return { state: state || null, status: status || null }
}

function parseVolumeResponse(xml) {
  const raw = tagContent(xml, 'CurrentVolume')
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// A served filename never carries a client- or model-supplied path — it is
// always one this app generated for a temp file it wrote itself. Still
// validated at the boundary a network request crosses it (castControl.cjs's
// HTTP handler), because a hostile device on the same LAN is a real, if
// unlikely, adversary for a server bound to a LAN interface. Kept here,
// pure, so the containment rule is unit-testable without a real socket.
function isSafeServedName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) && !name.includes('..')
}

module.exports = {
  SSDP_ADDR, SSDP_PORT,
  xmlEscape, tagContent, allBlocks,
  buildSsdpSearchMessage, parseSsdpResponse,
  resolveUrl, parseDeviceDescription, findService,
  AV_TRANSPORT_RE, RENDERING_CONTROL_RE,
  mimeForFilename, upnpClassForMime, buildDidlLite,
  buildSoapEnvelope, soapActionHeader,
  buildSetAvTransportUriEnvelope, buildPlayEnvelope, buildPauseEnvelope, buildStopEnvelope,
  buildGetTransportInfoEnvelope, buildSetVolumeEnvelope, buildGetVolumeEnvelope,
  parseSoapFault, parseTransportInfoResponse, parseVolumeResponse,
  isSafeServedName,
}
