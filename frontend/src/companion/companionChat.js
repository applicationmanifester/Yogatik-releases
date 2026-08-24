/**
 * The companion's own chat.
 *
 * It used to speak into whatever conversation happened to be open, which is
 * wrong in both directions: an ambient observation about the user's screen
 * landed in the middle of an unrelated thread and polluted its context, and
 * the companion in turn "remembered" a conversation it was never part of. It
 * also meant switching chats silently changed who the companion was talking
 * to.
 *
 * So it gets one durable conversation of its own, pinned in settings, reused
 * across sessions and across both surfaces (in-page panel and the popped-out
 * Picture-in-Picture window share an origin, so they share this row too).
 *
 * The db/api layer is imported lazily on purpose: the pure watch/gate modules
 * around it are tested with no Dexie, and a static import here would drag a
 * database into those test files.
 */

const SETTING_KEY = 'companion_conversation_id'
const TITLE = 'Companion'

let cached = null
let creating = null

/** The system prompt that makes it a companion rather than a second chat. */
export function companionSystemPrompt({ watching = false, surface = 'panel' } = {}) {
  return [
    'You are the Yogatik Companion: a small always-available assistant docked beside whatever the user is doing.',
    'Answer in one or two sentences unless asked for more. You are read at a glance, in a narrow window.',
    watching
      ? 'You are watching a screen the user has shared. Each observation arrives as an image or an on-device description of one. Comment ONLY when something genuinely changed and you have something useful to add — an error you can explain, a next step, a risk. Silence is a valid and frequent answer: reply with exactly NOTHING-TO-ADD when there is nothing worth interrupting for.'
      : 'You are not currently watching the screen, so never claim to see anything.',
    'Never describe or identify people in a frame, and never guess at identity from a face.',
    surface === 'pip'
      ? 'You are in a floating always-on-top window, so the user can see you while working in another app.'
      : '',
  ].filter(Boolean).join('\n')
}

/** The sentinel the prompt above asks for when there is nothing worth saying. */
export const SILENCE = 'NOTHING-TO-ADD'

/** True when a reply is the model choosing to stay quiet. */
export function isSilence(text) {
  const t = String(text || '').trim()
  if (!t) return true
  // Models wrap the sentinel in punctuation and politeness surprisingly often.
  return /^[\s"'`*_.]*nothing[-\s]?to[-\s]?add[\s"'`*_.!]*$/i.test(t)
}

/**
 * The conversation id the companion writes to, created on first use.
 * Concurrent callers share one creation — the panel and the PiP window mount
 * at the same moment and would otherwise make two.
 */
export async function getCompanionConversationId({ provider, model } = {}) {
  if (cached) return cached
  if (creating) return creating

  creating = (async () => {
    const db = await import('../db')
    const api = await import('../api')
    const stored = await db.getSetting(SETTING_KEY, null)
    if (stored) {
      // The row can be gone — the user deleted it from the sidebar like any
      // other chat. Falling through to create a new one is the right recovery;
      // refusing to work because a setting points at nothing is not.
      const convs = await api.getConversations().catch(() => [])
      if (convs.some(c => c.id === stored)) {
        cached = stored
        return cached
      }
    }
    const id = await api.createConversation(TITLE, null, provider, model)
    await db.setSetting(SETTING_KEY, id)
    cached = id
    return id
  })()

  try { return await creating } finally { creating = null }
}

/** Forget the pinned chat and start a fresh one on the next turn. */
export async function resetCompanionConversation() {
  const db = await import('../db')
  cached = null
  await db.setSetting(SETTING_KEY, null)
}

/** Test seam. */
export function _resetCompanionChat() { cached = null; creating = null }
