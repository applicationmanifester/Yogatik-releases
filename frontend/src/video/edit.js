/**
 * Video edit planning — trim, concat, speed, and quality presets.
 *
 * PURE, exactly like timeline.js: every decision here is arithmetic on numbers,
 * so it is unit-testable and the frame timings are COMPUTED rather than sampled
 * from a clock. The actual re-encode reuses video/encode.js.
 *
 * Quality: video_render previously hardcoded bpp 0.13 and defaulted to 720p,
 * which is soft for slide/text content where edges matter most. Presets let the
 * caller trade size for fidelity explicitly.
 */

/** Named quality presets. bpp = bits per pixel per frame. */
export const QUALITY = {
  draft:    { bpp: 0.07, maxBitrate: 6e6,  edge: 854,  fps: 24 },
  standard: { bpp: 0.13, maxBitrate: 16e6, edge: 1280, fps: 30 },
  high:     { bpp: 0.22, maxBitrate: 28e6, edge: 1920, fps: 30 },
  max:      { bpp: 0.32, maxBitrate: 40e6, edge: 1920, fps: 60 },
}

export const DEFAULT_QUALITY = 'standard'

export function qualityPreset(name) {
  return QUALITY[String(name || '').toLowerCase()] || QUALITY[DEFAULT_QUALITY]
}

/** Bitrate for a given frame size under a preset. */
export function bitrateForQuality(width, height, fps, quality) {
  const q = qualityPreset(quality)
  const raw = width * height * fps * q.bpp
  return Math.round(Math.min(q.maxBitrate, Math.max(1e6, raw)))
}

/**
 * Accepts seconds ("12.5"), m:ss ("1:30") or h:mm:ss ("1:02:03").
 * Returns seconds, or null when unparseable — callers decide the fallback.
 */
export function parseTimecode(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null
  const s = String(v).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  const parts = s.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every(p => /^\d+(\.\d+)?$/.test(p))) return null
  const nums = parts.map(Number)
  const secs = parts.length === 3
    ? nums[0] * 3600 + nums[1] * 60 + nums[2]
    : nums[0] * 60 + nums[1]
  return Number.isFinite(secs) ? secs : null
}

export function formatTimecode(sec) {
  const s = Math.max(0, Number(sec) || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const rr = (r < 10 ? '0' : '') + r.toFixed(2).replace(/\.?0+$/, '')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rr}` : `${m}:${rr}`
}

/**
 * Clamp a requested trim to the clip and express it in frames.
 * Throws only when the result would be empty — an invalid range is a caller
 * error worth surfacing, not something to silently round away.
 */
export function planTrim(durationSec, { start, end, fps = 30 } = {}) {
  const dur = Math.max(0, Number(durationSec) || 0)
  let s = parseTimecode(start)
  let e = parseTimecode(end)
  if (s == null) s = 0
  if (e == null) e = dur
  s = Math.min(Math.max(0, s), dur)
  e = Math.min(Math.max(0, e), dur)
  if (e <= s) throw new Error('Trim end must be after start.')
  const startFrame = Math.round(s * fps)
  const endFrame = Math.round(e * fps)
  return {
    startSec: s,
    endSec: e,
    durationSec: e - s,
    startFrame,
    endFrame,
    totalFrames: Math.max(1, endFrame - startFrame),
  }
}

/**
 * Lay clips end to end. Returns each clip's offset on the output timeline, so
 * the encoder can ask "which clip owns frame N" without guessing.
 */
export function planConcat(clips = [], { fps = 30 } = {}) {
  const list = (Array.isArray(clips) ? clips : []).filter(c => c && Number(c.durationSec) > 0)
  let offset = 0
  const segments = list.map((c, i) => {
    const d = Number(c.durationSec)
    const seg = {
      index: i,
      source: c.source ?? null,
      startSec: offset,
      endSec: offset + d,
      durationSec: d,
      startFrame: Math.round(offset * fps),
      totalFrames: Math.max(1, Math.round(d * fps)),
    }
    offset += d
    return seg
  })
  return { segments, durationSec: offset, totalFrames: Math.max(0, Math.round(offset * fps)) }
}

/** Which concat segment owns a given output frame. */
export function segmentAtFrame(plan, frame) {
  const f = Math.max(0, Math.floor(Number(frame) || 0))
  for (const seg of plan?.segments || []) {
    if (f >= seg.startFrame && f < seg.startFrame + seg.totalFrames) return seg
  }
  return null
}

/**
 * Speed change. Audio is dropped above 1x unless the caller resamples, so the
 * plan reports it rather than silently producing chipmunk narration.
 */
export function planSpeed(durationSec, factor, { fps = 30 } = {}) {
  const f = Number(factor)
  if (!Number.isFinite(f) || f <= 0) throw new Error('Speed factor must be greater than 0.')
  const clamped = Math.min(8, Math.max(0.25, f))
  const out = (Math.max(0, Number(durationSec) || 0)) / clamped
  return {
    factor: clamped,
    clamped: clamped !== f,
    durationSec: out,
    totalFrames: Math.max(1, Math.round(out * fps)),
    audioNeedsResample: clamped !== 1,
  }
}

/** Even dimensions (H.264 chroma) that fit inside a preset's edge, keeping aspect. */
export function fitDimensions(width, height, quality) {
  const q = qualityPreset(quality)
  const w = Math.max(2, Math.round(Number(width) || q.edge))
  const h = Math.max(2, Math.round(Number(height) || Math.round(q.edge * 9 / 16)))
  const scale = Math.min(1, q.edge / Math.max(w, h))
  const even = (n) => { const v = Math.max(2, Math.round(n * scale)); return v % 2 ? v + 1 : v }
  return { width: even(w), height: even(h) }
}
