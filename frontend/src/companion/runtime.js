/**
 * The companion's turn runner.
 *
 * One place that knows how to say something to the model AS the companion:
 * its own conversation, its own streaming channel, its own system prompt, its
 * own history. FloatingCompanion used to hand its text to the MAIN chat's
 * send() — so an ambient observation about the user's screen was appended to
 * whatever thread happened to be open, and the companion's "memory" was really
 * that unrelated conversation's context.
 *
 * Kept out of the component because two surfaces mount that component (the
 * in-page panel and the popped-out PiP window) and they must share one chat,
 * one history and one abort channel rather than each keeping their own.
 */

import { getCompanionConversationId, companionSystemPrompt, isSilence, SILENCE } from './companionChat'

export const CHANNEL = 'companion'

/** Turns kept in the prompt. The companion is glanceable, not a research log. */
const WINDOW = 12

let history = []          // [{role, content}]
let listeners = new Set()
let busy = false

function emit(event) { for (const fn of listeners) { try { fn(event) } catch { /* a bad listener must not sink the turn */ } } }

export function subscribeCompanion(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getCompanionHistory() { return history }
export function isCompanionBusy() { return busy }

/** Wipe the in-memory window (the stored conversation is untouched). */
export function _resetCompanionRuntime() {
  history = []
  listeners = new Set()
  busy = false
  hydrated = false
  hydrating = null
}

let hydrated = false
let hydrating = null

/**
 * Load the tail of the stored companion conversation into the window.
 *
 * Turns were already being SAVED — they just were not read back, so every
 * reload showed an empty companion that had, in the database, been talking to
 * this user for weeks. The model got no history either: `history` started empty,
 * so the first turn after a restart had no idea what had just been discussed.
 *
 * Idempotent and shared: the panel and the floating window mount at the same
 * moment and must not both hydrate.
 */
export async function hydrateCompanion() {
  if (hydrated) return history
  if (hydrating) return hydrating
  hydrating = (async () => {
    try {
      const api = await import('../api')
      const id = await getCompanionConversationId().catch(() => null)
      if (id) {
        const conv = await api.getConversation(id).catch(() => null)
        // A conversation ROW does not carry `messages`; getConversation joins
        // them in. Reading conv.messages off the row is the drift that emptied
        // the vault search, and it would silently produce an empty companion
        // here for exactly the same reason.
        const msgs = Array.isArray(conv?.messages) ? conv.messages : []
        const usable = msgs
          .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
          .map(m => ({ role: m.role, content: m.content }))
        if (usable.length) {
          history = usable.slice(-WINDOW)
          emit({ type: 'hydrated', messages: history })
        }
      }
    } catch { /* a companion with no memory is still a working companion */ }
    hydrated = true
    return history
  })()
  try { return await hydrating } finally { hydrating = null }
}

/**
 * Ask the companion something.
 *
 * @param {object} opts
 * @param {string} opts.text        what to say to it
 * @param {string} [opts.image]     a data URL to attach (a screen frame)
 * @param {boolean} [opts.ambient]  an unprompted observation rather than a
 *                                  question the user typed. Ambient turns are
 *                                  allowed to answer with silence, are never
 *                                  spoken aloud unless they clear the speak
 *                                  gate, and never overwrite the composer.
 * @param {boolean} [opts.watching] the screen is currently shared
 * @param {string} [opts.surface]   'panel' | 'pip'
 * @param {boolean} [opts.tools]    let it use tools (off for ambient looks —
 *                                  a background glance must not start running
 *                                  shell commands or web searches)
 */
export async function askCompanion({
  text,
  image = null,
  ambient = false,
  watching = false,
  surface = 'panel',
  tools = false,
  canAct = false,
  persona = 'pair',
  provider,
  model,
} = {}) {
  if (!text || busy) return { skipped: true }
  busy = true

  // Before the first turn, load what was said last session. Without this the
  // model's "memory" restarted at every reload while the transcript sat in the
  // database being written to and never read.
  if (!hydrated) await hydrateCompanion().catch(() => {})

  const api = await import('../api')
  const conversationId = await getCompanionConversationId({ provider, model }).catch(() => null)

  // What it already knows about this person. Skipped for ambient looks: a
  // background glance at a screen is not the moment to spend a third of a small
  // model's context on recall, and the recall would be scored against a prompt
  // ("the screen changed") that says nothing about the user.
  let memory = ''
  if (!ambient) {
    try {
      const m = await import('../memory4')
      memory = await m.memoryBlockFromStores(text)
    } catch { /* memory is an enhancement, never a prerequisite */ }
  }

  const userTurn = { role: 'user', content: text, ambient }
  history = [...history, userTurn].slice(-WINDOW)
  emit({ type: 'user', message: userTurn })

  let answer = ''
  let failed = null

  await new Promise((resolve) => {
    api.streamMessage(
      {
        message: text,
        messages: history.map(({ role, content }) => ({ role, content })),
        image,
        // An ambient look is a glance, not an errand. Tools here would mean a
        // background observation could search the web or touch the filesystem
        // without the user having asked for anything.
        tools,
        use_tools: tools,
        use_web_search: false,
        system_prompt: companionSystemPrompt({ watching, surface, memory, canAct: canAct && tools, persona }),
        provider,
        model: model || undefined,
        channel: CHANNEL,
      },
      (token) => { answer += token; emit({ type: 'token', text: answer }) },
      () => {},
      () => resolve(),
      (err) => { failed = err; resolve() },
      (status) => emit({ type: 'status', text: status }),
      () => {},
      // Tool activity is surfaced, not swallowed. The floating window already
      // had a steps HUD; it was fed by a separate activity subscription that
      // the panel never had, so the same companion showed its work on one
      // surface and appeared to freeze on the other.
      (calls) => emit({ type: 'tools', calls }),
      (result) => emit({ type: 'tool-result', result }),
    ).catch((e) => { failed = e?.message || String(e); resolve() })
  })

  busy = false

  if (failed) {
    emit({ type: 'error', error: failed })
    return { error: failed }
  }

  const silent = ambient && isSilence(answer)
  if (silent) {
    // Do not keep the sentinel in the window — the next turn would learn that
    // answering "NOTHING-TO-ADD" is the house style and go quiet for good.
    history = history.filter((m) => m !== userTurn)
    emit({ type: 'silent' })
    return { silent: true }
  }

  const reply = { role: 'assistant', content: answer }
  history = [...history, reply].slice(-WINDOW)
  emit({ type: 'reply', message: reply })

  if (conversationId) {
    // Persisted so the companion's thread survives a reload and can be opened
    // in the main window like any other chat.
    api.saveMessage(conversationId, { role: 'user', content: text }).catch(() => {})
    api.saveMessage(conversationId, reply).catch(() => {})
  }

  return { answer }
}

export function stopCompanion() {
  return import('../api').then((api) => api.stopGeneration(CHANNEL)).catch(() => {})
}

export { SILENCE }
