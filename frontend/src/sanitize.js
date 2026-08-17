/**
 * Dependency-free HTML/SVG sanitisation for any externally-sourced markup
 * (tool payloads, LLM output, fetched pages) before it reaches
 * dangerouslySetInnerHTML. Uses the browser's own DOMParser rather than
 * pulling DOMPurify, matching the existing SVG sanitiser and keeping the
 * bundle lean. Strips executable and externally-loading vectors: scripts,
 * event handlers, javascript:/data: URLs, imports, and dangerous elements.
 *
 * This is a denylist-hardened parser, not a formal allowlist engine. For the
 * app's surface (a single diagram-SVG sink today) it removes the realistic XSS
 * vectors; if a rich-HTML sink is ever added, revisit with a strict allowlist.
 */

const DANGEROUS_TAGS = 'script,iframe,object,embed,link,meta,base,form,foreignObject,animate,set,style'
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction', 'data', 'poster', 'background'])
const BAD_URL = /^(?:javascript:|data:(?!image\/(?:png|jpe?g|gif|webp|svg\+xml);)|vbscript:)/i
const BAD_CSS = /(?:@import|expression\(|url\(\s*['"]?(?:javascript:|vbscript:))/i

function scrub(root) {
  root.querySelectorAll(DANGEROUS_TAGS).forEach(n => n.remove())
  root.querySelectorAll('*').forEach(node => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (name.startsWith('on')) { node.removeAttribute(attr.name); continue }
      if (URL_ATTRS.has(name) && BAD_URL.test(value)) { node.removeAttribute(attr.name); continue }
      if (name === 'style' && BAD_CSS.test(value)) { node.removeAttribute(attr.name) }
    }
  })
  return root
}

/** Sanitise an HTML fragment string; returns safe innerHTML. */
export function sanitizeHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc?.body) return ''
  scrub(doc.body)
  return doc.body.innerHTML
}

/** Sanitise an SVG string (diagrams). Returns '' if the root is not <svg>. */
export function sanitizeSvg(svg) {
  if (typeof svg !== 'string' || !svg.trim()) return ''
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return ''
  scrub(root)
  return new XMLSerializer().serializeToString(root)
}
