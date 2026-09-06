/**
 * geminiBridge.js — Utilities for bridging Yogatik Desktop workspace files
 * with the embedded gemini.google.com webview session.
 */

import { invoke, isDesktop } from './localFs'
import { buildWorkspaceContextPrompt } from './grokBridge'

export { buildWorkspaceContextPrompt }

/**
 * Generates an evaluation script to inject text into gemini.google.com's chat input.
 * Supports Quill editor (.ql-editor), rich-textarea, and contenteditable elements.
 */
export function getGeminiInputInjectionScript(text) {
  const safeText = JSON.stringify(text)
  return `(() => {
    try {
      const selectors = [
        '.ql-editor[contenteditable="true"]',
        '.ql-editor',
        'rich-textarea [contenteditable="true"]',
        'rich-textarea div[role="textbox"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'div[role="textbox"]',
        'textarea',
      ];
      let target = null;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
          target = el;
          break;
        }
      }
      if (!target) {
        target = document.querySelector('.ql-editor') || document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
      }
      if (!target) {
        return { success: false, error: 'Could not find Gemini chat input on gemini.google.com' };
      }

      target.focus();

      if (target.tagName === 'TEXTAREA') {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(target, ${safeText});
        } else {
          target.value = ${safeText};
        }
        if (target._valueTracker) {
          target._valueTracker.setValue('');
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        if (document.execCommand) {
          try {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, ${safeText});
          } catch {
            target.textContent = ${safeText};
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else {
          target.textContent = ${safeText};
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      return { success: true, targetType: target.tagName.toLowerCase() };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  })()`
}

/**
 * Generates an evaluation script to inspect the latest response turn on gemini.google.com
 * and extract all formatted code blocks.
 */
export function getGeminiCodeExtractionScript() {
  return `(() => {
    try {
      const codeBlocks = [];
      const preElements = document.querySelectorAll('pre, code-block, .code-block');
      if (!preElements.length) {
        return { success: true, blocks: [] };
      }

      const list = Array.from(preElements).slice(-10);
      list.forEach((pre, idx) => {
        const codeEl = pre.querySelector('code') || pre;
        const text = codeEl.innerText || codeEl.textContent || '';
        if (!text.trim()) return;

        let lang = 'text';
        const classes = (codeEl.className + ' ' + pre.className).split(/\\s+/);
        for (const cls of classes) {
          if (cls.startsWith('language-')) {
            lang = cls.replace('language-', '');
            break;
          } else if (cls.startsWith('lang-')) {
            lang = cls.replace('lang-', '');
            break;
          }
        }

        let filename = '';
        const header = pre.querySelector('.code-block-header') || pre.previousElementSibling;
        if (header && header.textContent && /\\.[a-z0-9]{1,8}$/i.test(header.textContent.trim())) {
          filename = header.textContent.trim();
        }

        codeBlocks.push({
          id: idx,
          code: text,
          language: lang,
          filename: filename || '',
          lines: text.split('\\n').length
        });
      });

      return { success: true, blocks: codeBlocks };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  })()`
}

/**
 * High-level bridge helper to inject text into the active Gemini session.
 */
export async function injectTextIntoGemini(conversationId, text) {
  const br = typeof window !== 'undefined' ? window.__YOGATIK_BROWSER__ : null
  if (!br || typeof br.evaluate !== 'function') {
    throw new Error('Desktop browser bridge is not available. Please run Yogatik in desktop mode.')
  }

  const script = getGeminiInputInjectionScript(text)
  const result = await br.evaluate({
    conversationId,
    expression: script,
  })

  return result
}

/**
 * High-level bridge helper to pull code blocks from the active Gemini session.
 */
export async function extractLatestCodeFromGemini(conversationId) {
  const br = typeof window !== 'undefined' ? window.__YOGATIK_BROWSER__ : null
  if (!br || typeof br.evaluate !== 'function') {
    throw new Error('Desktop browser bridge is not available.')
  }

  const script = getGeminiCodeExtractionScript()
  const result = await br.evaluate({
    conversationId,
    expression: script,
  })

  return result
}
