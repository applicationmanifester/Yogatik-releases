/**
 * local_image_generate / local_video_generate — on-device diffusion via a
 * user-installed ComfyUI (see electron/comfyDaemon.cjs). Desktop app only.
 *
 * These are DELIBERATELY separate tools from image_generate/video_render, not
 * a mode flag on them: image_generate is Pollinations (free, no install,
 * works everywhere) and video_render is the WebCodecs slideshow/narration
 * renderer (also free, works everywhere) — both keyless and universal. Local
 * generation trades that away for locally-controlled diffusion models the
 * user has installed themselves (SDXL/SD3/SVD checkpoints, no cloud call at
 * all), which only exists on desktop with ComfyUI running. Folding it into
 * the existing tools would make their schemas lie about what always works.
 */

import { comfyStatus, generateComfyImage, generateComfyVideo, isDesktopWithComfy } from '../comfy'
import { fetchImage } from './imageGen'
import { proxyFetch } from './http'
import { saveMedia } from '../db'

const DESKTOP_ONLY = {
  success: false,
  error: 'Local generation runs only in the Yogatik desktop app, with ComfyUI installed and pointed at from Settings → Personalise → Local generation.',
}

function base64ToBlob(base64, mime) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/** Resolve a checkpoint the caller didn't name to the first one ComfyUI reports. */
async function pickCheckpoint(explicit, list, kind) {
  if (explicit) return explicit
  if (list?.length) return list[0]
  throw new Error(
    `No ${kind} checkpoint is installed in ComfyUI. Place one in ComfyUI's models/checkpoints folder and try again — ` +
    'comfy_status (or the Local generation panel) lists what is currently installed.'
  )
}

export const localImageGenTool = {
  schema: {
    description:
      'Generate an image with a locally-installed diffusion model via ComfyUI — runs entirely on the user\'s own GPU, ' +
      'no cloud call, no API key. Desktop app only, and only after the user has pointed Yogatik at a ComfyUI install ' +
      'with at least one checkpoint. Prefer image_generate for anything that should also work on the web build or ' +
      'without local setup; reach for this when the user specifically asks for local/offline/on-device generation ' +
      'or names a checkpoint they have installed.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed image description.' },
        negative: { type: 'string', description: 'What to avoid in the image.' },
        width: { type: 'number', description: 'Default 1024.' },
        height: { type: 'number', description: 'Default 1024.' },
        steps: { type: 'number', description: 'Sampling steps, 1-150 (default 20). Higher is slower and usually sharper.' },
        cfg: { type: 'number', description: 'Classifier-free guidance scale, 0-30 (default 7).' },
        seed: { type: 'number', description: 'Reproducible seed (optional — a random one is used otherwise).' },
        checkpoint: { type: 'string', description: 'Checkpoint filename to use (default: the first one ComfyUI reports installed).' },
        sampler: { type: 'string', description: 'Sampler name (default: euler). See comfy_status for what this install supports.' },
        scheduler: { type: 'string', description: 'Scheduler name (default: normal).' },
      },
      required: ['prompt'],
    },
  },
  async execute({ prompt, negative, width, height, steps, cfg, seed, checkpoint, sampler, scheduler } = {}) {
    if (!isDesktopWithComfy()) return DESKTOP_ONLY
    if (typeof prompt !== 'string' || !prompt.trim()) return { success: false, error: 'prompt is required' }

    const status = await comfyStatus()
    if (!status.running) {
      return {
        success: false,
        error: status.installed
          ? 'ComfyUI is installed but not running. Start it from the Local generation panel, or start ComfyUI yourself.'
          : 'ComfyUI is not set up yet. Open Settings → Personalise → Local generation and point it at your ComfyUI folder.',
      }
    }

    let resolvedCheckpoint
    try {
      resolvedCheckpoint = await pickCheckpoint(checkpoint, status.checkpoints, 'image')
    } catch (e) {
      return { success: false, error: e.message }
    }

    const res = await generateComfyImage({
      prompt, negative, width, height, steps, cfg, seed, sampler, scheduler,
      checkpoint: resolvedCheckpoint,
    })
    if (!res.success) return { success: false, error: res.error || 'Local image generation failed.' }

    const blob = base64ToBlob(res.bytes, res.mime || 'image/png')
    let mediaId = null
    try { mediaId = await saveMedia({ blob, mime: res.mime || 'image/png', filename: res.filename || 'local_image.png' }) }
    catch (e) { console.warn('Could not store the generated image:', e) }

    return {
      success: true,
      tool: 'local_image_generate',
      prompt,
      checkpoint: resolvedCheckpoint,
      seed: res.seed,
      resolution: `${res.width}x${res.height}`,
      media_id: mediaId,
      display_url: URL.createObjectURL(blob),
      bytes: blob.size,
      note: `Generated locally with ComfyUI (${resolvedCheckpoint}). No data left this machine.`,
    }
  },
}

export const localVideoGenTool = {
  schema: {
    description:
      'Animate a still image into a short video clip with a locally-installed Stable Video Diffusion checkpoint via ' +
      'ComfyUI — runs entirely on the user\'s own GPU. This ANIMATES AN EXISTING IMAGE, it does not generate one from ' +
      'text — call image_generate or local_image_generate first and pass its image_url or display_url here. Produces ' +
      'an animated WEBP, not MP4 (MP4 export needs an extra ComfyUI node the base install does not include). Desktop ' +
      'app only, and needs an SVD checkpoint (e.g. svd_xt.safetensors) installed.',
    parameters: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of the source image (from a prior image_generate/local_image_generate result, or any reachable image URL).' },
        checkpoint: { type: 'string', description: 'SVD checkpoint filename (default: the first one ComfyUI reports installed).' },
        width: { type: 'number', description: 'Default 1024.' },
        height: { type: 'number', description: 'Default 576.' },
        frames: { type: 'number', description: 'Frame count, 2-120 (default 25).' },
        fps: { type: 'number', description: 'Playback fps, 1-30 (default 6).' },
        motion: { type: 'number', description: 'Motion bucket id, 1-255 (default 127) — higher moves more.' },
        seed: { type: 'number', description: 'Reproducible seed (optional).' },
      },
      required: ['image_url'],
    },
  },
  async execute({ image_url, checkpoint, width, height, frames, fps, motion, seed } = {}) {
    if (!isDesktopWithComfy()) return DESKTOP_ONLY
    if (typeof image_url !== 'string' || !image_url.trim()) return { success: false, error: 'image_url is required — animate an existing image, generate one first.' }

    const status = await comfyStatus()
    if (!status.running) {
      return {
        success: false,
        error: status.installed
          ? 'ComfyUI is installed but not running. Start it from the Local generation panel, or start ComfyUI yourself.'
          : 'ComfyUI is not set up yet. Open Settings → Personalise → Local generation and point it at your ComfyUI folder.',
      }
    }

    let resolvedCheckpoint
    try {
      resolvedCheckpoint = await pickCheckpoint(checkpoint, status.svdCheckpoints, 'SVD (image-to-video)')
    } catch (e) {
      return { success: false, error: e.message }
    }

    let sourceBlob
    try {
      const resp = image_url.startsWith('blob:') ? await fetch(image_url) : await fetchImage(image_url).catch(() => proxyFetch(image_url))
      if (!resp.ok) throw new Error(`Could not fetch source image (${resp.status})`)
      sourceBlob = await resp.blob()
    } catch (e) {
      return { success: false, error: `Could not read the source image: ${e.message}` }
    }

    const imageBytes = await blobToBase64(sourceBlob)
    const res = await generateComfyVideo({
      imageBytes, imageMime: sourceBlob.type || 'image/png',
      checkpoint: resolvedCheckpoint, width, height, videoFrames: frames, fps, motionBucketId: motion, seed,
    })
    if (!res.success) return { success: false, error: res.error || 'Local video generation failed.' }

    const blob = base64ToBlob(res.bytes, res.mime || 'image/webp')
    let mediaId = null
    try { mediaId = await saveMedia({ blob, mime: res.mime || 'image/webp', filename: res.filename || 'local_video.webp' }) }
    catch (e) { console.warn('Could not store the generated video:', e) }

    return {
      success: true,
      tool: 'local_video_generate',
      checkpoint: resolvedCheckpoint,
      seed: res.seed,
      fps: res.fps,
      frames: res.frames,
      media_id: mediaId,
      video_url: URL.createObjectURL(blob),
      bytes: blob.size,
      mime: res.mime || 'image/webp',
      note: `Generated locally with ComfyUI (${resolvedCheckpoint}), animated WEBP at ${res.fps}fps. No data left this machine.`,
    }
  },
}
