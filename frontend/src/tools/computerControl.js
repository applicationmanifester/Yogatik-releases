/**
 * computer_control — precise cross-app mouse/keyboard control for the AI
 * companion. Where desktop_action can only type text, fire a hotkey, copy or
 * launch, this can CLICK at a coordinate, move the pointer, scroll, and press
 * named keys in ANY application. Pair it with screen_inspect: look at the
 * screen, then act on what you saw.
 *
 * Desktop app only (Windows in this build). Key combos are assembled from a
 * fixed vocabulary in the main process, so no raw string reaches the shell.
 */

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_COMPANION_INPUT__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Direct mouse and keyboard control runs only in the Yogatik desktop app.',
}

export const computerControlTool = {
  schema: {
    description:
      'Control the mouse and keyboard across any application on the user’s computer: click or double-click at a screen coordinate, ' +
      'move the pointer, scroll, or press a named key/combo (enter, tab, escape, ctrl+c, ctrl+shift+t, f5…). ' +
      'Use together with screen_inspect — inspect the screen first to find where to click. ' +
      'Ask the user before taking an action that submits, sends, deletes or purchases anything. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'double_click', 'right_click', 'move', 'scroll', 'key'],
          description: 'What to do.',
        },
        x: { type: 'number', description: 'Screen X coordinate (click / move).' },
        y: { type: 'number', description: 'Screen Y coordinate (click / move).' },
        amount: { type: 'number', description: 'Scroll notches: negative scrolls down, positive up (default -3).' },
        keys: { type: 'string', description: 'Key or combo for action "key", e.g. "enter", "ctrl+c", "ctrl+shift+t", "f5".' },
      },
      required: ['action'],
    },
  },
  async execute({ action, x, y, amount = -3, keys } = {}) {
    const b = bridge()
    if (!b) return DESKTOP_ONLY
    try {
      switch (action) {
        case 'click':
        case 'double_click':
        case 'right_click': {
          const res = await b.click({
            x, y,
            button: action === 'right_click' ? 'right' : 'left',
            double: action === 'double_click',
          })
          return { tool: 'computer_control', action, x, y, ...res }
        }
        case 'move': {
          if (x == null || y == null) return { success: false, error: 'x and y are required to move the pointer' }
          return { tool: 'computer_control', action, ...(await b.move(x, y)) }
        }
        case 'scroll':
          return { tool: 'computer_control', action, ...(await b.scroll(amount)) }
        case 'key': {
          if (!keys) return { success: false, error: 'keys is required for action "key"' }
          return { tool: 'computer_control', action, ...(await b.key(keys)) }
        }
        default:
          return { success: false, error: `Unsupported action: ${action}` }
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
