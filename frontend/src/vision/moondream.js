/**
 * Moondream Cloud VLM integration.
 * Inspired by GetStream Vision-Agents moondream plugin.
 *
 * Moondream is an ultra-fast, efficient vision-language model built specifically
 * for real-time visual question answering (VQA), image captioning, and object detection.
 * Latency is typically sub-200ms.
 */

const MOONDREAM_API_BASE = 'https://api.moondream.ai/v1'

/**
 * Query Moondream VLM with an image and question.
 * @param {object} params
 * @param {string} params.image data URL or base64
 * @param {string} params.question
 * @param {string} [params.apiKey]
 * @param {number} [params.timeoutMs=8000]
 * @returns {Promise<{ answer: string }>}
 */
export async function queryMoondream({ image, question, apiKey, timeoutMs = 8000 }) {
  if (!apiKey) throw new Error('Moondream API key required')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${MOONDREAM_API_BASE}/query`, {
      method: 'POST',
      headers: {
        'X-Moondream-Auth': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
        question: question || 'Describe what you see in this image.',
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Moondream error ${res.status}: ${errText || res.statusText}`)
    }

    const data = await res.json()
    return {
      answer: data.answer || data.caption || '',
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Detect object coordinates and bounding boxes via Moondream.
 * @param {object} params
 * @param {string} params.image
 * @param {string} params.object object name to detect (e.g. "face", "phone", "person")
 * @param {string} [params.apiKey]
 * @returns {Promise<{ objects: Array<{ x_min: number, y_min: number, x_max: number, y_max: number }> }>}
 */
export async function detectWithMoondream({ image, object = 'person', apiKey, timeoutMs = 8000 }) {
  if (!apiKey) return { objects: [] }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${MOONDREAM_API_BASE}/detect`, {
      method: 'POST',
      headers: {
        'X-Moondream-Auth': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
        object,
      }),
      signal: controller.signal,
    })

    if (!res.ok) return { objects: [] }
    const data = await res.json()
    return {
      objects: data.objects || [],
    }
  } catch {
    return { objects: [] }
  } finally {
    clearTimeout(timer)
  }
}
