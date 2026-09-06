/**
 * grokBridge.js — Utilities for bridging Yogatik Desktop workspace files
 * with the embedded grok.com webview session.
 */

import { invoke, isDesktop } from './localFs'

/**
 * Generates an evaluation script to inject text into grok.com's chat input.
 * Supports both standard textarea and contenteditable rich-text editors.
 */
export function getGrokInputInjectionScript(text, { autoSubmit = false } = {}) {
  const safeText = JSON.stringify(text)
  const shouldSubmit = Boolean(autoSubmit)
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

      function findInputDeep(root = document) {
        for (const sel of selectors) {
          const el = root.querySelector(sel);
          if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)) {
            return el;
          }
        }
        const all = root.querySelectorAll('*');
        for (const el of all) {
          if (el.shadowRoot) {
            const found = findInputDeep(el.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      }

      let target = findInputDeep(document);
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

      if (${shouldSubmit}) {
        setTimeout(() => {
          const btn = document.querySelector('button[aria-label*="Submit"], button[aria-label*="Send"], button[type="submit"]');
          if (btn && !btn.disabled) {
            btn.click();
          }
        }, 150);
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
        // Strip copy buttons or header labels that might leak into innerText
        const clone = codeEl.cloneNode(true);
        clone.querySelectorAll('button, [aria-label*="Copy"], [aria-label*="copy"], .copy-button').forEach(b => b.remove());
        const text = clone.innerText || clone.textContent || '';
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
        if (!filename) {
          const firstLine = text.trim().split('\\n')[0] || '';
          const match = firstLine.match(/(?:\/\/|#|\\/\\*|<!--)\\s*(?:filepath:|filename:|file:)?\\s*([a-zA-Z0-9_\\-./\\\\]+\\.[a-z0-9]{1,8})/i);
          if (match && match[1] && !match[1].startsWith('http')) {
            filename = match[1];
          }
        }

        codeBlocks.push({
          id: idx,
          code: text.trim(),
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

  parts.push(`*Note for Grok: This context is provided directly from the user's local Windows PC workspace via Yogatik Desktop Bridge. Do NOT look in /home/workdir/artifacts.*`)

  if (customInstruction) {
    parts.push(`\n**Instructions:**\n${customInstruction}`)
  } else {
    parts.push(`\nPlease review this codebase context to assist me with development tasks.`)
  }

  return parts.join('\n')
}

/**
 * Builds a comprehensive multi-file code bundle prompt for injection into Grok.
 */
export function buildFolderFilesBundlePrompt({
  projectName = 'Workspace',
  rootPath = '',
  filesWithContent = [],
  instruction = 'Please inspect all files in this project folder and identify issues, bugs, and improvements.',
} = {}) {
  const parts = []
  parts.push(`### 📁 Local Windows Project Files Bundle: ${projectName}`)
  if (rootPath) parts.push(`**Local Root:** \`${rootPath}\``)
  parts.push(`**Files included:** ${filesWithContent.length}`)
  parts.push(`*IMPORTANT NOTE FOR GROK: These files are provided directly from the user's local Windows PC via Yogatik Desktop Bridge. Do NOT execute shell commands looking in /home/workdir/artifacts. The actual file contents are provided below:*`)
  parts.push(`\n**Task:** ${instruction}\n`)

  for (const item of filesWithContent) {
    const ext = item.path.split('.').pop() || 'text'
    parts.push(`\n--- FILE: \`${item.path}\` ---\n\`\`\`${ext}\n${item.content}\n\`\`\``)
  }

  parts.push(`\nBased on the files above, please provide a detailed analysis of any issues found.`)
  return parts.join('\n')
}

/**
 * High-level bridge helper to inject text into the active Grok session.
 */
export async function injectTextIntoGrok(conversationId, text, options = {}) {
  const br = typeof window !== 'undefined' ? window.__YOGATIK_BROWSER__ : null
  if (!br || typeof br.evaluate !== 'function') {
    throw new Error('Desktop browser bridge is not available. Please run Yogatik in desktop mode.')
  }

  const script = getGrokInputInjectionScript(text, options)
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
