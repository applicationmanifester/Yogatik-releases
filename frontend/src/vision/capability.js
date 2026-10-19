/**
 * Which model can actually see?
 *
 * A hardcoded list rots — providers add and retire vision models constantly
 * (deepseek-v4-flash EOL'd mid-session). So: guess from the name, then confirm
 * with a real 1-pixel probe, and cache the verdict per model.
 */

import * as db from '../db'
import { chatComplete } from '../llm'

// 1x1 red PNG. Small enough that the probe costs ~nothing.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const YES = /(vision|vl\b|-vl-|visual|multimodal|omni|4o|gpt-4\.1|gpt-5|o3|o4|scout|maverick|llama-4|gemini|pixtral|llava|qwen.?vl|intern.?vl|molmo|phi-[34].*vision|claude|grok-[2-9].*vision|nemotron.*vl)/i
const NO = /(embed|rerank|guard|whisper|tts|moderation|coder|math|-r1\b)/i

/** Cheap first pass — avoids probing 40 models to populate a dropdown. */
export function looksVisionCapable(model = '') {
  if (!model || NO.test(model)) return false
  return YES.test(model)
}

const key = (p, m) => `vision_${p}::${m}`
const TTL = 7 * 24 * 60 * 60 * 1000   // model capabilities change slowly

/** Cached verdict without touching the network. null = unknown. */
export async function getCachedVision(provider, model) {
  const rec = await db.getSetting(key(provider, model))
  if (!rec || Date.now() - rec.at > TTL) return null
  return rec.ok
}

/**
 * Ask the model to look at one pixel. The only reliable test — providers
 * advertise nothing useful, and many 400 rather than ignore the image.
 * @returns {Promise<boolean>}
 */
export async function probeVision({ provider, apiKey, model }) {
  const cached = await getCachedVision(provider, model)
  if (cached !== null) return cached

  let ok = false
  try {
    await chatComplete({
      provider, apiKey, model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'ok?' },
          { type: 'image_url', image_url: { url: PIXEL } },
        ],
      }],
      maxTokens: 1, temperature: 0, timeoutMs: 20000, retries: 0,
    })
    ok = true
  } catch (e) {
    // A 400 here means "I do not take images". Anything else (429, network)
    // is not evidence either way, so do not poison the cache with it.
    const msg = e?.message || ''
    if (!/\b400\b|invalid|unsupported|not support|image/i.test(msg)) return looksVisionCapable(model)
    ok = false
  }
  await db.setSetting(key(provider, model), { ok, at: Date.now() })
  return ok
}

/**
 * Find a vision-capable model on the SAME provider — the Live camera guard's
 * auto-resolution (Horizon 1's final item, LIVE_ROADMAP 4a).
 *
 * Cache-first on purpose: a verdict we already hold needs no network at all,
 * so a camera press decided from it can never stall mid-turn. Probes are only
 * spent where the cache has nothing to say, and only on models whose NAME
 * says vision — every probe is a real round trip, so blind-probing the whole
 * provider list is not on.
 *
 * @param {{
 *   provider: string,
 *   apiKey?: string,
 *   models?: string[],   // the active provider's model list
 *   skip?: string,       // the ACTIVE model — known text-only, never re-probed
 *   maxProbes?: number,
 * }} o
 * @returns {Promise<string|null>} a vision-capable model, or null: none is
 *   reachable (empty/unknown list, offline, probes failed) — the caller then
 *   keeps the strict block instead of switching blind.
 */
export async function findVisionCandidate({ provider, apiKey, models = [], skip = '', maxProbes = 4 } = {}) {
  const list = (models || []).filter(m => m && m !== skip)
  if (!provider || !list.length) return null

  // Pass 1 — the cache, and ONLY the cache. "already-known cached capability
  // first": if anything here answers, no network is touched at all.
  const verdict = new Map()
  for (const m of list) {
    const cached = await getCachedVision(provider, m)
    if (cached === true) return m
    verdict.set(m, cached)
  }

  // Offline there is nobody to ask: decide from the cache or not at all.
  const canProbe = typeof navigator === 'undefined' || navigator.onLine !== false
  if (!canProbe) return null

  // Pass 2 — the name heuristic shortlists the candidates worth a real probe;
  // ones the cache already ruled OUT are excluded here rather than re-asked.
  const guesses = list.filter(m => looksVisionCapable(m) && verdict.get(m) !== false)
  let probed = 0
  for (const m of guesses) {
    if (probed >= maxProbes) break
    probed++
    // probeVision re-checks this model's cache itself, then asks it to look
    // at one pixel — a 400 ("I do not take images") travels in milliseconds.
    if (await probeVision({ provider, apiKey, model: m })) return m
  }
  return null
}

/**
 * The routing decision for anything that needs to see.
 * @returns {Promise<{mode:'model'|'local'|'none', model?:string, reason?:string}>}
 */
export async function resolveVisionPath({ provider, apiKey, model, allowLocal = true }) {
  if (model) {
    const cached = await getCachedVision(provider, model)
    if (cached === true) return { mode: 'model', model }
    if (cached === null && looksVisionCapable(model)) {
      if (await probeVision({ provider, apiKey, model })) return { mode: 'model', model }
    }
  }
  if (allowLocal) return { mode: 'local', reason: `${model || 'The active model'} cannot see; using the on-device vision model.` }
  return { mode: 'none', reason: `${model || 'The active model'} cannot process images.` }
}
