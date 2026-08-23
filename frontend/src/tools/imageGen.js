// Pollinations.ai — free, no key, CORS-friendly with resilient multi-tier fallback
import { proxyFetch } from './http'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// In-memory LRU cache for generated image blobs (speeds up repeats & video scene builders)
const IMAGE_CACHE = new Map()
const MAX_CACHE_ENTRIES = 40

let _lastAt = 0
let _chain = Promise.resolve()
const MIN_GAP_MS = 800

async function gate() {
  const wait = Math.max(0, _lastAt + MIN_GAP_MS - Date.now())
  if (wait) await sleep(wait)
  _lastAt = Date.now()
}

/** Reset chain state - primarily for testing. */
export function resetImageRateGate() {
  _lastAt = 0
  _chain = Promise.resolve()
  IMAGE_CACHE.clear()
}

/** Fetch an image URL, rate-gated and retried with automatic proxy fallback. Resolves with a Response. */
export function fetchImage(url, { retries = 2, signal } = {}) {
  const run = _chain.then(async () => {
    let lastErr
    for (let attempt = 0; attempt <= retries; attempt++) {
      await gate()
      try {
        const resp = await fetch(url, { signal })
        if (resp.ok) return resp
        // If 403 (Cloudflare/WAF block or model restriction) or 429/500, attempt proxyFetch
        if (resp.status === 403 || resp.status === 429 || resp.status >= 500) {
          try {
            const proxyResp = await proxyFetch(url, { signal })
            if (proxyResp.ok) return proxyResp
          } catch {}
          const ra = parseFloat(resp.headers?.get?.('retry-after'))
          await sleep(ra ? ra * 1000 : Math.min(6000, 500 * 2 ** attempt) + Math.random() * 200)
          lastErr = new Error(`Image service status (${resp.status})`)
          continue
        }
        return resp
      } catch (e) {
        lastErr = e
        try {
          const proxyResp = await proxyFetch(url, { signal })
          if (proxyResp.ok) return proxyResp
        } catch {}
        await sleep(Math.min(6000, 500 * 2 ** attempt))
      }
    }
    throw lastErr || new Error('Image request failed')
  })
  run.catch(() => {}).then(() => {})
  _chain = run.catch(() => {})
  return run
}

/** Standard aspect ratio mappings */
export const ASPECT_RATIOS = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '4:3': { width: 1024, height: 768 },
  '21:9': { width: 1536, height: 640 },
}

// Build a Pollinations URL with the quality knobs the endpoint supports.
export function pollinationsUrl(prompt, { width = 1024, height = 1024, seed, model = 'flux', enhance = true, negative } = {}) {
  const p = new URLSearchParams({
    width: String(width), height: String(height),
    seed: String(seed ?? Math.floor(Math.random() * 999999)),
    model: model || 'flux',
    nologo: 'true', nofeed: 'true',
  })
  if (enhance) p.set('enhance', 'true')
  if (negative) p.set('negative_prompt', negative)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${p.toString()}`
}

const DEFAULT_NEGATIVE = 'blurry, low quality, distorted, deformed, extra limbs, bad anatomy, watermark, text, signature, jpeg artifacts, overexposed, low resolution, amateur, grainy, draft, disfigured, mutated fingers, fused fingers, bad perspective, cropped'

/**
 * Intelligent Prompt Enhancer for high-fidelity photorealism / 8k intricate detail
 */
function enrichImagePrompt(prompt, style = 'photorealistic', lighting = 'cinematic') {
  const p = (prompt || '').trim()
  if (p.length > 300) return p // User already provided detailed description

  const lightingEnhancers = {
    cinematic: 'volumetric atmospheric lighting, rim light, deep shadows, cinematic color grading',
    golden_hour: 'warm golden hour sunrays, soft diffused glow, ambient dusk backlight',
    studio: 'professional 3-point studio softbox lighting, clean reflections, balanced fill light',
    cyberpunk: 'vibrant neon backlight, chromatic aberration accents, moody dark cyber tones',
    chiaroscuro: 'dramatic chiaroscuro contrast, Caravaggio lighting, rich textured shadows',
  }

  const styleEnhancers = {
    photorealistic: 'hyperrealistic, highly detailed 8k resolution, photorealistic skin textures, masterpiece, octane render, sharp focus, shot on Hasselblad 100MP, 50mm f/1.4 lens, ISO 100',
    cinematic: 'epic cinematic shot, 8k wallpaper, photorealistic color grading, dramatic contrast, unreal engine 5 render, anamorphic lens flare, filmic depth of field',
    anime: 'masterpiece anime illustration, highly detailed lines, vibrant color palette, Makoto Shinkai style, studio ghibli lighting, sharp intricate details',
    '3d_render': 'award winning 3D digital art, raytraced reflections, subsurface scattering, ambient occlusion, polished 3D render, Pixar style, 4k render',
    concept_art: 'highly detailed concept art, intricate digital painting, atmospheric composition, artstation trending, matte painting, masterpiece',
    macro: 'ultra close-up macro photography, shallow depth of field, extreme micro-detail, razor sharp focus on center, beautiful bokeh background',
  }

  const lightText = lightingEnhancers[lighting] || lightingEnhancers.cinematic
  const styleText = styleEnhancers[style] || styleEnhancers.photorealistic
  return `${p}, ${lightText}, ${styleText}`
}

export const imageGenTool = {
  schema: {
    description: 'Generate a high-fidelity image from a text prompt with 8K details, cinematic lighting, aspect ratios, and negative prompt filtering.',
    parameters: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Detailed image description — the more specific, the better.' },
      aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '21:9'], description: 'Aspect ratio (default: "1:1"). Use "16:9" for widescreen desktop/video, "9:16" for mobile/stories.' },
      width: { type: 'number', description: 'Custom width in pixels (overrides aspect_ratio if provided).' },
      height: { type: 'number', description: 'Custom height in pixels.' },
      style: { type: 'string', enum: ['photorealistic', 'cinematic', 'anime', '3d_render', 'concept_art', 'macro'], description: 'Visual aesthetic style enhancer (default: photorealistic)' },
      lighting: { type: 'string', enum: ['cinematic', 'golden_hour', 'studio', 'cyberpunk', 'chiaroscuro'], description: 'Lighting atmospheric preset (default: cinematic)' },
      model: {
        type: 'string',
        enum: ['flux', 'turbo', 'flux-realism', 'flux-anime', 'flux-3d', 'midjourney', 'dall-e-3', 'sdxl'],
        description: 'Image generation engine: flux (default high-fidelity), turbo (fastest), flux-realism, flux-anime, flux-3d.',
      },
      negative: { type: 'string', description: 'What to avoid in the image (optional).' },
      seed: { type: 'number', description: 'Reproducible seed number (optional).' },
    }, required: ['prompt'] },
  },
  async execute({ prompt, aspect_ratio = '1:1', width, height, style = 'photorealistic', lighting = 'cinematic', model = 'flux', negative, seed }) {
    if (typeof prompt !== 'string' || !prompt.trim()) return { success: false, error: 'prompt is required' }
    const dims = ASPECT_RATIOS[aspect_ratio] || ASPECT_RATIOS['1:1']
    const finalW = width || dims.width
    const finalH = height || dims.height

    const refinedPrompt = enrichImagePrompt(prompt, style, lighting)

    // Models to attempt in order of preference (fallback on 403 auth restrictions)
    const candidateModels = [model, 'flux', 'turbo'].filter((m, i, arr) => m && arr.indexOf(m) === i)

    let lastResp = null
    let lastUrl = ''
    let chosenModel = model

    for (const candModel of candidateModels) {
      const url = pollinationsUrl(refinedPrompt, {
        width: finalW,
        height: finalH,
        model: candModel,
        seed,
        enhance: candModel === 'flux' || candModel === 'turbo',
        negative: negative ? `${DEFAULT_NEGATIVE}, ${negative}` : DEFAULT_NEGATIVE,
      })
      lastUrl = url
      chosenModel = candModel

      // Check LRU cache
      if (IMAGE_CACHE.has(url)) {
        const cached = IMAGE_CACHE.get(url)
        return {
          success: true, tool: 'image_generate', prompt, refinedPrompt, model: candModel,
          image_url: url,
          display_url: cached.displayUrl,
          bytes: cached.bytes,
          resolution: `${finalW}x${finalH}`,
          cached: true,
        }
      }

      try {
        const resp = await fetchImage(url)
        if (resp.ok) {
          lastResp = resp
          break
        }
        // If 403 on a non-default model, proceed to fallback model
        if (resp.status === 403) continue
      } catch (e) {
        // Continue to fallback model on failure
      }
    }

    if (!lastResp || !lastResp.ok) {
      return {
        success: false,
        error: `Image generation service unavailable (${lastResp?.status || 'network error'}). Please try again.`,
      }
    }

    const blob = await lastResp.blob()
    if (!blob.size) return { success: false, error: 'Image generation returned no data' }

    const displayUrl = URL.createObjectURL(blob)
    if (IMAGE_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = IMAGE_CACHE.keys().next().value
      IMAGE_CACHE.delete(oldestKey)
    }
    IMAGE_CACHE.set(lastUrl, { displayUrl, bytes: blob.size })

    return {
      success: true, tool: 'image_generate', prompt, refinedPrompt, model: chosenModel,
      image_url: lastUrl,
      display_url: displayUrl,
      bytes: blob.size,
      resolution: `${finalW}x${finalH}`,
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
    if (typeof prompt !== 'string' || !prompt.trim()) return { success: false, error: 'prompt is required' }
    const enhancedPrompt = `high quality ${style}, die-cut outline, vibrant sticker graphic, isolated white background, ${prompt}`
    const candidateModels = ['flux', 'turbo']
    let resp = null
    let lastUrl = ''

    for (const candModel of candidateModels) {
      const url = pollinationsUrl(enhancedPrompt, { width: 1024, height: 1024, model: candModel, enhance: true })
      lastUrl = url
      try {
        const r = await fetchImage(url)
        if (r.ok) {
          resp = r
          break
        }
      } catch {}
    }

    if (!resp || !resp.ok) return { success: false, error: `Sticker generation failed (${resp?.status || 'service unavailable'})` }
    const blob = await resp.blob()
    if (!blob.size) return { success: false, error: 'Sticker generation returned no data' }
    return {
      success: true,
      tool: 'sticker_generate',
      prompt,
      style,
      image_url: lastUrl,
      display_url: URL.createObjectURL(blob),
      bytes: blob.size,
    }
  }
}
