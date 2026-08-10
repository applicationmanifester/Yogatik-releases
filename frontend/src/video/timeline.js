/**
 * Video timeline — pure geometry and timing, no canvas, no encoder.
 *
 * Everything here is deterministic and unit-testable: the renderer asks
 * "what should frame N look like" and gets back a scene plus its progress.
 * That is what makes offline (faster-than-realtime) encoding possible.
 */

export const LIMITS = {
  minEdge: 256, maxEdge: 1920,
  minFps: 12, maxFps: 60,
  minSceneSec: 0.5, maxSceneSec: 30,
  maxTotalSec: 180,
  maxScenes: 40,
}

export const THEME = {
  bg: '#0e1116',
  bgAlt: '#161b22',
  fg: '#f2f4f8',
  dim: '#9aa4b2',
  accent: '#ff6b35',
  accent2: '#3b82f6',
  font: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
}

const DEFAULT_SECONDS = { title: 3, text: 4.5, image: 4, bars: 5, outro: 2.5 }
export const SCENE_TYPES = Object.keys(DEFAULT_SECONDS)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
/** Encoders want even dimensions; odd ones fail on H.264 chroma subsampling. */
const even = (n) => Math.round(n / 2) * 2

/** Normalise, clamp and validate an author-supplied spec. Throws on garbage. */
export function normalizeSpec(spec = {}) {
  const scenes = Array.isArray(spec.scenes) ? spec.scenes : []
  if (!scenes.length) throw new Error('A video needs at least one scene.')
  if (scenes.length > LIMITS.maxScenes) throw new Error(`Too many scenes (max ${LIMITS.maxScenes}).`)

  const fps = clamp(Math.round(spec.fps || 30), LIMITS.minFps, LIMITS.maxFps)
  const width = even(clamp(Math.round(spec.width || 1280), LIMITS.minEdge, LIMITS.maxEdge))
  const height = even(clamp(Math.round(spec.height || 720), LIMITS.minEdge, LIMITS.maxEdge))

  let cursor = 0
  const out = []
  for (const [i, raw] of scenes.entries()) {
    const type = String(raw?.type || 'text').toLowerCase()
    if (!SCENE_TYPES.includes(type)) {
      throw new Error(`Scene ${i + 1}: unknown type "${type}". Use one of ${SCENE_TYPES.join(', ')}.`)
    }
    if (type === 'image' && !raw.image_url && !raw.url) {
      throw new Error(`Scene ${i + 1}: an image scene needs image_url.`)
    }
    if (type === 'bars' && !Array.isArray(raw.data)) {
      throw new Error(`Scene ${i + 1}: a bars scene needs data: [{label, value}].`)
    }

    const seconds = clamp(
      Number(raw.duration) || DEFAULT_SECONDS[type],
      LIMITS.minSceneSec, LIMITS.maxSceneSec,
    )
    const frames = Math.max(1, Math.round(seconds * fps))
    if ((cursor + frames) / fps > LIMITS.maxTotalSec) {
      throw new Error(`Video is longer than ${LIMITS.maxTotalSec}s — split it into parts.`)
    }
    out.push({
      ...raw,
      type,
      seconds: frames / fps,
      frames,
      startFrame: cursor,
      endFrame: cursor + frames,   // exclusive
    })
    cursor += frames
  }

  return {
    width, height, fps,
    format: spec.format === 'webm' ? 'webm' : 'mp4',
    theme: { ...THEME, ...(spec.theme || {}) },
    fade: spec.transition === 'cut' ? 0 : clamp(Number(spec.fade ?? 0.35), 0, 1),
    progressBar: spec.progress !== false,
    scenes: out,
    totalFrames: cursor,
    durationSec: cursor / fps,
  }
}

/**
 * Which scene is on screen at this frame, how far through it we are, and how
 * much to dim it for the cross-fade at the seam.
 * @returns {{scene:object, index:number, t:number, alpha:number}}
 */
export function frameAt(spec, frame) {
  const f = clamp(frame, 0, spec.totalFrames - 1)
  let index = spec.scenes.findIndex(s => f >= s.startFrame && f < s.endFrame)
  if (index < 0) index = spec.scenes.length - 1
  const scene = spec.scenes[index]
  const local = f - scene.startFrame
  const t = scene.frames <= 1 ? 1 : local / (scene.frames - 1)

  let alpha = 1
  const fadeFrames = Math.round(spec.fade * spec.fps)
  if (fadeFrames > 0) {
    // Fade in at the start of every scene, out at the end of the last one.
    if (local < fadeFrames) alpha = local / fadeFrames
    const tail = scene.frames - 1 - local
    if (index === spec.scenes.length - 1 && tail < fadeFrames) {
      alpha = Math.min(alpha, tail / fadeFrames)
    }
  }
  return { scene, index, t, alpha: clamp(alpha, 0, 1) }
}

// ─── Easing ───
export const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
}

/**
 * Progress of the k-th item when items appear one after another over `span`
 * of the scene, each taking `hold` to arrive.
 */
export function stagger(t, index, count, { span = 0.6, hold = 0.25 } = {}) {
  if (count <= 0) return 1
  const step = count > 1 ? span / count : 0
  return clamp((t - index * step) / hold, 0, 1)
}

/**
 * Greedy word wrap. `measure` is injected so this stays testable without a
 * canvas, and so it works identically for any font.
 */
export function wrapText(text, maxWidth, measure) {
  const out = []
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { out.push(''); continue }
    let line = words[0]
    for (const w of words.slice(1)) {
      if (measure(`${line} ${w}`) <= maxWidth) line += ` ${w}`
      else { out.push(line); line = w }
    }
    out.push(line)
  }
  return out
}

/** Ken Burns: a slow push and drift, so a still image does not look frozen. */
export function kenBurns(t, motion = 'in') {
  const e = ease.inOut(t)
  switch (motion) {
    case 'none': return { scale: 1, dx: 0, dy: 0 }
    case 'out': return { scale: 1.1 - 0.1 * e, dx: 0, dy: 0 }
    case 'left': return { scale: 1.08, dx: -0.04 + 0.08 * e, dy: 0 }
    case 'right': return { scale: 1.08, dx: 0.04 - 0.08 * e, dy: 0 }
    case 'up': return { scale: 1.08, dx: 0, dy: 0.04 - 0.08 * e }
    default: return { scale: 1 + 0.1 * e, dx: 0, dy: 0.02 * e }
  }
}

/** Cover-fit a source rect into a destination rect, then scale/pan it. */
export function coverFit(sw, sh, dw, dh, { scale = 1, dx = 0, dy = 0 } = {}) {
  const s = Math.max(dw / sw, dh / sh) * scale
  const w = sw * s
  const h = sh * s
  return { x: (dw - w) / 2 + dx * dw, y: (dh - h) / 2 + dy * dh, w, h }
}
