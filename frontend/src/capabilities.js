/**
 * What can this app actually do right now, and what does it send off the device?
 *
 * Every local engine here already existed — Whisper, WebLLM, Ollama, Kokoro,
 * SmolVLM, Tesseract, CLIP/DETR, SlimSAM, BM25 retrieval. What did not exist was
 * anything that could ANSWER the question. Each caller picked its own engine
 * with its own ad-hoc fallback, so "does this work offline" had no answer, and
 * the honest one varies by capability.
 *
 * Three rules, in order, because each fixes a real failure:
 *
 *  1. NEVER SILENTLY REACH THE NETWORK. If the user asked for local-only and no
 *     local engine can serve, the answer is a refusal that names the gap — not a
 *     quiet cloud call. A privacy promise that degrades without saying so is
 *     worse than no promise.
 *  2. A DOWNLOAD IS A DECISION, NOT A FALLBACK. Whisper is ~40MB, SmolVLM ~230MB,
 *     WebLLM 350MB+. An engine whose weights are absent reports `needsDownload`
 *     and is NOT auto-selected; the app already learned this when a blind-model
 *     fallback pulled 230MB with nothing on screen saying so.
 *  3. SAY WHERE THE WORK HAPPENED. The result carries the engine that served it,
 *     so the UI can show "on-device" honestly rather than by assumption.
 *
 * Pure: no DOM, no imports of the engines themselves. Readiness is INJECTED by
 * the caller, which keeps this testable without downloading a gigabyte of models
 * and keeps the heavy modules lazy — the same split as rootsCore/roots and
 * maskOps/sam.
 */

/** How the user wants engine selection resolved. */
export const MODE = {
  /** Best available; remote allowed. The default. */
  AUTO: 'auto',
  /** Prefer on-device when it is ready; fall back to remote and SAY SO. */
  LOCAL_FIRST: 'local_first',
  /** On-device only. Refuse rather than reach the network. */
  LOCAL_ONLY: 'local_only',
}

/**
 * `local`  — runs on this device, sends nothing.
 * `remote` — sends data to a third party.
 * `hybrid` — LOOKS local because it is a browser API, but is not.
 *
 * The hybrid class exists for exactly one reason, and it is the most useful
 * thing in this file: Chrome's Web Speech recognition STREAMS MICROPHONE AUDIO
 * TO GOOGLE. It is the default input for Live's cascade engine, it needs no key,
 * it has no download, and every one of those properties makes it read as
 * on-device. Filing it as local would make the app's own privacy claim false.
 */
export const KIND = { LOCAL: 'local', REMOTE: 'remote', HYBRID: 'hybrid' }

/**
 * The engine table. Order within a capability is PREFERENCE ORDER for
 * local_first; `auto` still prefers a ready local engine over a remote one when
 * the local engine is genuinely comparable, which is noted per entry.
 */
export const ENGINES = {
  chat: [
    { id: 'ollama', kind: KIND.LOCAL, label: 'Ollama', note: 'Local models on this machine. Desktop only.', desktopOnly: true },
    { id: 'webllm', kind: KIND.LOCAL, label: 'Browser model (WebLLM)', note: 'Runs in the browser via WebGPU.', download: '350MB+' },
    { id: 'cloud', kind: KIND.REMOTE, label: 'Cloud provider', note: 'Your configured provider. Needs a key and a network.' },
  ],
  stt: [
    { id: 'whisper', kind: KIND.LOCAL, label: 'Whisper (on-device)', note: 'Nothing leaves the device.', download: '~40MB' },
    // Deliberately not LOCAL. See the KIND comment above.
    { id: 'webspeech', kind: KIND.HYBRID, label: 'Browser speech recognition', note: 'Fast, but Chrome sends your microphone audio to Google.' },
  ],
  tts: [
    { id: 'kokoro', kind: KIND.LOCAL, label: 'Kokoro (on-device)', note: 'Natural voice, synthesised here.', download: '~90MB' },
    // speechSynthesis is genuinely local on every desktop OS, and on most
    // mobile ones. It is the honest offline fallback for voice output.
    { id: 'system', kind: KIND.LOCAL, label: 'System voice', note: 'Built into the operating system. Instant, more robotic.' },
  ],
  vision: [
    { id: 'ocr', kind: KIND.LOCAL, label: 'OCR (Tesseract)', note: 'Reads text from an image, on-device.', download: '~15MB' },
    { id: 'localvlm', kind: KIND.LOCAL, label: 'SmolVLM (on-device)', note: 'Describes an image, on-device.', download: '~230MB' },
    { id: 'model', kind: KIND.REMOTE, label: 'Vision model', note: 'Sends the image to your provider. Much better quality.' },
  ],
  // Searching YOUR OWN documents and searching the live web are different
  // capabilities, and merging them under one name is a lie in both directions:
  // it would report "search works offline" to someone asking about today's
  // news, and "search is unavailable" to someone asking about a PDF sitting in
  // their own vault. Splitting them is the honest model.
  vault_search: [
    { id: 'vault', kind: KIND.LOCAL, label: 'Local vault (BM25)', note: 'Your uploaded documents and chat history. Works offline.' },
  ],
  web_search: [
    // No local engine can substitute. Saying so is the point: a "local search"
    // that quietly returned stale vault hits for a question about today would
    // be confidently wrong, which is the failure this codebase keeps recording.
    { id: 'web', kind: KIND.REMOTE, label: 'Web search', note: 'The live web. There is no on-device equivalent.' },
  ],
  embeddings: [
    { id: 'minilm', kind: KIND.LOCAL, label: 'MiniLM (on-device)', note: 'Semantic re-ranking, on-device.', download: '~23MB' },
    { id: 'bm25', kind: KIND.LOCAL, label: 'BM25 (keyword)', note: 'No download. Beats vectors on small keyword-heavy corpora.' },
  ],
}

/** Capabilities that CANNOT be served locally by anything, at any quality. */
export const NETWORK_ONLY = ['web_search']

const isLocal = (e) => e.kind === KIND.LOCAL

/**
 * Choose the engine for a capability.
 *
 * @param {string} capability            key of ENGINES
 * @param {object} opts
 * @param {string} opts.mode             one of MODE
 * @param {(id:string)=>boolean} opts.ready       is this engine usable NOW (weights present, daemon up, key set)
 * @param {(id:string)=>boolean} [opts.installed] are the weights present? defaults to `ready`
 * @param {boolean} [opts.online]        default true
 * @param {boolean} [opts.desktop]       default false
 * @returns {{engine, id, kind, local, note, degraded, refused, reason, alternatives}}
 */
export function resolveCapability(capability, {
  mode = MODE.AUTO, ready = () => false, installed = null, online = true, desktop = false,
} = {}) {
  const table = ENGINES[capability]
  if (!table) return refuse(capability, `Unknown capability "${capability}".`, [])

  const has = installed || ready
  const usable = (e) => {
    if (e.desktopOnly && !desktop) return false
    if (e.kind !== KIND.LOCAL && !online) return false
    return ready(e.id)
  }

  const locals = table.filter(isLocal)
  const readyLocal = locals.find(usable)

  if (mode === MODE.LOCAL_ONLY) {
    if (readyLocal) return pick(readyLocal, { local: true })
    // Name the gap precisely: "not installed" and "cannot be done locally at
    // all" are different problems with different answers, and telling the user
    // the wrong one sends them to install something that will not help.
    const installable = locals.filter(e => (!e.desktopOnly || desktop) && !has(e.id))
    if (NETWORK_ONLY.includes(capability)) {
      return refuse(capability,
        `${capability} has no on-device equivalent — it needs the network by nature. ` +
        'Switch off local-only mode for this, or skip it.', table.filter(e => !isLocal(e)))
    }
    if (installable.length) {
      return refuse(capability,
        `Local-only mode is on and no on-device engine for ${capability} is installed yet. ` +
        `Install ${installable.map(e => `${e.label}${e.download ? ` (${e.download})` : ''}`).join(' or ')}.`,
        installable)
    }
    return refuse(capability, `Local-only mode is on and no on-device engine for ${capability} is available here.`, [])
  }

  if (mode === MODE.LOCAL_FIRST && readyLocal) return pick(readyLocal, { local: true })

  // AUTO, or local_first with nothing local ready.
  const anyReady = table.find(usable)
  if (!anyReady) {
    return refuse(capability,
      online
        ? `No engine for ${capability} is available. Add a provider key, or install an on-device engine.`
        : `You are offline and no on-device engine for ${capability} is installed.`,
      table.filter(e => isLocal(e) && !has(e.id)))
  }

  // A local_first request that had to reach the network is DEGRADED, not a
  // plain success. The caller has promised the user something it did not
  // deliver, and it has to be able to say so.
  const degraded = mode === MODE.LOCAL_FIRST && !isLocal(anyReady)
  return pick(anyReady, {
    local: isLocal(anyReady),
    degraded,
    reason: degraded
      ? `No on-device engine for ${capability} is ready, so this used ${anyReady.label}.`
      : null,
  })
}

function pick(engine, extra = {}) {
  return {
    engine, id: engine.id, kind: engine.kind,
    local: false, degraded: false, refused: false, reason: null,
    note: engine.note, alternatives: [], ...extra,
  }
}

function refuse(capability, reason, alternatives) {
  return {
    engine: null, id: null, kind: null, local: false, degraded: false,
    refused: true, reason, note: null, alternatives, capability,
  }
}

/**
 * What works right now with no network at all.
 * The thing to put in front of a user who asks "does this work offline?".
 */
export function offlineReport({ ready = () => false, desktop = false } = {}) {
  const out = {}
  for (const capability of Object.keys(ENGINES)) {
    const r = resolveCapability(capability, { mode: MODE.LOCAL_ONLY, ready, desktop, online: false })
    out[capability] = {
      works: !r.refused,
      engine: r.engine?.label || null,
      reason: r.reason,
      // Something the user could install to close this gap, if anything can.
      installable: (r.alternatives || []).filter(isLocal).map(e => ({
        id: e.id, label: e.label, download: e.download || null,
      })),
    }
  }
  const core = ['chat', 'stt', 'tts'].every(k => out[k].works)
  return {
    capabilities: out,
    /** Can you hold a spoken conversation with no network? */
    fullyOffline: core,
    summary: core
      ? 'Chat, speech in and speech out all run on this device. This works with no network.'
      : 'Some capabilities still need the network. See the per-capability detail.',
  }
}

/** Engines that need weights and do not have them yet — a shopping list, in size order. */
export function missingDownloads({ ready = () => false, desktop = false } = {}) {
  const seen = new Set()
  const out = []
  for (const table of Object.values(ENGINES)) {
    for (const e of table) {
      if (!isLocal(e) || !e.download || seen.has(e.id)) continue
      if (e.desktopOnly && !desktop) continue
      if (ready(e.id)) continue
      seen.add(e.id)
      out.push({ id: e.id, label: e.label, download: e.download, note: e.note })
    }
  }
  return out
}

/**
 * The system-prompt fragment. The model must not promise what the current mode
 * forbids: telling a local-only user it will "search the web for that" and then
 * failing is the platformBlock() failure again, one layer up.
 */
export function capabilityBlock(mode, report) {
  if (mode === MODE.LOCAL_ONLY) {
    const off = Object.entries(report?.capabilities || {})
      .filter(([, v]) => !v.works).map(([k]) => k)
    return '\n\nLOCAL-ONLY MODE: everything runs on this device and nothing is sent to a ' +
      'third party. ' + (off.length
        ? `You do NOT have: ${off.join(', ')}. Do not offer or claim to use them — say plainly that they are off in local-only mode.`
        : 'All core capabilities are available on-device.')
  }
  if (mode === MODE.LOCAL_FIRST) {
    return '\n\nLOCAL-FIRST MODE: prefer on-device processing. If a step needs the ' +
      'network, do it, but tell the user which step left the device.'
  }
  return ''
}
