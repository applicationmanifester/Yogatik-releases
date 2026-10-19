/**
 * [live-recording] On-device call recording & post-call coalescing.
 *
 * The PUBLIC_ROADMAP "Live session recording and playback" item, scoped to what
 * a local app may honestly claim: at call end, the spoken turns, the tools that
 * ran and (feature + consent permitting) up to 12 aHash-gated camera thumbnails
 * are coalesced into ONE row in IndexedDB. Nothing is uploaded; there is no
 * server. Every byte identifier here is local.
 *
 * Everything below is PURE and DOM-free so it can be tested without a call —
 * the same contract live/metrics.js and sessionHandoff.js hold. The two pieces
 * that are allowed to touch the outside world are:
 *   • LiveView, which feeds the sampler from `getSharedVisualSource().grab(true,…)`
 *     — the aHash change gate in live/video.js already returns null for a still
 *     scene, so "sampled on change" costs nothing extra upstream; and
 *   • the frame-consent gate, a BLOCKING prompt labelled with the estimated
 *     storage size shown BEFORE capture starts, following the exact pattern
 *     downloadConsent.js set (pluggable prompter, remembered once per feature,
 *     size-labelled message). The consent store is deliberately its own key
 *     (`yogatik.recordingConsent`) because storing a spoken-history row in this
 *     browser is a different decision from downloading a model — conflating the
 *     two would make "revoke downloads" wipe a history the user asked to keep.
 */

/** Hard cap: never more than 12 thumbnails per call. They are the memory aid. */
export const MAX_FRAMES_PER_CALL = 12

/* ── Frame-capture constants — one place, so the pre-capture size estimate and
 *    the actual capture loop can never drift apart. ───────────────────────── */
export const FRAME_MAX_EDGE = 320   // px on the longer edge of the thumbnail
export const FRAME_QUALITY = 0.55   // canvas.toDataURL jpeg quality
export const FRAME_INTERVAL_MS = 1500
export const FRAME_ASPECT = 0.75    // assumed h/w of a landscape laptop scene

/**
 * A JPEG thumbnail's shape is not a detail — the player's stage and the size
 * estimate both need it, and `grab()` hands back opaque base64. Reading it out
 * of the SOFn markers keeps us honest about the ACTUAL stored size instead of
 * guessing `maxEdge` values.
 * @param {string} b64 base64 JPEG, with or without a `data:` prefix
 * @returns {{ w: number, h: number } | null}
 */
export function jpegSize(b64) {
  if (!b64 || typeof b64 !== 'string') return null
  let buf
  try {
    buf = toBytes(String(b64))
  } catch { return null }
  if (!buf || buf.length < 4) return null
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null
  const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue }
    const marker = buf[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return null   // EOI or entropy data — no header found
    const len = (buf[i + 2] << 8) | buf[i + 3]
    if (len < 2) return null
    if (SOF.has(marker)) {
      const h = (buf[i + 5] << 8) | buf[i + 6]
      const w = (buf[i + 7] << 8) | buf[i + 8]
      return w > 0 && h > 0 ? { w, h } : null
    }
    i += 2 + len
  }
  return null
}

/** base64 (optionally dataURL) → bytes. Small, local, synchronous. */
function toBytes(b64) {
  const raw = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
  let bin = null
  try {
    if (typeof atob === 'function') bin = atob(raw)
  } catch { return null }
  if (typeof bin !== 'string') return null
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ── Coalescing a finished call ───────────────────────────────────────────── */

/**
 * Map the live transcript into a compact, time-normalised record.
 *
 * Transcript `time` stamps are absolute wall-clock values; a recording row
 * stores every `at` as an offset FROM CALL START (ms), and `startedAt` stays
 * absolute — so playback is duration-relative today and stays stable if this
 * row is ever copied between machines.
 *
 * @param {{ transcript?: Array, startedAt?: number, endedAt?: number }} call
 * @returns {{ turns: Array<{at:number, speaker:string, text:string}>,
 *             toolEvents: Array<{at:number, name:string, kind:'call'|'result', result?:any}>,
 *             sources: string[], artefacts: string[] }}
 */
export function coalesceLiveCall({ transcript = [], startedAt = 0 } = {}) {
  const zero = Number.isFinite(startedAt) ? startedAt : 0
  const abs = (t) => {
    const n = Number.isFinite(t) ? t : zero
    return Math.max(0, Math.round(n - zero))
  }
  const turns = []
  const toolEvents = []
  for (const t of (transcript || [])) {
    if (!t) continue
    if (t.type === 'message' && t.text) {
      turns.push({ at: abs(t.time), speaker: t.role === 'user' ? 'user' : 'assistant', text: String(t.text) })
    } else if (t.type === 'tool' && t.name) {
      toolEvents.push({ at: abs(t.time), name: String(t.name), kind: 'call' })
    } else if (t.type === 'toolResult' && t.name) {
      toolEvents.push({ at: abs(t.time), name: String(t.name), kind: 'result', result: t.result })
    }
  }
  turns.sort((a, b) => a.at - b.at)
  toolEvents.sort((a, b) => a.at - b.at)
  return { turns, toolEvents, sources: collectSources(toolEvents), artefacts: collectArtefacts(toolEvents) }
}

const MAX_ARTEFACTS = 12
const MAX_SOURCES = 12

/**
 * The things the call produced, as flat labels: every tool that RAN (a call is
 * an act on the user's behalf, so a tool that failed still counts as produced)
 * plus any titled result the tools carried back.
 */
export function collectArtefacts(toolEvents = []) {
  const names = []
  const titles = []
  for (const e of (toolEvents || [])) {
    if (!e?.name) continue
    if (!names.includes(e.name)) names.push(e.name)
    const r = e.result
    const label = (r && typeof r === 'object' && !Array.isArray(r))
      ? (r.title || r.name || r.filename || null)
      : null
    if (label) titles.push(String(label).slice(0, 120))
  }
  const out = names.slice(0, MAX_ARTEFACTS)
  for (const t of new Set(titles)) {
    if (out.length >= MAX_ARTEFACTS) break
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/** Depth-limited scan for cited URLs inside tool results. No network. */
export function collectSources(toolEvents = []) {
  const found = []
  const seen = new Set()
  const push = (url) => {
    const u = String(url).trim()
    if (u.length < 12 || seen.has(u)) return
    seen.add(u)
    found.push(u.slice(0, 512))
  }
  const visit = (v, depth) => {
    if (found.length >= MAX_SOURCES * 2 || depth > 4 || !v) return
    if (typeof v === 'string') {
      if (/^https?:\/\//i.test(v)) push(v)
      return
    }
    if (typeof v !== 'object') return
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && i < 40 && found.length < MAX_SOURCES * 2; i++) visit(v[i], depth + 1)
      return
    }
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string' && /^https?:\/\//i.test(val)) {
        push(val)
      } else if ((k === 'sources' || k === 'results' || k === 'citations' || k === 'links' || k === 'url')) {
        visit(val, depth + 1)
      } else if (typeof val === 'object') {
        visit(val, depth + 1)
      }
    }
  }
  for (const e of (toolEvents || [])) {
    if (found.length >= MAX_SOURCES * 2) break
    visit(e?.result, 0)
  }
  // results first, UNIQUE, trimmed — a citation list is a memory aid, not a feed
  const out = []
  for (const u of found) {
    if (out.includes(u)) continue
    out.push(u)
    if (out.length >= MAX_SOURCES) break
  }
  return out
}

/* ── Frame sampling (cap = MAX_FRAMES_PER_CALL) ───────────────────────────── */

/**
 * A mutable sampler that holds at most `cap` frames. Clean call coverage
 * matters more than recency: when the 13th distinct frame arrives, DROP the
 * interior frame whose removal leaves the BIGGEST gap (the first frame — how
 * the call looked when it began — and the last one survive by construction).
 */
export function createFrameSampler({ cap = MAX_FRAMES_PER_CALL } = {}) {
  let frames = []
  return {
    frames() { return frames.slice() },
    count() { return frames.length },
    add(frame) {
      if (!frame) return frames.length
      frames.push({
        at: Math.max(0, Math.round(Number.isFinite(frame.at) ? frame.at : 0)),
        thumb: frame.thumb != null ? String(frame.thumb) : '',
        ...(frame.w != null ? { w: Math.round(frame.w) } : {}),
        ...(frame.h != null ? { h: Math.round(frame.h) } : {}),
      })
      if (frames.length > cap) {
        let worst = 1
        let worstGap = Infinity
        for (let i = 1; i < frames.length - 1; i++) {
          const gap = frames[i + 1].at - frames[i - 1].at
          // Drop the frame whose removal leaves the SMALLEST gap (most even spacing)
          if (gap < worstGap) { worstGap = gap; worst = i }
        }
        frames.splice(worst, 1)
      }
      return frames.length
    },
  }
}

/* ── Storage estimate (straight-line; drives the consent label) ──────────── */

const TURN_OVERHEAD_BYTES = 96      // at, speaker, JSON envelope round the text
const TOOL_OVERHEAD_BYTES = 96      // at, name, kind
const RECORDING_META_BYTES = 512    // ids, provider/model, sizes, timestamps
const JPEG_BYTES_PER_PX = 0.4       // q≈0.55 thumbnails land here in practice

/** UTF-8 byte length; falls back to string length where TextEncoder is absent. */
export function utf8Len(s) {
  const str = String(s ?? '')
  if (!str) return 0
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length
  } catch { /* fall through */ }
  return str.length
}

/** base64 → raw byte count (3/4 of the characters, minus padding slack). */
export function b64Bytes(b64) {
  const s = String(b64 || '')
  const body = s.includes(',') ? s.slice(s.indexOf(',') + 1) : s
  return Math.ceil(body.length * 0.75)
}

/**
 * Estimate the persisted size of a call recording, in bytes. Deliberately a
 * straight line over the three collections — an estimate that is a few KB off
 * is useful in a consent prompt; a clever one is not auditable.
 */
export function estimateStorage({ turns = [], toolEvents = [], frames = [] } = {}) {
  let bytes = RECORDING_META_BYTES
  for (const t of (turns || [])) bytes += TURN_OVERHEAD_BYTES + utf8Len(t?.text)
  for (const e of (toolEvents || [])) bytes += TOOL_OVERHEAD_BYTES + utf8Len(e?.name)
  for (const f of (frames || [])) {
    if (f?.thumb) bytes += b64Bytes(f.thumb)
    else bytes += Math.ceil((f?.w || 0) * (f?.h || 0) * JPEG_BYTES_PER_PX)
  }
  return bytes
}

/** The worst-case frame budget for one call, used as the size label BEFORE capture. */
export function framesBudgetBytes() {
  return estimateStorage({
    turns: [],
    toolEvents: [],
    frames: Array.from({ length: MAX_FRAMES_PER_CALL }, () => ({
      w: FRAME_MAX_EDGE,
      h: Math.round(FRAME_MAX_EDGE * FRAME_ASPECT),
    })),
  })
}

/** Human size label for prompts and panels: `≈ 1.2 MB` / `84 KB`. */
export function bytesLabel(bytes) {
  const b = Number(bytes)
  if (!Number.isFinite(b) || b <= 0) return '0 KB'
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  return `${Math.max(1, Math.round(b / 1024))} KB`
}

/** Assemble a row ready for db.saveLiveRecording. Relative `at`s throughout; `startedAt` stays absolute. */
export function recordingFromCall({
  transcript = [],
  frames = [],
  startedAt = 0,
  endedAt = 0,
  conversationId = null,
  provider = 'live',
  model = 'default',
} = {}) {
  const clip = coalesceLiveCall({ transcript, startedAt })
  const durationSec = Math.max(0, Math.round(((Number.isFinite(endedAt) ? endedAt : startedAt) - startedAt) / 1000))
  return {
    conversationId: conversationId ?? null,
    startedAt, endedAt, durationSec, provider, model,
    turns: clip.turns,
    toolEvents: clip.toolEvents,
    sources: clip.sources,
    artefacts: clip.artefacts,
    frames,
    sizeBytes: estimateStorage({ turns: clip.turns, toolEvents: clip.toolEvents, frames }),
  }
}

/* ── Frame-capture consent — downloadConsent.js's pattern, dedicated store ── */

const CONSENT_STORE = 'yogatik.recordingConsent'
const FRAME_CONSENT_FEATURE = 'frames'

function readConsent() {
  try { return JSON.parse(localStorage.getItem(CONSENT_STORE) || '{}') } catch { return {} }
}
function writeConsent(map) {
  try { localStorage.setItem(CONSENT_STORE, JSON.stringify(map)) } catch { /* private mode */ }
}

export function hasFrameConsent() { return readConsent()[FRAME_CONSENT_FEATURE] === true }
export function grantFrameConsent() {
  writeConsent({ ...readConsent(), [FRAME_CONSENT_FEATURE]: true })
}
export function revokeFrameConsent() {
  const m = readConsent(); delete m[FRAME_CONSENT_FEATURE]; writeConsent(m)
}

/**
 * The blocking message: what gets stored, WHERE it stays, and the size — the
 * estimated size is the user's basis for saying yes, so it leads the ask.
 */
export function frameConsentMessage(estimateBytes) {
  return `Live recording keeps a turn-by-turn recap and up to ${MAX_FRAMES_PER_CALL} small camera ` +
    `thumbnails (${bytesLabel(estimateBytes)}) in this browser. ` +
    `Nothing is uploaded or shared. Capture thumbnails now?`
}

/** Pluggable prompter so Live/App can show a themed modal (testable). Default: window.confirm. */
let _recordingPrompter = async (message) => {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm(message)
}
export function setRecordingConsentPrompter(fn) { if (typeof fn === 'function') _recordingPrompter = fn }

/**
 * Ensure frame-capture consent for THIS browser. Blocking and awaited, always
 * size-labelled. Returns true if already granted or newly accepted; false when
 * declined — and a declined answer must mean NO frames are captured.
 */
export async function ensureFrameConsent(estimateBytes = framesBudgetBytes()) {
  if (hasFrameConsent()) return true
  const ok = await _recordingPrompter(frameConsentMessage(estimateBytes), {
    feature: FRAME_CONSENT_FEATURE, sizeBytes: estimateBytes, blocking: true,
  })
  if (ok) grantFrameConsent()
  return !!ok
}
