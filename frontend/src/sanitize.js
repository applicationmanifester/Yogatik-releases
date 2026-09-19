/**
 * Sanitization utilities for external HTML/Markdown content.
 * Uses DOMPurify to prevent XSS from tool outputs, LLM responses, and user-provided content.
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize SVG content for safe rendering.
 * Only allows valid SVG elements and strips all event handlers and javascript: URLs.
 * 
 * @param {string} svg - Raw SVG string to sanitize
 * @returns {string} Sanitized SVG safe for DOM insertion, or empty string if not valid SVG
 */
export function sanitizeSvg(svg) {
  if (!svg || typeof svg !== 'string') return '';
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    
    // Check if it's actually an SVG document
    const root = doc.documentElement;
    if (root.tagName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
      return '';
    }
    
    // Check for parser errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return '';
    }
    
    // Remove all event handlers from ALL elements (including root)
    // querySelectorAll('*') includes the root when called on document
    const allElements = doc.querySelectorAll('*');
    for (const el of allElements) {
      // Remove all on* event attributes
      for (const attr of el.attributes) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        // Remove javascript: URLs from href, xlink:href, etc.
        if (attr.value && attr.value.toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      }
    }
    
    // Also check the root element explicitly (in case querySelectorAll misses it)
    for (const attr of root.attributes) {
      if (attr.name.startsWith('on') || (attr.value && attr.value.toLowerCase().startsWith('javascript:'))) {
        root.removeAttribute(attr.name);
      }
    }
    
    // Serialize back to string
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return '';
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

export default {
  sanitizeHtml,
  sanitizeHtmlStrict,
  sanitizeMarkdownHtml,
  createSafeHtmlElement,
  stripHtml
};