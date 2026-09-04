/**
 * Chrome's built-in on-device model (Gemini Nano) via the Prompt API.
 *
 * The point of this provider is the thing WebLLM (localLLM.js) cannot offer:
 * zero download this app pays for. The weights ship with — or are fetched
 * once by — Chrome itself, entirely outside this app's control, so a fresh
 * install with no key and no account can get a real answer with no 350MB+
 * pull. That is the whole reason it exists as a SEPARATE provider from
 * `local` rather than a mode of it: 'local' means "on-device, ~350MB-1.7GB,
 * download is a decision the user makes"; 'chromeai' means "on-device,
 * zero bytes this app fetches, works the moment Chrome already has it."
 *
 * Two API shapes have existed while this spec stabilised — the current
 * `self.LanguageModel` global, and the earlier `self.ai.languageModel`
 * namespace some Chrome versions still only expose — so every entry point
 * probes both and never assumes either is final. A browser without either
 * (anything non-Chromium, or Chromium without Google's on-device-model
 * component — which is what a stock Electron build ships, so this is
 * expected to read "unsupported" in the desktop app) gets an honest reason,
 * the same discipline webGpuDetails() uses for WebLLM: a blind "unavailable"
 * tells the user nothing they can act on.
 *
 * Same tool-calling stance as streamLocal: nothing here special-cases tools.
 * The agent layer already forces `initialToolMode: 'prompted'` for any
 * `isLocal` provider (see api.js) and drives tool calls through the shared
 * text-JSON protocol in promptedTools.js — a tiny on-device model calling
 * tools unreliably through that path is the same known trade-off WebLLM
 * already makes, not something this file needs to re-decide.
 */

function api() {
  if (typeof self === 'undefined') return null
  if (self.LanguageModel) return { kind: 'current', ns: self.LanguageModel }
  if (self.ai?.languageModel) return { kind: 'legacy', ns: self.ai.languageModel }
  return null
}

/** Cheap sync check for UI badges — no promise, no download trigger. */
export function chromeAIPresent() {
  return !!api()
}

/**
 * Detailed, honest availability check — mirrors webGpuDetails()'s shape.
 * `state` is one of: 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' | 'error'.
 * `available` is true for 'available' AND 'downloadable'/'downloading' (a
 * caller that means to actually use the model can proceed and will see the
 * one-time download itself); callers that must never trigger a surprise
 * download (the zero-key auto-boot in App.jsx) check `state === 'available'`
 * specifically — "a download is a decision, not a fallback" applies here
 * exactly as it does for the local ComfyUI/WebLLM paths elsewhere in this app.
 */
export async function getChromeAIAvailability() {
  const a = api()
  if (!a) {
    return {
      available: false,
      state: 'unsupported',
      reason: 'This browser has no built-in AI (Prompt API). Use desktop Chrome or Edge 138+, with "Prompt API for Gemini Nano" enabled at chrome://flags if it is still gated there.',
    }
  }
  try {
    let raw
    if (a.kind === 'current') {
      raw = await a.ns.availability()
    } else {
      const caps = await a.ns.capabilities()
      raw = caps?.available === 'readily' ? 'available'
        : caps?.available === 'after-download' ? 'downloadable'
        : 'unavailable'
    }
    if (raw === 'available' || raw === 'readily') {
      return { available: true, state: 'available' }
    }
    if (raw === 'downloadable' || raw === 'after-download') {
      return {
        available: true, state: 'downloadable',
        reason: "The model isn't on this device yet — it downloads once, on first use. Chrome manages and caches it; Yogatik never re-fetches it.",
      }
    }
    if (raw === 'downloading') {
      return { available: true, state: 'downloading', reason: 'Chrome is already downloading the on-device model.' }
    }
    return {
      available: false, state: 'unavailable',
      reason: "Chrome reports its on-device model is unavailable here — usually a hardware/storage requirement not met, or the component is disabled by policy.",
    }
  } catch (e) {
    return { available: false, state: 'error', reason: e?.message || 'Could not query Chrome AI availability.' }
  }
}

/**
 * Trigger (and wait out) Chrome's one-time on-device model download outside
 * of any chat turn — the download/progress UI needs this because
 * streamChromeAI only ever creates a session as a side effect of actually
 * answering a message, which is the wrong moment to first tell a user "this
 * is about to download something": by the time a status line could appear
 * the fetch has already started. A dedicated trigger lets a settings panel
 * ask for explicit consent FIRST (size/source/one-time, same rule
 * LocalModelPanel's WebLLM download follows), then call this.
 *
 * The session created here is destroyed immediately after — it exists only
 * to make Chrome fetch the weights and report progress on them; the next
 * real chat turn creates its OWN fresh session per streamChromeAI's own
 * per-call design (this app's conversation state, not the Prompt API's, is
 * the source of truth for what a session should remember).
 */
export async function triggerChromeAIDownload(onProgress) {
  const a = api()
  if (!a) throw new Error('This browser has no built-in AI (Prompt API).')
  const createOpts = {
    monitor: (m) => {
      m.addEventListener?.('downloadprogress', (e) => {
        const frac = typeof e?.loaded === 'number' ? Math.max(0, Math.min(1, e.loaded)) : 0
        onProgress?.(frac)
      })
    },
  }
  let session = null
  try {
    session = await a.ns.create(createOpts)
  } finally {
    try { session?.destroy?.() } catch { /* best effort */ }
  }
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(p => p && (p.type === 'text' || typeof p.text === 'string'))
      .map(p => p.text || '')
      .join('\n')
  }
  return content ? String(content) : ''
}

/**
 * Streaming completion with the same call shape streamLocal exports, so
 * llm.js can route to either with one line.
 *
 * A Prompt API session IS its own conversation memory, but this app's own
 * conversation state (edits, branches, regenerate, sliding-window trimming)
 * can diverge from whatever a long-lived cached session remembers — so a
 * NEW session is created every call and replayed against the real messages
 * array up to the last turn, then only the final turn is streamed. Slower
 * than reusing one session across a whole chat; a silently wrong answer
 * after an edit is worse than a few extra non-streamed replay calls against
 * an already-bounded (sliding-window) history.
 */
export async function streamChromeAI({ model, messages, temperature = 0.7, tools = null, signal, onToken, onToolCall, onDone, onError, onStatus }) {
  let session = null
  const abortHandler = () => { try { session?.destroy?.() } catch { /* best effort */ } }
  try {
    if (signal?.aborted) { onDone?.(); return }

    const a = api()
    const avail = await getChromeAIAvailability()
    if (!avail.available || !a) {
      onError?.(new Error(avail.reason || 'Chrome built-in AI is not available on this device.'))
      return
    }

    const systemPrompt = (messages || [])
      .filter(m => m.role === 'system')
      .map(m => textOf(m.content))
      .filter(Boolean)
      .join('\n\n')
    const turns = (messages || []).filter(m => m.role !== 'system' && textOf(m.content))
    if (!turns.length || turns[turns.length - 1].role !== 'user') {
      onError?.(new Error('Chrome built-in AI expects the conversation to end on a user turn.'))
      return
    }

    if (signal?.aborted) { onDone?.(); return }

    if (avail.state === 'downloadable') {
      onStatus?.("Downloading Chrome's on-device model (one-time, managed by Chrome, not by Yogatik)…")
    }

    const createOpts = {}
    if (systemPrompt) createOpts.initialPrompts = [{ role: 'system', content: systemPrompt }]
    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      // The Prompt API's scale is not guaranteed to match OpenAI's 0-2; clamp
      // to a safe, documented range rather than pass a value that could 400.
      createOpts.temperature = Math.min(2, Math.max(0, temperature))
    }
    createOpts.monitor = (m) => {
      m.addEventListener?.('downloadprogress', (e) => {
        const pct = Math.round((e?.loaded || 0) * 100)
        onStatus?.(`Downloading Chrome's on-device model (${pct}%)…`)
      })
    }

    try {
      session = await a.ns.create(createOpts)
    } catch (e) {
      onError?.(new Error(`Could not start Chrome's on-device model: ${e?.message || e}`))
      return
    }

    signal?.addEventListener('abort', abortHandler, { once: true })

    // Replay every turn but the last as plain (non-streamed) prompts so the
    // fresh session's memory matches this app's real history, then stream
    // only the current, final turn.
    //
    // Each of these is a full, non-streamed on-device generation — for a
    // growing tool-calling conversation (a few rounds in, replaying the tool
    // results too) this can be the slowest part of the call and it produces
    // NOTHING visible until it finishes, which is exactly what made a real
    // reply look permanently stuck on "Thinking…": onToken/onStatus only
    // fired once generation of the FINAL turn began. A per-turn heartbeat
    // here is cheap and turns a silent multi-second stall into a status line
    // that keeps moving.
    const replayCount = turns.length - 1
    for (let i = 0; i < replayCount; i++) {
      if (signal?.aborted) break
      const t = turns[i]
      const text = textOf(t.content)
      if (!text) continue
      onStatus?.(`Replaying conversation on-device (${i + 1}/${replayCount})…`)
      // The Prompt API has no "assistant turn" injection primitive on a
      // plain session — tag it so the replayed transcript still reads as a
      // conversation rather than a wall of unattributed user turns.
      const line = t.role === 'assistant' ? `[assistant]: ${text}` : text
      await session.prompt(line).catch(() => {})
    }
    if (signal?.aborted) { onDone?.(); return }

    onStatus?.('Generating on-device…')
    const lastText = textOf(turns[turns.length - 1].content)
    const stream = session.promptStreaming(lastText, signal ? { signal } : undefined)
    let prev = ''
    for await (const chunk of stream) {
      if (signal?.aborted) break
      // Some implementations yield the FULL text so far each tick, others
      // yield incremental deltas — normalise to deltas so onToken never
      // double-prints, the same class of bug the SSE reasoning-tag handling
      // in llm.js exists to avoid for hosted providers.
      const piece = typeof chunk === 'string' ? chunk : (chunk?.text ?? '')
      const delta = piece.startsWith(prev) ? piece.slice(prev.length) : piece
      prev = piece.startsWith(prev) ? piece : prev + delta
      if (delta) onToken?.(delta)
    }

    onDone?.()
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) onDone?.()
    else onError?.(err)
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    try { session?.destroy?.() } catch { /* best effort */ }
  }
}
