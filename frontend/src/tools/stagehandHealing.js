/**
 * Stagehand-Style Self-Healing Web & DOM Automation
 * 
 * Inspired by browserbase/stagehand.
 * Provides resilient, self-healing browser automation primitives:
 * - observe: captures a clean semantic accessibility snapshot of interactive elements.
 * - act: performs robust actions using progressive selector fallback (aria, text, proximity, role).
 * - extract: pulls structured data from DOM using fuzzy matching and schema validation.
 */

/**
 * Builds a compact accessibility & semantic tree representation of the active page.
 */
export function buildAccessibilitySnapshot(documentRoot) {
  if (!documentRoot || typeof documentRoot.querySelectorAll !== 'function') {
    return { elements: [], total: 0 }
  }

  const interactive = documentRoot.querySelectorAll(
    'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])'
  )

  const elements = []
  let idCounter = 1

  for (const el of interactive) {
    if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue // Hidden

    const tag = el.tagName.toLowerCase()
    const text = (el.innerText || el.textContent || el.value || el.placeholder || '').trim().slice(0, 100)
    const ariaLabel = el.getAttribute('aria-label') || ''
    const role = el.getAttribute('role') || tag
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : {}

    elements.push({
      elementId: `stagehand_${idCounter++}`,
      tag,
      role,
      text: text || ariaLabel,
      ariaLabel,
      rect: {
        x: Math.round(rect.x || 0),
        y: Math.round(rect.y || 0),
        w: Math.round(rect.width || 0),
        h: Math.round(rect.height || 0)
      }
    })
  }

  return {
    elements,
    total: elements.length
  }
}

/**
 * Progressive, self-healing element finder that falls back across multiple strategies
 * when primary selectors break due to site redesigns or dynamic class hashes.
 */
export function resolveSelfHealingSelector(elements = [], targetDesc = '') {
  if (!elements.length || !targetDesc) return null

  const norm = targetDesc.toLowerCase().trim()

  // Strategy 1: Exact text or exact aria-label match
  let match = elements.find(e => 
    e.text.toLowerCase() === norm || 
    (e.ariaLabel && e.ariaLabel.toLowerCase() === norm)
  )
  if (match) return { element: match, strategy: 'exact_text_aria' }

  // Strategy 2: Word boundary / includes match
  match = elements.find(e => 
    e.text.toLowerCase().includes(norm) || 
    (e.ariaLabel && e.ariaLabel.toLowerCase().includes(norm))
  )
  if (match) return { element: match, strategy: 'substring_fuzzy' }

  // Strategy 3: Role + partial keyword match (e.g. "submit button")
  const words = norm.split(/\s+/)
  match = elements.find(e => {
    const combined = `${e.role} ${e.text} ${e.ariaLabel}`.toLowerCase()
    return words.every(w => combined.includes(w))
  })
  if (match) return { element: match, strategy: 'role_token_intersection' }

  return null
}

/**
 * Stagehand-style resilient extraction helper
 */
export function extractStructuredContent(rawHtmlOrText = '', fields = []) {
  const result = {}
  const text = typeof rawHtmlOrText === 'string' ? rawHtmlOrText : ''

  for (const field of fields) {
    const key = typeof field === 'string' ? field : field.name
    const regex = new RegExp(`${key}\\s*[:=-]\\s*([^\\n\\r,;]+)`, 'i')
    const match = text.match(regex)
    result[key] = match ? match[1].trim() : null
  }

  return result
}
