// Pollinations.ai — free, no key, CORS-friendly
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Pollinations rate-limits bursts (a 5-image video round 429s instantly). Serialize
// every image request through a global gate with a minimum gap, and retry 429/5xx
// with exponential backoff honouring Retry-After. One place, used by both tools and
// the video image-loader, so nothing can burst around it.
let _lastAt = 0
let _chain = Promise.resolve()
const MIN_GAP_MS = 900

async function gate() {
  const wait = Math.max(0, _lastAt + MIN_GAP_MS - Date.now())
  if (wait) await sleep(wait)
  _lastAt = Date.now()
}

/** Reset chain state - primarily for testing. */
export function resetImageRateGate() {
  _lastAt = 0
  _chain = Promise.resolve()
}

/** Fetch an image URL, rate-gated and retried. Resolves with a Response (ok or
 *  the final non-retryable one) or throws after exhausting retries on 429/5xx. */
export function fetchImage(url, { retries = 3, signal } = {}) {
  // Chain so concurrent callers queue behind each other (serialised bursts).
  const run = _chain.then(async () => {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      await gate()
      try {
        const resp = await fetch(url, { signal })
        if (resp.ok) return resp
        if (resp.status === 429 || resp.status >= 500) {
          const ra = parseFloat(resp.headers.get('retry-after'))
          await sleep(ra ? ra * 1000 : Math.min(8000, 700 * 2 ** attempt) + Math.random() * 300)
          lastErr = new Error(`Image service busy (${resp.status})`)
          continue
        }
        return resp // other status: not worth retrying
      } catch (e) {
        lastErr = e
        await sleep(Math.min(8000, 700 * 2 ** attempt))
      }
    }
    throw lastErr || new Error('Image request failed')
  })
  run.catch(() => {}).then(() => {})
  _chain = run.catch(() => {})
  return run
}

// Build a Pollinations URL with the quality knobs the endpoint supports.
export function pollinationsUrl(prompt, { width = 1024, height = 1024, seed, model = 'flux', enhance = true, negative } = {}) {
  const p = new URLSearchParams({
    width: String(width), height: String(height),
    seed: String(seed ?? Math.floor(Math.random() * 999999)),
    model, nologo: 'true', nofeed: 'true',
  })
  if (enhance) p.set('enhance', 'true')          // server-side prompt enrichment → better composition
  if (negative) p.set('negative_prompt', negative)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${p.toString()}`
}

const DEFAULT_NEGATIVE = 'blurry, low quality, distorted, deformed, extra limbs, bad anatomy, watermark, text, signature, jpeg artifacts, overexposed, low resolution, amateur, grainy, draft'

/**
 * Intelligent Prompt Enhancer for high-fidelity photorealism / 4k detail
 */
function enrichImagePrompt(prompt, style = 'photorealistic') {
  const p = prompt.trim()
  if (p.length > 250) return p // User already provided detailed description

  const styleEnhancers = {
    photorealistic: 'hyperrealistic, highly detailed 8k resolution, cinematic lighting, photorealistic textures, masterpiece, octane render, sharp focus, 35mm lens photography',
    cinematic: 'epic cinematic shot, volumetric lighting, atmospheric fog, 8k wallpaper, photorealistic color grading, dramatic contrast, unreal engine 5 render',
    anime: 'masterpiece anime illustration, highly detailed lines, vibrant color palette, Makoto Shinkai style, studio ghibli lighting, sharp details',
    '3d_render': 'award winning 3D digital art, raytraced reflections, subsurface scattering, ambient occlusion, polished 3D render, Pixar style',
    concept_art: 'highly detailed concept art, intricate digital painting, atmospheric composition, artstation trending, matte painting',
  }

  const suffix = styleEnhancers[style] || styleEnhancers.photorealistic
  return `${p}, ${suffix}`
}

export const imageGenTool = {
  schema: {
    description: 'Generate a high-fidelity image from a text prompt with 8K details, cinematic lighting, and negative prompt filtering.',
    parameters: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Detailed image description — the more specific, the better.' },
      width: { type: 'number', description: 'Width in pixels (default 1024). Use 1280×720 for 16:9 widescreen or 1024×1024 for square.' },
      height: { type: 'number', description: 'Height in pixels (default 1024)' },
      style: { type: 'string', enum: ['photorealistic', 'cinematic', 'anime', '3d_render', 'concept_art'], description: 'Visual aesthetic style enhancer (default: photorealistic)' },
      model: { type: 'string', enum: ['flux', 'turbo'], description: 'flux = best quality (default), turbo = high speed.' },
      negative: { type: 'string', description: 'What to avoid in the image (optional).' },
      seed: { type: 'number', description: 'Reproducible seed number (optional).' },
    }, required: ['prompt'] },
  },
  async execute({ prompt, width = 1024, height = 1024, style = 'photorealistic', model = 'flux', negative, seed }) {
    const refinedPrompt = enrichImagePrompt(prompt, style)
    const url = pollinationsUrl(refinedPrompt, {
      width,
      height,
      model,
      seed,
      enhance: true,
      negative: negative ? `${DEFAULT_NEGATIVE}, ${negative}` : DEFAULT_NEGATIVE,
    })
    let resp
    try { resp = await fetchImage(url) } catch (e) { return { success: false, error: `Image generation failed: ${e.message}` } }
    if (!resp.ok) return { success: false, error: `Image generation failed (${resp.status})` }
    const blob = await resp.blob()
    if (!blob.size) return { success: false, error: 'Image generation returned no data' }
    return {
      success: true, tool: 'image_generate', prompt, refinedPrompt, model,
      image_url: url,
      display_url: URL.createObjectURL(blob),
      bytes: blob.size,
      resolution: `${width}x${height}`,
    }
  }
}

export const stickerGenTool = {
  schema: {
    description: 'Generate a sticker, icon, badge, or graphic illustration from a text prompt',
    parameters: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Sticker/graphic description (e.g. "cute coding cat with laptop")' },
      style: { type: 'string', description: 'Visual style (e.g. "3d render", "flat vector", "neon badge", "retro sticker")' },
    }, required: ['prompt'] },
  },
  async execute({ prompt, style = 'vector sticker' }) {
    const enhancedPrompt = `high quality ${style}, die-cut outline, vibrant sticker graphic, isolated white background, ${prompt}`
    const url = pollinationsUrl(enhancedPrompt, { width: 1024, height: 1024, model: 'flux', enhance: true })
    let resp
    try { resp = await fetchImage(url) } catch (e) { return { success: false, error: `Sticker generation failed: ${e.message}` } }
    if (!resp.ok) return { success: false, error: `Sticker generation failed (${resp.status})` }
    const blob = await resp.blob()
    if (!blob.size) return { success: false, error: 'Sticker generation returned no data' }
    return {
      success: true,
      tool: 'sticker_generate',
      prompt,
      style,
      image_url: url,
      display_url: URL.createObjectURL(blob),
      bytes: blob.size,
    }
  }
}
