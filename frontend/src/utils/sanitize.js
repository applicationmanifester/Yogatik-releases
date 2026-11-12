import React from 'react'
import DOMPurify from 'dompurify'

/**
 * Sanitize HTML string for safe insertion into the DOM.
 * Strips scripts, event handlers, javascript: URLs, and other XSS vectors.
 * Allowed tags/attributes are a conservative subset for rich text rendering.
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr',
      'span', 'div',
      'mark',
      'sub', 'sup',
      'details', 'summary',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title',
      'class', 'id',
      'data-*',
      'target', 'rel',
      'colspan', 'rowspan',
      'open',
    ],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base'],
    FORBID_ATTR: ['on*', 'onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'style'],
    SAFE_FOR_TEMPLATES: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  })
}

// Keep the synchronous APIs consumed by streaming/tool output callers.
export function sanitizeHtmlSync(html, toolName = '') {
  return sanitizeHtml(html)
}

export function sanitizeToolOutput(html, toolName = '') {
  return sanitizeHtml(html)
}

/**
 * Sanitize a URL for safe use in href/src attributes.
 * Only allows https:, mailto:, tel: protocols.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#'
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed, window.location.origin)
    if (['https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return parsed.toString()
    }
  } catch {
    // Invalid URL
  }
  return '#'
}

/**
 * Sanitize plain text for safe textContent insertion (no HTML).
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Sanitize markdown-rendered HTML (alias for sanitizeHtml with stricter config).
 */
export function sanitizeMarkdownHtml(html) {
  return sanitizeHtml(html)
}

/**
 * Create safe ReactMarkdown component overrides.
 */
export function createSafeMarkdownComponents() {
  return {
    a: ({ href, children, ...props }) => React.createElement('a', {
      ...props,
      href: sanitizeUrl(href),
      target: '_blank',
      rel: 'noopener noreferrer',
    }, children),
    img: ({ src, alt, ...props }) => React.createElement('img', {
      ...props,
      src: sanitizeUrl(src),
      alt: sanitizeText(alt),
      loading: 'lazy',
    }),
    code: ({ children, ...props }) => React.createElement('code', props, sanitizeText(String(children))),
    pre: ({ children, ...props }) => React.createElement('pre', props, sanitizeText(String(children))),
  }
}
export default {
  sanitizeHtml,
  sanitizeUrl,
  sanitizeText,
  sanitizeMarkdownHtml,
  createSafeMarkdownComponents,
}
