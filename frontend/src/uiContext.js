/**
 * uiContext.js — Ambient UI Telemetry & Situational Awareness for Yogatik AI
 *
 * Tracks the user's active viewport state, open modals, selected text, and device
 * mode so the AI model possesses real-time situational awareness when assisting.
 */

const DEFAULT_UI_CONTEXT = {
  activeModal: null,       // e.g. 'settings', 'file_editor', 'domain_hub', 'diagnostics'
  activeTab: 'chat',       // e.g. 'chat', 'agents', 'live', 'workspace', 'scheduler'
  selectedText: '',        // text selected/highlighted by user in viewport
  theme: 'dark',           // 'dark' | 'light'
  viewport: {
    width: typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight || 800 : 800,
    isMobile: typeof window !== 'undefined' ? (window.innerWidth || 1280) < 768 : false,
  },
  activeDocument: null,    // { name, path, language } if user has file open in editor
  lastInteraction: 'idle',
}

let _currentContext = { ...DEFAULT_UI_CONTEXT }
const _listeners = new Set()

/**
 * Get a copy of the current ambient UI context.
 */
export function getUiContext() {
  // Check if text is currently highlighted in browser window safely
  if (typeof window !== 'undefined' && window.getSelection) {
    try {
      const sel = window.getSelection().toString().trim()
      if (sel && sel.length < 500) {
        _currentContext.selectedText = sel
      }
    } catch {}
  }
  return { ..._currentContext }
}

/**
 * Update the ambient UI context with a partial patch.
 * Emits change events to any registered subscribers.
 */
export function setUiContext(patch = {}) {
  if (!patch || typeof patch !== 'object') return _currentContext
  
  _currentContext = {
    ..._currentContext,
    ...patch,
    viewport: {
      ..._currentContext.viewport,
      ...(patch.viewport || {}),
    },
  }

  for (const listener of _listeners) {
    try {
      listener(_currentContext)
    } catch (err) {
      console.error('[uiContext] listener error:', err)
    }
  }

  return _currentContext
}

/**
 * Subscribe to UI context changes.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribeUiContext(callback) {
  if (typeof callback !== 'function') return () => {}
  _listeners.add(callback)
  return () => _listeners.delete(callback)
}

/**
 * Reset UI context back to defaults (primarily for test cleanup).
 */
export function resetUiContext() {
  _currentContext = { ...DEFAULT_UI_CONTEXT }
  _listeners.clear()
}

/**
 * Generates an ambient UI telemetry block for injection into LLM system prompts.
 * Kept concise (<150 tokens) to minimize context window overhead.
 */
export function buildUiTelemetryBlock() {
  const ctx = getUiContext()
  const bits = [
    `Device/View: ${ctx.viewport.isMobile ? 'Mobile' : 'Desktop'} (${ctx.viewport.width}x${ctx.viewport.height}), Theme: ${ctx.theme}`,
    `Current Active View: ${ctx.activeTab || 'chat'}`,
  ]

  if (ctx.activeModal) {
    bits.push(`Open Modal / Dialog: "${ctx.activeModal}" (User is currently interacting with this modal)`)
  }

  if (ctx.activeDocument?.name || ctx.activeDocument?.path) {
    bits.push(`Active Document in Editor: ${ctx.activeDocument.name || ctx.activeDocument.path} (${ctx.activeDocument.language || 'text'})`)
  }

  if (ctx.selectedText) {
    bits.push(`Highlighted / Selected Text: "${ctx.selectedText.slice(0, 200)}"`)
  }

  return `\nAMBIENT UI CONTEXT (Real-time user screen state):\n` +
    bits.map(b => `- ${b}`).join('\n') +
    `\n(Use this telemetry for natural situational awareness. When the user says "fix this" or refers to an open modal/file, reference this screen context naturally without robotic recitation.)\n`
}
