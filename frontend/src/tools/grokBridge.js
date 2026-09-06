/**
 * grokBridge.js — Utilities for bridging Yogatik Desktop workspace files
 * with the embedded grok.com webview session.
 */

import { invoke, isDesktop } from './localFs'

/**
 * Generates an evaluation script to inject text into grok.com's chat input.
 * Supports both standard textarea and contenteditable rich-text editors.
 */
export function getGrokInputInjectionScript(text) {
  const safeText = JSON.stringify(text)
  return `(() => {
    try {
      const selectors = [
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="Grok"]',
        'textarea[placeholder*="anything"]',
        'textarea[placeholder*="message"]',
        'textarea',
        '[contenteditable="true"]',
        'div[role="textbox"]'
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
        target = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
      }
      if (!target) {
        return { success: false, error: 'Could not find Grok chat input on grok.com' };
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
        target.focus();
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
 * Generates an evaluation script to inspect the latest response turn on grok.com
 * and extract all formatted code blocks.
 */
export function getGrokCodeExtractionScript() {
  return `(() => {
    try {
      const codeBlocks = [];
      const preElements = document.querySelectorAll('pre');
      if (!preElements.length) {
        return { success: true, blocks: [] };
      }

      // Scan from bottom up (latest messages)
      const list = Array.from(preElements).slice(-10);
      list.forEach((pre, idx) => {
        const codeEl = pre.querySelector('code') || pre;
        const text = codeEl.innerText || codeEl.textContent || '';
        if (!text.trim()) return;

        // Try to determine language from class names (e.g. language-js, hljs, etc.)
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

        // Check if pre has an associated header or filename
        let filename = '';
        const prev = pre.previousElementSibling;
        if (prev && prev.textContent && /\\.[a-z0-9]{1,8}$/i.test(prev.textContent.trim())) {
          filename = prev.textContent.trim();
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
 * Builds a structured markdown prompt containing workspace project context
 * for injection into Grok.
 */
export function buildWorkspaceContextPrompt({
  projectName = 'Workspace',
  rootPath = '',
  files = [],
  activeFileName = '',
  activeFileContent = '',
  gitBranch = '',
  gitStatus = '',
  customInstruction = '',
} = {}) {
  const parts = []

  parts.push(`### 📁 Local Workspace Context: ${projectName}`)
  if (rootPath) parts.push(`**Root Directory:** \`${rootPath}\``)
  if (gitBranch) parts.push(`**Git Branch:** \`${gitBranch}\`${gitStatus ? ` (${gitStatus})` : ''}`)

  if (files && files.length > 0) {
    const fileList = files.slice(0, 40).map(f => `- ${f}`).join('\n')
    const remaining = files.length > 40 ? `\n...and ${files.length - 40} more files` : ''
    parts.push(`\n**Project File Structure:**\n\`\`\`\n${fileList}${remaining}\n\`\`\``)
  }

  if (activeFileName && activeFileContent) {
    const ext = activeFileName.split('.').pop() || 'text'
    parts.push(`\n**Active File: \`${activeFileName}\`**\n\`\`\`${ext}\n${activeFileContent}\n\`\`\``)
  }

  if (customInstruction) {
    parts.push(`\n**Instructions:**\n${customInstruction}`)
  } else {
    parts.push(`\nPlease review this codebase context to assist me with development tasks.`)
  }

  return parts.join('\n')
}

/**
 * High-level bridge helper to inject text into the active Grok session.
 */
export async function injectTextIntoGrok(conversationId, text) {
  const br = typeof window !== 'undefined' ? window.__YOGATIK_BROWSER__ : null
  if (!br || typeof br.evaluate !== 'function') {
    throw new Error('Desktop browser bridge is not available. Please run Yogatik in desktop mode.')
  }

  const script = getGrokInputInjectionScript(text)
  const result = await br.evaluate({
    conversationId,
    expression: script,
  })

  return result
}

/**
 * High-level bridge helper to pull code blocks from the active Grok session.
 */
export async function extractLatestCodeFromGrok(conversationId) {
  const br = typeof window !== 'undefined' ? window.__YOGATIK_BROWSER__ : null
  if (!br || typeof br.evaluate !== 'function') {
    throw new Error('Desktop browser bridge is not available.')
  }

  const script = getGrokCodeExtractionScript()
  const result = await br.evaluate({
    conversationId,
    expression: script,
  })

  return result
}
