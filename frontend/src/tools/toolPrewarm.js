/**
 * toolPrewarm.js — Speculative runtime & tool pre-warming based on user typing intent.
 * Pre-fetches heavy WASM/Wasm runtimes and dynamic tool dependencies during idle time
 * before the LLM issues a function call, reducing execution latency to 0ms.
 */

const prewarmedModules = new Set()

const INTENT_RULES = [
  {
    id: 'python_code',
    regex: /\b(python|pyodide|def\s+|import\s+pandas|import\s+numpy|matplotlib|scipy|execute code|run python)\b/i,
    load: () => import('./codeExec'),
  },
  {
    id: 'ocr_vision',
    regex: /\b(ocr|read text from image|extract text from photo|scan receipt|scan document)\b/i,
    load: () => import('./ocr'),
  },
  {
    id: 'doc_export',
    regex: /\b(ppt|pptx|powerpoint|slides|export to doc|create word document|pdf export)\b/i,
    load: () => import('./independentTools'),
  },
  {
    id: 'turbovec_rag',
    regex: /\b(embedding|vector search|turbovec|semantic similarity|rag search)\b/i,
    load: () => import('../turbovec'),
  },
  {
    id: 'chart_render',
    regex: /\b(chart|plot data|render graph|pie chart|bar chart|line chart)\b/i,
    load: () => import('./chart'),
  },
]

/**
 * Speculatively pre-fetches tool modules during browser idle callbacks.
 *
 * @param {string} inputText - The current text in the chat input
 */
export function prewarmToolsFromInput(inputText) {
  if (!inputText || typeof inputText !== 'string' || inputText.length < 3) return

  const schedulePrewarm = typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
    : (fn) => setTimeout(fn, 100)

  for (const rule of INTENT_RULES) {
    if (!prewarmedModules.has(rule.id) && rule.regex.test(inputText)) {
      prewarmedModules.add(rule.id)
      schedulePrewarm(async () => {
        try {
          await rule.load()
        } catch {
          // Non-critical pre-warm failure
        }
      })
    }
  }
}

export function _resetPrewarmCache() {
  prewarmedModules.clear()
}
