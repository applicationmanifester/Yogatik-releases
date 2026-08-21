/**
 * browser_control — a real browser the agent drives and the user watches.
 *
 * The web build cannot do this: cross-origin iframes are refused by
 * X-Frame-Options on most real sites and are opaque to the parent even when
 * allowed. web_extract/web_search fetch static HTML; this runs the page.
 *
 * Elements are addressed by ref from `read`, not by pixel guessing. Refs go
 * stale on navigation and are refused loudly rather than clicking blind.
 *
 * Desktop app only.
 */

import { getWorkspaceCtx } from './localFs'
import { getSetting } from '../db'
import { extractReadable } from './readability'

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Browser control runs only in the Yogatik desktop app.',
}

// The chat owns its browsing session. Supplied here, never a tool parameter —
// the model must not be able to reach into another chat's logged-in tabs.
//
// Surface: an explicit `display` from the model wins; otherwise the user's
// stored default; otherwise a window.
async function ctx(display) {
  const { conversationId } = getWorkspaceCtx() || {}
  let mode = display
  if (!mode) {
    try {
      const prefs = await getSetting('chat_prefs', {})
      mode = prefs?.browser_display_mode === 'panel' ? 'panel' : 'window'
    } catch { mode = 'window' }
  }
  return { conversationId: conversationId || null, display: mode }
}

export const browserControlTool = {
  schema: {
    type: 'function',
    function: {
      name: 'browser_control',
      description:
        'Open and USE a real web browser the user can watch: navigate, read the page structure, click, type, scroll and manage tabs. ' +
        'Unlike web_extract/web_search (which only fetch static HTML), this runs the page\'s JavaScript, so it works on logged-in pages and apps. ' +
        'ALWAYS call action "read" first: it returns the page as a tree where every clickable element has a [ref_N] handle. ' +
        'Then click or type using that ref — do not guess x/y coordinates unless the target is a canvas or custom widget with no ref. ' +
        'Refs go stale when the page changes; if you get a stale-ref error, call "read" again. ' +
        'Ask the user before any action that submits, sends, deletes, buys, or posts anything. Desktop app only.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'navigate', 'read', 'click', 'double_click', 'right_click', 'type', 'key',
              'scroll', 'screenshot', 'new_tab', 'list_tabs', 'select_tab', 'close_tab',
              'back', 'forward', 'set_mode', 'close',
              'wait_for', 'fill_form', 'evaluate', 'extract_text',
            ],
            description: 'What to do.',
          },
          url: { type: 'string', description: 'URL for navigate / new_tab.' },
          ref: { type: 'string', description: 'Element handle from a previous read, e.g. "ref_3_12". Preferred over x/y.' },
          x: { type: 'number', description: 'Fallback X coordinate, only when no ref exists (canvas/custom widgets).' },
          y: { type: 'number', description: 'Fallback Y coordinate, only when no ref exists.' },
          text: { type: 'string', description: 'Text to type for action "type".' },
          submit: { type: 'boolean', description: 'Press Enter after typing. Confirm with the user first — this submits.' },
          keys: { type: 'string', description: 'Key or combo for action "key": "enter", "tab", "escape", "ctrl+a".' },
          amount: { type: 'number', description: 'Scroll distance in pixels; negative scrolls down (default -400).' },
          tabId: { type: 'string', description: 'Target tab. Defaults to the active tab.' },
          display: {
            type: 'string',
            enum: ['window', 'panel'],
            description: 'Show the browser in a separate window or docked in the app. Omit to use the user\'s preferred surface.',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for wait_for action — waits until this element appears in the DOM.',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds for wait_for (default 10000).',
          },
          fields: {
            type: 'object',
            description: 'For fill_form: an object mapping ref handles to values, e.g. {"ref_3": "hello", "ref_5": "world"}.',
          },
          expression: {
            type: 'string',
            description: 'JavaScript expression to evaluate in the page context for the evaluate action.',
          },
        },
        required: ['action'],
      },
    },
  },

  async execute({ action, url, ref, x, y, text, submit, keys, amount, tabId, display, selector, timeout, fields, expression } = {}) {
    const b = bridge()
    if (!b) return DESKTOP_ONLY
    const base = await ctx(display)
    try {
      switch (action) {
        case 'navigate':
          if (!url) return { success: false, error: 'url is required to navigate' }
          return { tool: 'browser_control', action, ...(await b.navigate({ ...base, url, tabId })) }
        case 'read':
          return { tool: 'browser_control', action, ...(await b.read({ ...base, tabId })) }
        case 'click':
        case 'double_click':
        case 'right_click':
          return {
            tool: 'browser_control', action,
            ...(await b.click({
              ...base, tabId, ref, x, y,
              button: action === 'right_click' ? 'right' : 'left',
              double: action === 'double_click',
            })),
          }
        case 'type':
          if (typeof text !== 'string') return { success: false, error: 'text is required to type' }
          return { tool: 'browser_control', action, ...(await b.type({ ...base, tabId, ref, text, submit })) }
        case 'key':
          if (!keys) return { success: false, error: 'keys is required' }
          return { tool: 'browser_control', action, ...(await b.key({ ...base, tabId, keys })) }
        case 'scroll':
          return { tool: 'browser_control', action, ...(await b.scroll({ ...base, tabId, ref, amount })) }
        case 'screenshot':
          return { tool: 'browser_control', action, ...(await b.screenshot({ ...base, tabId })) }
        case 'new_tab':
          return { tool: 'browser_control', action, ...(await b.newTab({ ...base, url })) }
        case 'list_tabs':
          return { tool: 'browser_control', action, ...(await b.listTabs(base)) }
        case 'select_tab':
          if (!tabId) return { success: false, error: 'tabId is required' }
          return { tool: 'browser_control', action, ...(await b.selectTab({ ...base, tabId })) }
        case 'close_tab':
          if (!tabId) return { success: false, error: 'tabId is required' }
          return { tool: 'browser_control', action, ...(await b.closeTab({ ...base, tabId })) }
        case 'back':
        case 'forward':
          return { tool: 'browser_control', action, ...(await b.history({ ...base, tabId, direction: action })) }
        case 'set_mode':
          if (!display) return { success: false, error: 'display is required: "window" or "panel"' }
          return { tool: 'browser_control', action, ...(await b.setMode(base)) }
        case 'close':
          return { tool: 'browser_control', action, ...(await b.close(base)) }
        case 'wait_for': {
          if (!selector && !ref) return { success: false, error: 'selector or ref is required for wait_for' }
          const waitTimeout = Math.min(Math.max(1000, timeout || 10000), 30000)
          try {
            if (b.waitFor) {
              return { tool: 'browser_control', action, ...(await b.waitFor({ ...base, tabId, selector, ref, timeout: waitTimeout })) }
            }
            // Fallback: poll via read until element appears
            const start = Date.now()
            while (Date.now() - start < waitTimeout) {
              const page = await b.read({ ...base, tabId })
              const tree = page?.tree || page?.text || ''
              if (selector && tree.includes(selector)) return { tool: 'browser_control', action, success: true, found: selector }
              if (ref && tree.includes(ref)) return { tool: 'browser_control', action, success: true, found: ref }
              await new Promise(r => setTimeout(r, 500))
            }
            return { success: false, error: `Timeout: element not found after ${waitTimeout}ms` }
          } catch (e) {
            return { success: false, error: e?.message || String(e) }
          }
        }
        case 'fill_form': {
          if (!fields || typeof fields !== 'object') return { success: false, error: 'fields object is required for fill_form, e.g. {"ref_3": "value"}' }
          const results = []
          for (const [fieldRef, value] of Object.entries(fields)) {
            try {
              const r = await b.type({ ...base, tabId, ref: fieldRef, text: String(value), submit: false })
              results.push({ ref: fieldRef, success: r?.success !== false })
            } catch (e) {
              results.push({ ref: fieldRef, success: false, error: e?.message })
            }
          }
          return { tool: 'browser_control', action, success: true, filled: results }
        }
        case 'evaluate': {
          if (!expression) return { success: false, error: 'expression is required for evaluate' }
          if (b.evaluate) {
            return { tool: 'browser_control', action, ...(await b.evaluate({ ...base, tabId, expression })) }
          }
          return { success: false, error: 'evaluate is not supported by this browser bridge version' }
        }
        case 'extract_text': {
          // Read the rendered DOM HTML and run readability extraction on it
          try {
            let html = ''
            if (b.getPageHtml) {
              html = await b.getPageHtml({ ...base, tabId })
            } else if (b.evaluate) {
              const result = await b.evaluate({ ...base, tabId, expression: 'document.documentElement.outerHTML' })
              html = result?.result || result?.value || ''
            } else {
              return { success: false, error: 'extract_text needs getPageHtml or evaluate support in the browser bridge' }
            }
            if (!html || html.length < 100) return { success: false, error: 'No HTML could be read from the page' }
            const page = extractReadable(html, { maxChars: 12000 })
            return {
              tool: 'browser_control', action, success: true,
              title: page.title,
              text: page.text,
              words: page.words,
              tables: page.tables,
              code_blocks: page.code_blocks,
              json_ld: page.json_ld,
              images: page.images,
            }
          } catch (e) {
            return { success: false, error: `extract_text failed: ${e?.message || e}` }
          }
        }
        default:
          return { success: false, error: `Unsupported action: ${action}` }
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
