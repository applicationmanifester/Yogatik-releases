/**
 * clipboard_access — read the OS clipboard and its recent history, or write to
 * it. Desktop app only: the browser can read the clipboard only while focused,
 * behind a permission prompt, and keeps no history.
 */

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_CLIPBOARD__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Clipboard access with history runs only in the Yogatik desktop app.',
}

export const clipboardAccessTool = {
  schema: {
    description:
      'Read the user’s current clipboard (text and images), read recent clipboard history, or write text to the clipboard. ' +
      'Use when the user says "what did I just copy", "act on my clipboard", or asks you to copy something. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'history', 'write'], description: 'read = current clipboard; history = recent copies; write = set clipboard text.' },
        text: { type: 'string', description: 'Text to write (required when action is "write").' },
        limit: { type: 'number', description: 'How many history items to return (action "history", default 10).' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'read', text, limit = 10 } = {}) {
    const cb = bridge()
    if (!cb) return DESKTOP_ONLY
    try {
      if (action === 'write') {
        if (typeof text !== 'string') return { success: false, error: 'text is required for write' }
        const r = await cb.write(text)
        return { success: !!r?.success, action: 'write', length: text.length }
      }
      if (action === 'history') {
        const r = await cb.history(limit)
        return { success: true, action: 'history', count: r?.items?.length || 0, items: r?.items || [] }
      }
      const r = await cb.read()
      return {
        success: !!r?.success,
        action: 'read',
        text: r?.text || '',
        hasImage: !!r?.hasImage,
        image: r?.image || undefined,
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
