/**
 * Sanitization utilities for external HTML/Markdown content.
 * Uses DOMPurify to prevent XSS from tool outputs, LLM responses, and user-provided content.
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize SVG content for safe rendering.
 * DOMPurify-based: only valid SVG elements survive; event handlers,
 * javascript: URLs, and non-SVG roots are stripped/rejected.
 *
 * @param {string} svg - Raw SVG string to sanitize
 * @returns {string} Sanitized SVG safe for DOM insertion, or empty string if not valid SVG
 */
export function sanitizeSvg(svg) {
  if (!svg || typeof svg !== 'string') return ''
  const trimmed = svg.trim()
  if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) return ''
  try {
    const clean = DOMPurify.sanitize(trimmed, {
      USE_PROFILES: { svg: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'a'],
      ALLOW_UNKNOWN_PROTOCOLS: false,
    })
    // DOMPurify with the SVG profile returns '' for non-SVG input; double-check
    // the root is still an <svg> so a smuggled <div> can never pass as a diagram.
    const t = String(clean).trim()
    if (!t.startsWith('<svg')) return ''
    if (/on\w+\s*=/i.test(t) || /javascript:/i.test(t)) return ''
    return t
  } catch {
    return ''
  }
}

/**
 * Sanitize HTML content for safe rendering.
 * Allows common formatting tags but strips scripts, event handlers, and dangerous attributes.
 * 
 * @param {string} html - Raw HTML string to sanitize
 * @param {Object} options - Optional configuration
 * @returns {string} Sanitized HTML safe for DOM insertion
 */
export function sanitizeHtml(html, options = {}) {
  if (!html || typeof html !== 'string') return '';
  
  const config = {
    // Allowed tags for basic formatting
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'div', 'span',
      'sub', 'sup', 'mark', 'small', 'del', 'ins',
      'details', 'summary', 'kbd', 'samp', 'var', 'dfn',
      'abbr', 'cite', 'q', 'time', 'address'
    ],
    // Allowed attributes
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'target', 'rel',
      'class', 'id', 'style',
      'width', 'height', 'align',
      'colspan', 'rowspan', 'scope',
      'datetime', 'cite'
    ],
    // Allowed URI schemes for href/src
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|$)/i,
    // Keep content in <pre><code> blocks
    KEEP_CONTENT: true,
    // Return as string (not document fragment)
    RETURN_DOM: false,
    // Remove empty allowed tags
    FORCE_BODY: false,
    ...options
  };
  
  return DOMPurify.sanitize(html, config);
}

/**
 * Sanitize HTML for more restrictive contexts (e.g., tool output, unknown sources).
 * Strips all attributes except a minimal safe set.
 * 
 * @param {string} html - Raw HTML string to sanitize
 * @returns {string} Heavily sanitized HTML
 */
export function sanitizeHtmlStrict(html) {
  return sanitizeHtml(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'code', 'pre', 'blockquote'],
    ALLOWED_ATTR: []
  });
}

/**
 * Sanitize markdown-rendered HTML (used with react-markdown).
 * This is a more permissive config for trusted markdown sources.
 * 
 * @param {string} html - HTML from markdown renderer
 * @returns {string} Sanitized HTML
 */
export function sanitizeMarkdownHtml(html) {
  return sanitizeHtml(html, {
    // Allow more tags for markdown rendering
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'div', 'span',
      'sub', 'sup', 'mark', 'small', 'del', 'ins',
      'details', 'summary', 'kbd', 'samp', 'var', 'dfn',
      'abbr', 'cite', 'q', 'time', 'address',
      'figure', 'figcaption', 'caption'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'target', 'rel',
      'class', 'id', 'style',
      'width', 'height', 'align',
      'colspan', 'rowspan', 'scope',
      'datetime', 'cite'
    ]
  });
}

/**
 * Create a safe React element from sanitized HTML.
 * Use this instead of dangerouslySetInnerHTML.
 * 
 * @param {string} html - Sanitized HTML string
 * @returns {Object} React element
 */
export function createSafeHtmlElement(html) {
  const sanitized = sanitizeHtml(html);
  return { __html: sanitized };
}

/**
 * Strip all HTML tags, return plain text.
 * Useful for previews, search snippets, etc.
 * 
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  // Simple tag stripping - DOMPurify can also do this with KEEP_CONTENT: false
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true });
}

/**
 * Unified DOMPurify-based sanitiser for ALL LLM / tool HTML.
 * Single choke point so no caller hand-rolls its own stripping:
 * SVG-looking input goes through the SVG profile, everything else through
 * the strict HTML profile. Non-string input returns ''.
 *
 * @param {string} html - Raw LLM/tool output
 * @param {Object} [options] - Passed through to sanitizeHtml for HTML input
 * @returns {string} Sanitized output safe for DOM insertion
 */
export function sanitize(html, options) {
  if (!html || typeof html !== 'string') return ''
  const t = html.trim()
  if (t.startsWith('<svg') || t.startsWith('<?xml')) return sanitizeSvg(html)
  return options ? sanitizeHtml(html, options) : sanitizeHtmlStrict(html)
}

/** British-spelling alias — same function, so both spellings stay one code path. */
export const sanitise = sanitize

export default {
  sanitize,
  sanitise,
  sanitizeSvg,
  sanitizeHtml,
  sanitizeHtmlStrict,
  sanitizeMarkdownHtml,
  createSafeHtmlElement,
  stripHtml
};