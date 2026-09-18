// src/utils/sanitize.js
import DOMPurify from 'dompurify';

const BASE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'hr'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'width', 'height'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'option', 'textarea', 'style', 'link', 'meta', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onkeydown', 'onkeyup', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'style', 'class', 'id'],
  SANITIZE_DOM: true,
  KEEP_CONTENT: true
};

const TOOL_CONFIGS = {
  browser_control: {
    ALLOWED_TAGS: [...BASE_CONFIG.ALLOWED_TAGS, 'video', 'source', 'audio', 'track'],
    ALLOWED_ATTR: [...BASE_CONFIG.ALLOWED_ATTR, 'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload'],
    FORBID_TAGS: BASE_CONFIG.FORBID_TAGS,
    FORBID_ATTR: BASE_CONFIG.FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true
  },
  youtube: {
    ALLOWED_TAGS: [...BASE_CONFIG.ALLOWED_TAGS, 'iframe'],
    ALLOWED_ATTR: [...BASE_CONFIG.ALLOWED_ATTR, 'allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    FORBID_TAGS: BASE_CONFIG.FORBID_TAGS,
    FORBID_ATTR: BASE_CONFIG.FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    KEEP_CONTENT: true
  }
};

export function sanitizeToolOutput(html, toolName = '') {
  if (!html) return '';
  const config = TOOL_CONFIGS[toolName] || BASE_CONFIG;
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(html, config);
  }
  return String(html);
}

export function sanitizeHtmlSync(html, toolName = '') {
  if (!html) return '';
  const config = TOOL_CONFIGS[toolName] || BASE_CONFIG;
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(html, config);
  }
  return String(html);
}