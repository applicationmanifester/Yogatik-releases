/**
 * `video_render` — compose an actual video file in the browser.
 *
 * No key, no backend, no cost: scenes are painted with Canvas2D and encoded
 * with WebCodecs (MP4/H.264), falling back to MediaRecorder (WebM). Pairs with
 * `image_generate` — generate stills, then cut them together with titles,
 * captions and animated charts.
 */

import { normalizeSpec, frameAt, LIMITS, SCENE_TYPES } from '../video/timeline'
import { paintFrame } from '../video/draw'
import { encodeVideo } from '../video/encode'
import { mixPcm, applyEdgeFades, planNarration, captionCues } from '../video/audio'
import { synthesize, cleanForSpeech, VOICES, DEFAULT_VOICE, SAMPLE_RATE } from '../video/speech'
import { proxyFetch } from './http'
import { fetchImage } from './imageGen'
import { saveMedia } from '../db'

/**
 * Load an image so the canvas stays untainted. A tainted canvas cannot be
 * read back, which fails the encode with an opaque SecurityError. Image-host
 * URLs (Pollinations) go through the rate-gated fetchImage so a multi-scene
 * render doesn't burst into 429s; other URLs try a direct CORS <img> first,
 * then the proxy.
 */
async function loadImage(url) {
  const isImageHost = /(^|\.)pollinations\.ai/i.test((() => { try { return new URL(url).hostname } catch { return '' } })())

  if (isImageHost) {
    // Rate-gated + retried; hand the bytes to the canvas as a blob.
    const resp = await fetchImage(url)
    if (!resp.ok) throw new Error(`Could not load image (${resp.status}): ${url}`)
    const blobUrl = URL.createObjectURL(await resp.blob())
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Unreadable image: ${url}`))
        img.src = blobUrl
      })
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
    }
  }

  const direct = await new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
  if (direct) return direct

  const resp = await proxyFetch(url)
  if (!resp.ok) throw new Error(`Could not load image (${resp.status}): ${url}`)
  const blobUrl = URL.createObjectURL(await resp.blob())
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Unreadable image: ${url}`))
      img.src = blobUrl
    })
  } finally {
    // The decoded bitmap outlives the object URL.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
  }
}

export const videoRenderTool = {
  schema: {
    description:
      'Render a real video file (MP4) in the browser from a scene list — titles, bullet slides, ' +
      'images with Ken Burns motion, and animated bar charts, with cross-fades and spoken narration. ' +
      'Free, no API key, runs entirely on the device. Give each scene a "narration" line and it is ' +
      'spoken by an on-device voice, subtitled, and the scene is stretched to fit the line. ' +
      'Use it for explainers, summaries, data stories and slideshows; call image_generate first if ' +
      'you want generated visuals to cut together.',
    parameters: {
      type: 'object',
      properties: {
        scenes: {
          type: 'array',
          description:
            'Ordered scenes. Each: {type, duration (seconds)} plus its own fields. ' +
            'title/outro: text, subtitle. text: heading, bullets[]. ' +
            'image: image_url, caption, motion (in|out|left|right|up|none). ' +
            'bars: heading, data[{label, value}].',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: SCENE_TYPES },
              duration: { type: 'number', description: 'Minimum seconds on screen (0.5-30); grows to fit narration' },
              narration: {
                type: 'string',
                description: 'One or two spoken sentences for this scene. Plain prose, no markdown.',
              },
              text: { type: 'string' },
              subtitle: { type: 'string' },
              heading: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
              image_url: { type: 'string' },
              caption: { type: 'string' },
              motion: { type: 'string', enum: ['in', 'out', 'left', 'right', 'up', 'none'] },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { label: { type: 'string' }, value: { type: 'number' } },
                  required: ['label', 'value'],
                },
              },
            },
            required: ['type'],
          },
        },
        width: { type: 'number', description: 'Default 1280' },
        height: { type: 'number', description: 'Default 720' },
        fps: { type: 'number', description: 'Default 30' },
        quality: {
          type: 'string',
          description: "Encoding quality: 'draft' (small), 'standard' (default), 'high' (sharp text/detail, 1080p) or 'max'. Use 'high' when the video contains text or fine detail.",
        },
        transition: { type: 'string', enum: ['fade', 'cut'], description: 'Default fade' },
        voice: {
          type: 'string', enum: Object.keys(VOICES),
          description: `Narrator voice. ${Object.entries(VOICES).map(([k, v]) => `${k}: ${v}`).join('; ')}`,
        },
        speed: { type: 'number', description: 'Speaking speed 0.6-1.5, default 1' },
        narrate: { type: 'boolean', description: 'Set false to render silent even if scenes have narration' },
      },
      required: ['scenes'],
    },
  },

  async execute(args) {
    // ─── Narration first: the voice decides how long each scene must be ───
    // Rendering to a fixed duration and hoping the line fits is how you get a
    // sentence cut in half at the cut.
    const wantsSpeech = args.narrate !== false &&
      (args.scenes || []).some(s => cleanForSpeech(s?.narration))
    let clips = []
    let voiceError = null
    const t = { narration_ms: 0, images_ms: 0, encode_ms: 0 }
    const mark = performance.now()

    if (wantsSpeech) {
      try {
        for (const scene of args.scenes) {
          const line = cleanForSpeech(scene?.narration)
          if (!line) { clips.push(null); continue }
          const { pcm, sampleRate } = await synthesize(line, {
            voice: args.voice, speed: args.speed,
          })
          clips.push({ pcm: applyEdgeFades(pcm, sampleRate), sampleRate, seconds: pcm.length / sampleRate })
        }
      } catch (e) {
        // A voice that will not load must not cost the user their video.
        voiceError = e?.message || String(e)
        clips = []
      }
    }

    t.narration_ms = Math.round(performance.now() - mark)

    const plan = clips.length
      ? planNarration(args.scenes.map((s, i) => ({
        seconds: Number(s.duration) || 0,
        speechSec: clips[i]?.seconds || 0,
      })))
      : null

    let spec
    try {
      spec = normalizeSpec(plan
        ? { ...args, scenes: args.scenes.map((s, i) => ({ ...s, duration: plan.durations[i] })) }
        : args)
    } catch (e) {
      return { success: false, error: e.message }
    }

    // Subtitles are cued against the scene's final length, so they track the
    // voice even after the scene was stretched to fit it.
    let audio = null
    if (plan) {
      const LEAD = 0.35   // matches planNarration's lead-in
      const mixClips = []
      spec.scenes.forEach((scene, i) => {
        const clip = clips[i]
        if (!clip?.pcm.length) return
        mixClips.push({ pcm: clip.pcm, startSec: scene.startFrame / spec.fps + LEAD })
        // Cues are scene-relative, and the voice starts after the lead-in.
        scene._cues = captionCues(args.scenes[i].narration, clip.seconds)
          .map(c => ({ ...c, start: c.start + LEAD, end: c.end + LEAD }))
      })
      if (mixClips.length) {
        audio = {
          pcm: mixPcm(mixClips, SAMPLE_RATE, spec.durationSec),
          sampleRate: SAMPLE_RATE,
        }
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = spec.width
    canvas.height = spec.height
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!ctx) return { success: false, error: 'Canvas 2D is unavailable in this browser.' }

    // Decode every image up front: the draw loop is synchronous, and awaiting
    // inside it would stall the encoder queue between frames.
    const imagesAt = performance.now()
    await Promise.all(spec.scenes.map(async (s) => {
      const url = s.image_url || s.url
      if (s.type === 'image' && url) {
        try {
          s._image = await loadImage(url)
        } catch (imgErr) {
          console.warn('[video_render] Could not load image for scene:', url, imgErr?.message || imgErr)
          s._image = null
        }
      }
    }))

    t.images_ms = Math.round(performance.now() - imagesAt)

    const started = performance.now()
    let result
    try {
      result = await encodeVideo({
        canvas,
        totalFrames: spec.totalFrames,
        fps: spec.fps,
        quality: args.quality,
        audio,
        drawFrame: (i) => paintFrame(ctx, spec, frameAt(spec, i)),
      })
    } catch (e) {
      return {
        success: false,
        error: e?.name === 'AbortError' ? 'Stopped' : `Video encoding failed: ${e?.message || e}`,
      }
    }

    t.encode_ms = Math.round(performance.now() - started)

    const filename = `yogatik-${Date.now()}.${result.mime.includes('mp4') ? 'mp4' : 'webm'}`
    // Store the bytes: a blob: URL is dead after a reload, and the video the
    // user just waited for should still be there tomorrow.
    let mediaId = null
    try {
      mediaId = await saveMedia({ blob: result.blob, mime: result.mime, filename })
    } catch (e) {
      console.warn('Could not store the rendered video:', e)
    }

    return {
      success: true,
      tool: 'video_render',
      media_id: mediaId,
      // Playable now; the card re-creates it from media_id after a reload.
      video_url: URL.createObjectURL(result.blob),
      filename,
      mime: result.mime,
      encoder: result.encoder,
      duration_sec: Number(spec.durationSec.toFixed(2)),
      frames: spec.totalFrames,
      resolution: `${spec.width}x${spec.height}`,
      fps: spec.fps,
      bytes: result.blob.size,
      render_ms: t.encode_ms,
      timings: t,
      scenes: spec.scenes.map(s => ({ type: s.type, seconds: Number(s.seconds.toFixed(2)) })),
      narrated: !!result.audio,
      audio_codec: result.audio || null,
      voice: result.audio ? (VOICES[args.voice] ? args.voice : DEFAULT_VOICE) : null,
      ...(voiceError ? { warning: `Narration unavailable, rendered silent: ${voiceError}` } : {}),
      // The app renders a player and a download button from media_id; the model
      // has no URL to quote and must not invent one.
      display: 'The video is already shown to the user with a player and a download button. Do not print a link.',
      note: `Rendered on-device (${result.encoder}). Max ${LIMITS.maxTotalSec}s per video.` +
        (result.audio
          ? ' Narrated by the on-device voice, with burnt-in subtitles; scene lengths were stretched to fit each line.'
          : ' Silent — add a narration field to a scene to have it spoken.'),
    }
  },
}
