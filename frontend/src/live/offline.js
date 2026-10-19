/**
 * Fully-offline Live — the readiness profiler and stack selector (Horizon-3
 * item 9, foundation).
 *
 * The claim in LIVE_ROADMAP §9: "a voice assistant that works on a plane, in
 * a basement, in a clean room. No frontier vendor will ship this." The pieces
 * already exist on-device — Ollama or WebLLM for chat, Whisper for input,
 * Kokoro (or the browser's built-in voices) for output, SmolVLM for a local
 * describe fallback — but nothing told a user WHICH ones they had, what a
 * missing one costs, or what refusing the cloud actually disables. This
 * module is that honest arithmetic:
 *
 *   - checkOfflineReadiness()  per-component gaps, each as a download-consent
 *                              entry (component → need → sizeMb → consentKey),
 *                              optional components flagged as optional
 *   - pickOfflineChat()        first fully-local chat provider: Ollama first,
 *                              WebLLM fallback, NEVER a cloud key
 *   - resolveOfflineStack()    the whole pinned stack for LiveView's
 *                              "Go fully offline" toggle, with a one-line
 *                              badge and an honest list of what is degraded
 *
 * Pure: nothing here probes a device or reads storage. Callers pass the
 * availability flags they already hold (whisper.js, video/speech.js,
 * localLLM.js, the provider list) — so the readiness matrix and the selector
 * precedence are testable without a GPU, an Ollama daemon, or network.
 */

import { KNOWN_SIZES } from '../downloadConsent'

/** Component → downloadConsent feature key. One source of consent, one wording. */
export const COMPONENT_CONSENT = {
  chat: 'localLLM',
  stt: 'whisper',
  tts: 'neuralVoice',
  vision: 'localVision',
}

/** Component → known one-time download size (MB), mirroring downloadConsent. */
export const COMPONENT_SIZE_MB = {
  chat: KNOWN_SIZES.localLLM,      // 350 WebLLM quantised instruct model
  stt: KNOWN_SIZES.whisper,        // 145 Whisper-base
  tts: KNOWN_SIZES.neuralVoice,    // 90 Kokoro-82M
  vision: KNOWN_SIZES.localVision, // 230 SmolVLM describe fallback
}

/** What a missing component is, in one honest line for the consent prompt. */
export const COMPONENT_NEEDS = {
  chat: 'A local chat model — pull one into Ollama, or download the on-device WebLLM model',
  stt: 'On-device speech recognition (Whisper). Browser speech recognition is a cloud service and is not used offline',
  tts: 'Offline voice output — the Kokoro neural voice, or the browser\'s built-in voices',
  vision: 'Optional local vision (SmolVLM describe fallback) for camera answers on a text-only model',
}

/**
 * Cloud-dependent tools disabled the moment a call is pinned offline. The
 * degraded list below is the human-readable receipt for exactly this set —
 * including identify (identify = read + search, and the search half stops),
 * pill_lookup and barcode_lookup, which are hands-busy tools but web tools.
 */
export const WEB_TOOL_NAMES = [
  'web_search', 'deep_research', 'social_search', 'web_extract',
  'browser_control', 'browser_autopilot', 'lightpanda',
  'identify', 'barcode_lookup', 'pill_lookup',
  'weather', 'ip_lookup', 'whois', 'youtube', 'translate', 'rss',
]

// Mirrors localLLM.DEFAULT_LOCAL_MODEL. Held as a constant, not imported, so
// this module stays pure string logic; LiveView passes localLLM's real
// default in as `webllmModel` when pinning, which is the wired truth.
export const DEFAULT_WEBLLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'

/** Provider ids on the fully-local path (llm.js PROVIDERS keys). */
export const OLLAMA_PROVIDER = 'ollama'
export const WEBLLM_PROVIDER = 'local'

const DEGRADED_WEB = 'No web tools: web search, deep research, browser, identify and pill/barcode lookup are disabled'
const DEGRADED_WEBLLM = 'Chat runs in-browser (WebLLM) — slower than an Ollama daemon and one turn at a time'
const DEGRADED_SYSTEM_VOICE = 'Voice is the browser\'s built-in engine — plainer than the Kokoro neural voice'
const DEGRADED_NO_VLM = 'Vision is OCR + describe only, on-device — no local VLM downloaded (optional)'
const CLOUD_REFUSAL = 'No local chat model available, and offline mode never consults a cloud key'

/**
 * Readiness per component.
 *
 * Required for a pinned call: a local CHAT model, on-device STT (Whisper —
 * Web Speech recognition streams to Google and is NOT local), and SOME local
 * TTS (Kokoro, or the browser's built-in synthesis voices). Local vision is
 * OPTIONAL: its absence is a degraded note, not a blocker, and it is still
 * listed so "what's missing" is complete rather than curated.
 *
 * @param {Object} o
 * @param {Array}  o.ollamaModels           models live from the Ollama daemon
 * @param {boolean} o.whisperAvailable       whisper.js model ready/cached
 * @param {boolean} o.kokoroAvailable        Kokoro narrator ready or cached
 * @param {boolean} o.localVisionAvailable   local VLM present (consent + download)
 * @param {boolean} [o.webllmReady]          WebLLM engine already loaded
 * @param {boolean} [o.systemTtsAvailable]   speechSynthesis exists (default true)
 * @returns {{ready: boolean, present: string[], missing: Array,
 *                requiredMissing: Array, blockedOn: string|null, nextStep: string|null}}
 *   Each missing entry: {component, need, sizeMb, consentKey, required}.
 */
export function checkOfflineReadiness({
  ollamaModels = [],
  whisperAvailable = false,
  kokoroAvailable = false,
  localVisionAvailable = false,
  webllmReady = false,
  systemTtsAvailable = true,
} = {}) {
  const models = Array.isArray(ollamaModels)
    ? ollamaModels.filter(m => typeof m === 'string' && m.trim())
    : []
  const present = []
  const missing = []
  const gap = (component, required) => missing.push({
    component,
    need: COMPONENT_NEEDS[component],
    sizeMb: COMPONENT_SIZE_MB[component],
    consentKey: COMPONENT_CONSENT[component],
    required,
  })

  if (models.length > 0 || webllmReady) present.push('chat')
  else gap('chat', true)
  if (whisperAvailable) present.push('stt')
  else gap('stt', true)
  if (kokoroAvailable || systemTtsAvailable) present.push('tts')
  else gap('tts', true)
  if (localVisionAvailable) present.push('vision')
  else gap('vision', false)

  const requiredMissing = missing.filter(m => m.required)
  return {
    ready: requiredMissing.length === 0,
    present,
    missing,
    requiredMissing,
    blockedOn: requiredMissing[0]?.component || null,
    nextStep: requiredMissing[0]?.need || null,
  }
}

/**
 * First fully-local chat provider — OLLAMA FIRST, WebLLM fallback, cloud
 * refusal beyond that. An empty `providers` map is treated as "not shown the
 * provider table"; a non-empty one must actually contain the provider id,
 * otherwise a custom config that deleted Ollama stays deleted.
 *
 * @returns {{provider: string, model: string, apiKey: string, engine: 'cascade'} | null}
 *   apiKey is '' — both paths are keyless, and the cascade engine treats
 *   them as local providers (no cloud fallback chain, Web Speech skipped).
 */
export function pickOfflineChat({
  providers = {},
  ollamaModels = [],
  webllmReady = false,
  webllmModel = DEFAULT_WEBLLM_MODEL,
} = {}) {
  const models = Array.isArray(ollamaModels)
    ? ollamaModels.filter(m => typeof m === 'string' && m.trim())
    : []
  const usable = (id) => (!providers || Object.keys(providers).length === 0) ? true : !!providers[id]
  if (models.length > 0 && usable(OLLAMA_PROVIDER)) {
    return { provider: OLLAMA_PROVIDER, model: models[0], apiKey: '', engine: 'cascade' }
  }
  if (webllmReady && usable(WEBLLM_PROVIDER)) {
    return { provider: WEBLLM_PROVIDER, model: String(webllmModel || DEFAULT_WEBLLM_MODEL), apiKey: '', engine: 'cascade' }
  }
  // The cloud refusal, stated: there is no third branch.
  return null
}

/**
 * The whole stack for one pinned call: what runs, what it costs, what is
 * degraded. LiveView re-creates the session on these values and shows
 * `badge` verbatim.
 *
 * @returns {{ready, chat, stt, tts, vision, degraded: string[], badge: string,
 *            refusal: string|null, missing, present, blockedOn, nextStep,
 *            readiness}}
 *   chat/… are null when that component cannot be served locally; `ready` is
 *   true only when chat, stt and tts all resolve (vision is optional).
 */
export function resolveOfflineStack({
  providers = {},
  ollamaModels = [],
  webllmReady = false,
  webllmModel = DEFAULT_WEBLLM_MODEL,
  whisperAvailable = false,
  kokoroAvailable = false,
  systemTtsAvailable = true,
  localVisionAvailable = false,
} = {}) {
  const readiness = checkOfflineReadiness({
    ollamaModels, whisperAvailable, kokoroAvailable, localVisionAvailable,
    webllmReady, systemTtsAvailable,
  })
  const chat = pickOfflineChat({ providers, ollamaModels, webllmReady, webllmModel })
  const stt = whisperAvailable ? { engine: 'whisper' } : null
  const tts = kokoroAvailable
    ? { engine: 'neural', voice: 'af_heart' }                        // video/speech DEFAULT_VOICE
    : systemTtsAvailable ? { engine: 'system', voice: null } : null
  const vision = localVisionAvailable ? 'local-vlm' : null
  const ready = readiness.ready && !!chat && !!stt && !!tts

  const degraded = [DEGRADED_WEB]
  if (chat?.provider === WEBLLM_PROVIDER) degraded.push(DEGRADED_WEBLLM)
  if (tts?.engine === 'system') degraded.push(DEGRADED_SYSTEM_VOICE)
  if (!localVisionAvailable) degraded.push(DEGRADED_NO_VLM)

  const chatLabel = chat
    ? `${chat.provider === OLLAMA_PROVIDER ? 'Ollama' : 'WebLLM'} ⌁ ${chat.model.split('/').pop()}`
    : 'no local chat model'
  const voiceLabel = tts ? (tts.engine === 'neural' ? 'Kokoro voice' : 'system voice') : 'no voice'
  const badge = ready
    ? `Fully offline: ${chatLabel} · Whisper speech · ${voiceLabel} — no web tools`
    : `Not fully offline yet — ${readiness.nextStep || CLOUD_REFUSAL}`

  return {
    ready,
    readiness,
    chat,
    stt,
    tts,
    vision,
    degraded,
    badge,
    refusal: chat ? null : CLOUD_REFUSAL,
    chatLabel,  // [test] exposed for chatLabel test
    missing: readiness.missing,
    present: readiness.present,
    blockedOn: readiness.blockedOn,
    nextStep: readiness.nextStep,
  }
}
