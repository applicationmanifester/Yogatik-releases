/**
 * Desktop turn notifications.
 *
 * electron/notify.cjs has supported rich notifications (action buttons, inline
 * reply) since v3.13, and preload exposes both __YOGATIK_NOTIFY__ and
 * __YOGATIK_NOTIFY_ACTIONS__ — but nothing in the renderer ever called or
 * listened to either, so the whole path was dead. A desktop user who asked a
 * long question and switched windows got no signal at all when it finished.
 *
 * The policy lives here, pure and testable; App.jsx only does the wiring.
 */

const MAX_BODY = 220

/**
 * Notify only when the user cannot already see the answer.
 *
 * Deliberately conservative: a notification for a reply that is on screen is
 * pure annoyance, and this fires on every turn, so a false positive is a bug
 * the user meets constantly.
 */
export function shouldNotifyTurn({ isDesktop, hidden, focused, aborted, error, hasText }) {
  if (!isDesktop) return false      // web has its own tab-title affordances
  if (aborted || error) return false // they stopped it, or already saw the error
  if (!hasText) return false        // nothing worth interrupting for
  // `hidden` covers minimised/other-desktop; `focused === false` covers the
  // window being visible but behind something. Either means they looked away.
  return hidden === true || focused === false
}

/**
 * One-line preview. Strips markdown noise that reads as literal junk in an OS
 * notification, and any <think> block, which is reasoning rather than answer.
 */
export function notificationBody(text) {
  const s = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [image] ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length <= MAX_BODY) return s
  // Cut on a word boundary so the preview does not end mid-token.
  const cut = s.slice(0, MAX_BODY)
  const sp = cut.lastIndexOf(' ')
  return (sp > MAX_BODY * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}

/** Title carries the conversation, so several chats stay distinguishable. */
export function notificationTitle(conversationTitle) {
  const t = String(conversationTitle || '').trim()
  return t && t.toLowerCase() !== 'new chat' ? `Yogatik — ${t}` : 'Yogatik'
}

/**
 * An inline reply is only useful if it can be sent. Trim it and reject empties,
 * so a stray Enter on the notification does not fire a blank turn.
 */
export function cleanReply(raw) {
  const s = String(raw || '').trim()
  return s.length ? s : null
}
