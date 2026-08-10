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

/** Fetch an image URL, rate-gated and retried. Resolves with a Response (ok or
 *  the final non-retryable one) or throws after exhausting retries on 429/5xx. */
export async function fetchImage(url, { retries = 3, signal } = {}) {
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
  // Keep the chain alive but don't let one failure break the queue.
  _chain = run.catch(() => {})
  return run
}

export const imageGenTool = {
  schema: {
    description: 'Generate an image from a text prompt',
    parameters: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Image description' },
      width: { type: 'number', description: 'Width in pixels (default 1024)' },
      height: { type: 'number', description: 'Height in pixels (default 1024)' },
    }, required: ['prompt'] },
  },
  async execute({ prompt, width = 1024, height = 1024 }) {
    const seed = Math.floor(Math.random() * 999999)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`
    let resp
    try { resp = await fetchImage(url) } catch (e) { return { success: false, error: `Image generation failed: ${e.message}` } }
    if (!resp.ok) return { success: false, error: `Image generation failed (${resp.status})` }
    const blob = await resp.blob()
    if (!blob.size) return { success: false, error: 'Image generation returned no data' }
    return {
      success: true, tool: 'image_generate', prompt,
      image_url: url,
      display_url: URL.createObjectURL(blob),
      bytes: blob.size,
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
    const seed = Math.floor(Math.random() * 999999)
    const enhancedPrompt = `high quality ${style}, die-cut outline, vibrant sticker graphic, isolated white background, ${prompt}`
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=768&height=768&seed=${seed}&nologo=true`
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
