/**
 * Scene painters — everything is drawn with Canvas2D, once per frame, from the
 * timeline's (scene, t) pair. No DOM, no animation loop: the encoder decides
 * when frames happen, so a 60s video can render in a few seconds.
 */

import { ease, stagger, wrapText, kenBurns, coverFit } from './timeline'
import { cueAt } from './audio'

const px = (n) => `${Math.round(n)}px`

function fitFont(ctx, text, { max, min, weight, family, maxWidth, maxLines = 3 }) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${px(size)} ${family}`
    const lines = wrapText(text, maxWidth, (s) => ctx.measureText(s).width)
    if (lines.length <= maxLines) return { size, lines }
  }
  ctx.font = `${weight} ${px(min)} ${family}`
  return { size: min, lines: wrapText(text, maxWidth, (s) => ctx.measureText(s).width).slice(0, maxLines) }
}

function background(ctx, W, H, theme, t) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, theme.bg)
  g.addColorStop(1, theme.bgAlt)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // A slow accent glow keeps flat colour from looking like a broken player.
  const cx = W * (0.25 + 0.5 * ease.inOut(t))
  const glow = ctx.createRadialGradient(cx, H * 0.15, 0, cx, H * 0.15, Math.max(W, H) * 0.7)
  glow.addColorStop(0, `${theme.accent}22`)
  glow.addColorStop(1, '#00000000')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
}

function drawTitle(ctx, scene, t, { W, H, theme }) {
  const pad = W * 0.1
  const rise = (1 - ease.out(Math.min(1, t * 3))) * H * 0.04

  const { size, lines } = fitFont(ctx, scene.text || '', {
    max: H * 0.13, min: H * 0.06, weight: '700', family: theme.font, maxWidth: W - pad * 2, maxLines: 3,
  })
  const lh = size * 1.18
  const subSize = size * 0.36
  const blockH = lines.length * lh + (scene.subtitle ? subSize * 2 : 0)
  let y = (H - blockH) / 2 + size * 0.8 + rise

  ctx.textAlign = 'center'
  ctx.fillStyle = theme.fg
  ctx.font = `700 ${px(size)} ${theme.font}`
  for (const line of lines) { ctx.fillText(line, W / 2, y); y += lh }

  if (scene.subtitle) {
    ctx.fillStyle = theme.dim
    ctx.font = `400 ${px(subSize)} ${theme.font}`
    ctx.fillText(scene.subtitle, W / 2, y + subSize * 0.6)
  }

  // Accent rule that draws itself in.
  const w = W * 0.18 * ease.out(Math.min(1, t * 2.5))
  ctx.fillStyle = theme.accent
  ctx.fillRect((W - w) / 2, (H - blockH) / 2 - size * 0.6, w, Math.max(3, H * 0.006))
}

function drawText(ctx, scene, t, { W, H, theme }) {
  const pad = W * 0.09
  let y = H * 0.22

  if (scene.heading) {
    const { size, lines } = fitFont(ctx, scene.heading, {
      max: H * 0.09, min: H * 0.05, weight: '700', family: theme.font, maxWidth: W - pad * 2, maxLines: 2,
    })
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.fg
    ctx.font = `700 ${px(size)} ${theme.font}`
    for (const line of lines) { ctx.fillText(line, pad, y); y += size * 1.2 }
    ctx.fillStyle = theme.accent
    ctx.fillRect(pad, y - size * 0.5, W * 0.12, Math.max(3, H * 0.005))
    y += size * 0.5
  }

  const items = (Array.isArray(scene.bullets) ? scene.bullets : String(scene.text || '').split('\n'))
    .map(s => String(s).trim()).filter(Boolean)

  const bodySize = Math.min(H * 0.058, (H * 0.62 - (y - H * 0.22)) / Math.max(items.length, 1) * 0.55)
  ctx.font = `400 ${px(bodySize)} ${theme.font}`

  items.forEach((item, i) => {
    const p = ease.out(stagger(t, i, items.length))
    if (p <= 0) return
    ctx.globalAlpha = p
    const dx = (1 - p) * W * 0.02
    const lines = wrapText(item, W - pad * 2 - bodySize * 1.6, (s) => ctx.measureText(s).width)

    ctx.fillStyle = theme.accent
    ctx.beginPath()
    ctx.arc(pad + bodySize * 0.35 + dx, y - bodySize * 0.3, bodySize * 0.16, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = theme.fg
    for (const line of lines) {
      ctx.fillText(line, pad + bodySize * 1.4 + dx, y)
      y += bodySize * 1.28
    }
    y += bodySize * 0.45
    ctx.globalAlpha = 1
  })
}

function drawImage(ctx, scene, t, { W, H, theme }) {
  const img = scene._image
  if (img) {
    const box = coverFit(img.width, img.height, W, H, kenBurns(t, scene.motion))
    ctx.drawImage(img, box.x, box.y, box.w, box.h)
  } else {
    ctx.fillStyle = theme.bgAlt
    ctx.fillRect(0, 0, W, H)
  }

  if (scene.caption) {
    const size = H * 0.048
    const band = size * 3
    const g = ctx.createLinearGradient(0, H - band, 0, H)
    g.addColorStop(0, '#00000000')
    g.addColorStop(1, '#000000d9')
    ctx.fillStyle = g
    ctx.fillRect(0, H - band, W, band)

    ctx.font = `500 ${px(size)} ${theme.font}`
    ctx.textAlign = 'center'
    ctx.fillStyle = theme.fg
    const lines = wrapText(scene.caption, W * 0.84, (s) => ctx.measureText(s).width).slice(0, 2)
    let y = H - band * 0.42
    for (const line of lines) { ctx.fillText(line, W / 2, y); y += size * 1.25 }
  }
}

function drawBars(ctx, scene, t, { W, H, theme }) {
  const data = scene.data.slice(0, 12).map(d => ({
    label: String(d.label ?? ''),
    value: Number(d.value) || 0,
  }))
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1)
  const pad = W * 0.09
  const top = H * (scene.heading ? 0.3 : 0.2)
  const bottom = H * 0.82
  const plotH = bottom - top
  const slot = (W - pad * 2) / data.length
  const barW = slot * 0.56

  if (scene.heading) {
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.fg
    const size = H * 0.075
    ctx.font = `700 ${px(size)} ${theme.font}`
    ctx.fillText(scene.heading, pad, H * 0.18)
  }

  ctx.strokeStyle = `${theme.dim}44`
  ctx.lineWidth = Math.max(1, H * 0.002)
  ctx.beginPath()
  ctx.moveTo(pad, bottom)
  ctx.lineTo(W - pad, bottom)
  ctx.stroke()

  const labelSize = Math.min(H * 0.038, slot * 0.28)
  data.forEach((d, i) => {
    const p = ease.out(stagger(t, i, data.length, { span: 0.5, hold: 0.35 }))
    const h = (Math.abs(d.value) / max) * plotH * 0.92 * p
    const x = pad + slot * i + (slot - barW) / 2

    const g = ctx.createLinearGradient(0, bottom - h, 0, bottom)
    g.addColorStop(0, theme.accent)
    g.addColorStop(1, theme.accent2)
    ctx.fillStyle = g
    const r = Math.min(barW * 0.18, h)
    ctx.beginPath()
    ctx.roundRect?.(x, bottom - h, barW, h, [r, r, 0, 0])
    if (ctx.roundRect) ctx.fill()
    else ctx.fillRect(x, bottom - h, barW, h)

    ctx.textAlign = 'center'
    ctx.font = `600 ${px(labelSize)} ${theme.font}`
    ctx.fillStyle = theme.fg
    if (p > 0.15) ctx.fillText(String(d.value), x + barW / 2, bottom - h - labelSize * 0.5)
    ctx.fillStyle = theme.dim
    ctx.font = `400 ${px(labelSize)} ${theme.font}`
    ctx.fillText(d.label, x + barW / 2, bottom + labelSize * 1.5)
  })
}

function drawQuote(ctx, scene, t, { W, H, theme }) {
  const pad = W * 0.12
  const text = scene.quote || scene.text || ''
  const author = scene.author || scene.subtitle || ''

  const p = ease.out(Math.min(1, t * 2.2))
  ctx.globalAlpha = p

  // Elegant large quotation mark background icon
  ctx.fillStyle = `${theme.accent}1f`
  ctx.font = `italic 900 ${px(H * 0.38)} serif`
  ctx.textAlign = 'left'
  ctx.fillText('“', pad - W * 0.04, H * 0.38)

  const { size, lines } = fitFont(ctx, `"${text}"`, {
    max: H * 0.08, min: H * 0.042, weight: '500', family: theme.font, maxWidth: W - pad * 2, maxLines: 4,
  })
  const lh = size * 1.3
  let y = H * 0.4 - (lines.length * lh) / 2 + size

  ctx.textAlign = 'center'
  ctx.fillStyle = theme.fg
  ctx.font = `500 italic ${px(size)} ${theme.font}`
  for (const line of lines) { ctx.fillText(line, W / 2, y); y += lh }

  if (author) {
    y += size * 0.4
    ctx.fillStyle = theme.accent
    ctx.font = `600 ${px(size * 0.48)} ${theme.font}`
    ctx.fillText(`— ${author}`, W / 2, y)
  }
  ctx.globalAlpha = 1
}

function drawMetric(ctx, scene, t, { W, H, theme }) {
  const metric = scene.metric || scene.heading || scene.text || '100%'
  const label = scene.label || scene.subtitle || scene.caption || ''
  const p = ease.out(Math.min(1, t * 2.5))

  ctx.textAlign = 'center'
  const metricSize = H * 0.22
  const labelSize = H * 0.055

  // Metric value with glowing accent
  ctx.globalAlpha = p
  ctx.fillStyle = theme.accent
  ctx.font = `800 ${px(metricSize)} ${theme.font}`
  ctx.fillText(metric, W / 2, H * 0.5)

  // Label card
  if (label) {
    ctx.fillStyle = theme.fg
    ctx.font = `500 ${px(labelSize)} ${theme.font}`
    ctx.fillText(label, W / 2, H * 0.5 + labelSize * 1.6)
  }

  // Accent underline
  const barW = W * 0.16 * p
  ctx.fillStyle = theme.accent2
  ctx.fillRect((W - barW) / 2, H * 0.5 + labelSize * 2.2, barW, Math.max(3, H * 0.006))
  ctx.globalAlpha = 1
}

/**
 * Burnt-in subtitles for the narration. The MP4 carries no subtitle track, and
 * a spoken video with no on-screen text is unusable muted or deaf.
 */
function drawSubtitle(ctx, scene, t, { W, H, theme }) {
  const cue = cueAt(scene._cues, t * scene.seconds)
  if (!cue?.text) return

  const size = Math.max(16, H * 0.045)
  ctx.font = `500 ${px(size)} ${theme.font}`
  const lines = wrapText(cue.text, W * 0.8, (s) => ctx.measureText(s).width).slice(0, 3)
  const boxH = lines.length * size * 1.3 + size * 0.7
  const bottom = H * 0.955
  const top = bottom - boxH

  ctx.fillStyle = '#000000bf'
  const w = Math.min(W * 0.88, Math.max(...lines.map(l => ctx.measureText(l).width)) + size * 1.4)
  const x = (W - w) / 2
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(x, top, w, boxH, size * 0.35)
    ctx.fill()
    ctx.strokeStyle = '#ffffff22'
    ctx.lineWidth = 1
    ctx.stroke()
  } else ctx.fillRect(x, top, w, boxH)

  ctx.textAlign = 'center'
  ctx.fillStyle = theme.fg
  let y = top + size * 1.15
  for (const line of lines) { ctx.fillText(line, W / 2, y); y += size * 1.3 }
}

const PAINTERS = {
  title: drawTitle,
  outro: drawTitle,
  text: drawText,
  image: drawImage,
  bars: drawBars,
  quote: drawQuote,
  metric: drawMetric,
}

/** Paint one frame of the whole video. */
export function paintFrame(ctx, spec, { scene, t, alpha }) {
  const { width: W, height: H, theme } = spec
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  if (scene.type !== 'image') background(ctx, W, H, theme, t)
  ;(PAINTERS[scene.type] || drawText)(ctx, scene, t, { W, H, theme })

  if (scene._cues?.length) drawSubtitle(ctx, scene, t, { W, H, theme })

  if (spec.progressBar) {
    const done = (scene.startFrame + t * (scene.frames - 1)) / Math.max(1, spec.totalFrames - 1)
    const h = Math.max(3, H * 0.006)
    ctx.globalAlpha = 1
    ctx.fillStyle = `${theme.dim}33`
    ctx.fillRect(0, H - h, W, h)
    ctx.fillStyle = theme.accent
    ctx.fillRect(0, H - h, W * done, h)
  }

  // Cross-fade seams: dim the whole composited frame rather than each element.
  if (alpha < 1) {
    ctx.globalAlpha = 1 - alpha
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
  }
  ctx.restore()
}

