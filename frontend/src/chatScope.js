/**
 * Per-chat settings with inheritance.
 *
 * The app already resolves WORKING FOLDERS as chat → project → default
 * (rootsCore.cjs), and that is the right shape for every other per-chat choice
 * too: a chat that has never been given its own agent should follow the global
 * default and pick up changes to it, while a chat that HAS been given one must
 * keep it even when the default moves.
 *
 * Before this, `active_agent`, `active_skill`, `active_style` and
 * `disabled_tools` were single global keys. Switching to the Coder agent in one
 * conversation silently switched it in every other conversation — including one
 * that was mid-turn, because two chats genuinely stream at once.
 *
 * Written once and shared, deliberately: youtube.js kept its own copy of the
 * relay list and missed every fix that landed on the shared one.
 */
import { getSetting, setSetting } from './db'

/**
 * "This chat is explicitly set to nothing" needs a real value, not null.
 *
 * db.getSetting returns the FALLBACK for a row holding null — deliberately, so
 * that getSetting(k, '') never puts null into a controlled input. That makes
 * null and "no row at all" indistinguishable, so null cannot mean
 * "explicitly none" here. Turning off the skill in one chat would otherwise
 * read as "inherit" and hand that chat the global skill right back on the next
 * turn, which looks exactly like the toggle not working.
 */
export const NONE = '__none__'

/** The db key holding a chat's own binding, or null when there is no chat. */
export function scopedKey(base, conversationId) {
  const id = conversationId == null ? '' : String(conversationId)
  return id ? `${base}::chat::${id}` : null
}

/** A chat's value, falling back to the global default, then to `fallback`. */
export async function getScoped(base, conversationId, fallback = null) {
  const key = scopedKey(base, conversationId)
  if (key) {
    try {
      const own = await getSetting(key, null)
      if (own === NONE) return null          // explicitly none — do NOT inherit
      if (own != null) return own
    } catch { /* fall through to the global default */ }
  }
  try {
    const g = await getSetting(base, null)
    if (g === NONE) return null
    return g == null ? fallback : g
  } catch { return fallback }
}

/** Bind a value to ONE chat. With no conversationId this sets the global default. */
export async function setScoped(base, conversationId, value) {
  const key = scopedKey(base, conversationId) || base
  await setSetting(key, value == null ? NONE : value)
  return value
}

/** Drop a chat's binding so it inherits the global default again. */
export async function clearScoped(base, conversationId) {
  const key = scopedKey(base, conversationId)
  if (!key) return
  // null reads back as "no row", which is what restores inheritance. Writing
  // NONE would pin the chat to "explicitly nothing" — a different answer.
  try { await setSetting(key, null) } catch { /* already gone */ }
}

/** Does this chat have its own binding, rather than following the default? */
export async function hasOwnBinding(base, conversationId) {
  const key = scopedKey(base, conversationId)
  if (!key) return false
  try { return (await getSetting(key, null)) != null } catch { return false }
}

/**
 * Copy every per-chat binding from one conversation to another.
 *
 * Editing an earlier turn BRANCHES into a new conversation
 * (api.branchConversation). Without this the branch reverts to the global
 * agent, skill and style — the user would be talking to a different assistant
 * than the one whose answer they were editing, with nothing on screen saying so.
 */
export async function copyChatScope(fromId, toId, bases = SCOPED_KEYS) {
  if (!fromId || !toId) return
  for (const base of bases) {
    const from = scopedKey(base, fromId)
    const to = scopedKey(base, toId)
    if (!from || !to) continue
    try {
      const v = await getSetting(from, null)
      if (v != null) await setSetting(to, v)
    } catch { /* a binding that will not copy is not worth failing a branch over */ }
  }
}

/**
 * Move a draft chat's bindings onto its real database id.
 *
 * A chat has a clientId from the moment it appears and gains a database id only
 * when its first message is persisted — and `runAgent` resolves its scope from
 * `conversationId: convId || targetClientId`, so the identity CHANGES at exactly
 * that moment. Without this the agent starts reading a key nobody ever wrote,
 * and the per-chat agent/skill silently reverts to the global default on the
 * second turn.
 *
 * This is the same migration `rebindChatRoots` already does for folders, for the
 * same reason, and it is called from the same place.
 */
export async function rebindChatScope(oldId, newId, bases = SCOPED_KEYS) {
  if (!oldId || !newId || String(oldId) === String(newId)) return
  for (const base of bases) {
    const from = scopedKey(base, oldId)
    const to = scopedKey(base, newId)
    try {
      const v = await getSetting(from, null)
      if (v == null) continue
      await setSetting(to, v)
      await setSetting(from, null)   // reads back as "no row" — see clearScoped
    } catch { /* a binding that will not move is not worth failing a save over */ }
  }
}

/** The keys that are per-chat. Named once so nothing drifts out of the set. */
export const SCOPED_KEYS = ['active_agent', 'active_skill', 'active_style', 'disabled_tools']
