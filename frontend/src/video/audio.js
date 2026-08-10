/**
 * Audio timeline — pure Float32 PCM arithmetic, no AudioContext.
 *
 * Every clip comes from the same engine at the same sample rate, so laying the
 * narration onto the video's timeline is a copy at an offset. Keeping it pure
 * (no Web Audio) means it is unit-testable and works inside a worker.
 */

/**
 * Lay clips onto a silent bed of `durationSec`.
 * @param {{pcm: Float32Array, startSec: number}[]} clips
 * @returns {Float32Array}
 */
export function mixPcm(clips, sampleRate, durationSec) {
  const total = Math.max(0, Math.ceil(durationSec * sampleRate))
  const out = new Float32Array(total)
  for (const { pcm, startSec } of clips) {
    if (!pcm?.length) continue
    const start = Math.max(0, Math.round((startSec || 0) * sampleRate))
    const n = Math.min(pcm.length, total - start)
    for (let i = 0; i < n; i++) out[start + i] += pcm[i]
  }
  // Only touch the gain if summed clips actually clipped.
  let peak = 0
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a }
  if (peak > 1) { const g = 1 / peak; for (let i = 0; i < out.length; i++) out[i] *= g }
  return out
}

/** Short fades so a clip does not begin or end on a click. */
export function applyEdgeFades(pcm, sampleRate, ms = 12) {
  const n = Math.min(Math.round((ms / 1000) * sampleRate), Math.floor(pcm.length / 2))
  for (let i = 0; i < n; i++) {
    const g = i / n
    pcm[i] *= g
    pcm[pcm.length - 1 - i] *= g
  }
  return pcm
}

/**
 * Where each scene's narration starts, and how long the scenes must be to fit
 * it. Pure: the renderer calls this with measured clip lengths, the planner
 * calls it with estimates.
 *
 * @param {{seconds:number, speechSec:number}[]} scenes
 * @param {{lead?:number, tail?:number}} pad silence before/after each line
 * @returns {{durations:number[], starts:number[], totalSec:number}}
 */
export function planNarration(scenes, { lead = 0.35, tail = 0.45 } = {}) {
  const durations = []
  const starts = []
  let cursor = 0
  for (const s of scenes) {
    const speech = s.speechSec || 0
    // A scene never gets shorter than the author asked, only longer, and only
    // by as much as the voice needs.
    const seconds = speech > 0 ? Math.max(s.seconds || 0, lead + speech + tail) : (s.seconds || 0)
    starts.push(speech > 0 ? cursor + lead : null)
    durations.push(seconds)
    cursor += seconds
  }
  return { durations, starts, totalSec: cursor }
}

/**
 * Split narration into caption-sized chunks and give each one the slice of the
 * scene it is spoken in — burnt-in subtitles, since the MP4 carries no
 * subtitle track and the audio alone leaves deaf viewers nothing.
 */
export function captionCues(text, seconds) {
  const parts = String(text ?? '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean)
  if (!parts.length || !(seconds > 0)) return []

  const weights = parts.map(p => Math.max(1, p.length))
  const total = weights.reduce((a, b) => a + b, 0)
  let t = 0
  return parts.map((text, i) => {
    const dur = (weights[i] / total) * seconds
    const cue = { text, start: t, end: t + dur }
    t += dur
    return cue
  })
}

/** The cue visible at `t` seconds into the scene. */
export function cueAt(cues, t) {
  return cues.find(c => t >= c.start && t < c.end) || cues[cues.length - 1] || null
}
