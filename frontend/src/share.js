/**
 * Sharing — replaces the "Install App" call-to-action once the app IS installed.
 *
 * Prompting someone to install something they are already running is noise; the
 * useful action at that point is passing it on.
 */

export const SHARE_URL = 'https://yogatik.web.app'

/**
 * True when we are running as an installed app rather than a browser tab:
 * the Electron or Tauri desktop shell, or an installed PWA (standalone display
 * mode, or navigator.standalone on iOS).
 */
export function isInstalledApp() {
  if (typeof window === 'undefined') return false
  if (window.__YOGATIK_ELECTRON__ || window.__TAURI__ || window.__TAURI_INTERNALS__) return true
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true
    if (window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches) return true
  } catch { /* matchMedia unavailable */ }
  return typeof navigator !== 'undefined' && navigator.standalone === true
}

export function buildShareText() {
  const title = 'Yogatik'
  const text = 'Yogatik — a private AI assistant that runs in your browser or on your desktop. ' +
    'Your chats and API keys stay on your device.'
  return { title, text, url: SHARE_URL, clipboard: `${text}\n${SHARE_URL}` }
}

/**
 * Share via the native share sheet when available, else copy the link.
 * @returns 'shared' | 'copied' | 'cancelled' | 'failed'
 */
export async function shareYogatik() {
  const payload = buildShareText()
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: payload.title, text: payload.text, url: payload.url })
      return 'shared'
    }
  } catch (e) {
    // A user dismissing the sheet is not an error worth reporting as one.
    if (e?.name === 'AbortError') return 'cancelled'
  }
  try {
    await navigator.clipboard.writeText(payload.clipboard)
    return 'copied'
  } catch {
    return 'failed'
  }
}
