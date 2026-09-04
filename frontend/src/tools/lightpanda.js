/**
 * Lightpanda: HTML-to-Markdown extraction, named after (not built on)
 * lightpanda-io/browser.
 *
 * FIXED 2026-09-04: this file used to CLAIM to be a real CDP-connected
 * headless browser process — `cdp_info` returned a fabricated memory figure,
 * a fake `cdpEndpoint: 'ws://127.0.0.1:9222/...'`, and a Docker image name,
 * none of which exist anywhere in this app. Nothing here spawns a process,
 * opens a CDP socket, or runs Zig/V8 — it is a plain fetch + regex-based
 * HTML-to-Markdown converter, same tier as webExtract.js. A model that
 * called cdp_info and believed it, then tried to dial that websocket,
 * would fail against a number this file invented. Fixed to say so plainly.
 * The real CDP-backed browser in this app is browser_control (Electron
 * WebContentsView) — this tool points to it rather than pretending to be it.
 *
 * Also fixed: fetchMarkdown used a bare `fetch()`, bypassing tools/http.js's
 * proxyFetch/proxyText — the shared CORS-fallback layer every other web tool
 * in this codebase goes through (see the youtube.js "second copy of the
 * relay list" gotcha). A raw fetch to a non-CORS host just fails on the web
 * build. Routed through proxyText now.
 *
 * Also fixed: eval_js ran model-supplied code through a bare `new Function`
 * with no sandbox, no timeout, and full access to whatever scope this tool
 * executes in (the app's own renderer) — a real code-execution surface this
 * app already solved correctly elsewhere (js_execute's Web Worker sandbox,
 * code_execute's Pyodide sandbox). Delegates to jsExecTool now instead of
 * re-implementing an unsandboxed eval.
 */
import { proxyText } from './http'
import { jsExecTool } from './jsExec'

/**
 * Converts raw HTML into clean, semantic LLM Markdown
 */
export function htmlToMarkdown(html = '') {
  let text = html
    // Remove script and style tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')

  // Extract Title
  const titleMatch = text.match(/<title>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Document'

  // Convert Headings
  text = text
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')

  // Convert Links & Images
  text = text
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)')
    .replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, '![]($1)')

  // Convert Lists
  text = text
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[ou]l[^>]*>/gi, '\n')

  // Convert Paragraphs and Blockquotes
  text = text
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Collapse excess whitespace
  const markdown = text
    .split('\n')
    .map(line => line.trim())
    .filter((line, i, arr) => line || arr[i - 1])
    .join('\n')
    .trim()

  return {
    title,
    markdown,
    length: markdown.length,
  }
}

/**
 * Extracts interactive DOM elements (buttons, links, inputs, forms) for agent navigation
 */
export function extractInteractiveElements(html = '') {
  const elements = []

  // Links
  const linkMatches = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  linkMatches.slice(0, 20).forEach((m, idx) => {
    const text = m[2].replace(/<[^>]+>/g, '').trim()
    if (text) {
      elements.push({
        type: 'link',
        index: idx,
        text,
        href: m[1],
        selector: `a[href="${m[1]}"]`,
      })
    }
  })

  // Buttons
  const buttonMatches = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
  buttonMatches.slice(0, 10).forEach((m, idx) => {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text) {
      elements.push({
        type: 'button',
        index: idx,
        text,
        selector: `button:nth-of-type(${idx + 1})`,
      })
    }
  })

  // Inputs
  const inputMatches = [...html.matchAll(/<input\b([^>]*)>/gi)]
  inputMatches.slice(0, 10).forEach((m, idx) => {
    const attrs = m[1] || ''
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i)
    const placeholderMatch = attrs.match(/placeholder=["']([^"']+)["']/i)
    const name = nameMatch ? nameMatch[1] : `input_${idx}`
    const placeholder = placeholderMatch ? placeholderMatch[1] : ''
    elements.push({
      type: 'input',
      index: idx,
      name,
      placeholder,
      selector: nameMatch ? `input[name="${name}"]` : `input:nth-of-type(${idx + 1})`,
    })
  })

  return {
    totalInteractive: elements.length,
    elements,
  }
}

/**
 * Fetch webpage and return LLM-ready markdown. Static HTML only — same limit
 * as webExtract.js, stated so the caller does not assume more than a plain
 * fetch can deliver (a client-rendered SPA comes back near-empty).
 */
export async function fetchMarkdown(url = '') {
  try {
    const html = await proxyText(url)
    if (!html || typeof html !== 'string') {
      return { success: false, url, error: `Failed to fetch HTML from ${url}` }
    }

    const parsed = htmlToMarkdown(html)
    const interactive = extractInteractiveElements(html)

    return {
      success: true,
      url,
      title: parsed.title,
      contentLength: parsed.length,
      markdown: parsed.markdown,
      interactiveElements: interactive.elements,
      note: 'Static HTML fetch — a JavaScript-rendered page will come back near-empty. For that, use browser_control (desktop app), which renders in a real browser.',
    }
  } catch (err) {
    return { success: false, url, error: err.message }
  }
}

export const lightpandaTool = {
  schema: {
    name: 'lightpanda',
    description: 'Fetches a static web page and converts it to clean Markdown, extracting interactive elements (links/buttons/inputs) as a bonus. Does NOT render JavaScript and is not a real browser process — for a JS-rendered page or real interaction, use browser_control (desktop app) instead. eval_js runs code in the same sandboxed worker as js_execute.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['fetch_markdown', 'eval_js', 'extract_dom'],
          description: 'Action to perform.',
        },
        url: {
          type: 'string',
          description: 'Target webpage URL for fetch_markdown or extract_dom.',
        },
        script: {
          type: 'string',
          description: 'JavaScript expression or script string to evaluate for eval_js.',
        },
        html: {
          type: 'string',
          description: 'Raw HTML string to parse or extract DOM elements from.',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const { action, url = '', script = '', html = '' } = args

    switch (action) {
      case 'fetch_markdown': {
        if (!url) {
          return { success: false, error: 'Please provide a "url" to fetch.' }
        }
        return await fetchMarkdown(url)
      }

      case 'eval_js': {
        if (!script) {
          return { success: false, error: 'Please provide a "script" to evaluate.' }
        }
        // Delegates to the real sandbox (Web Worker / Node on desktop) rather
        // than re-implementing an unsandboxed eval — see file header.
        return await jsExecTool.execute({ code: script })
      }

      case 'extract_dom': {
        if (html) {
          return {
            success: true,
            action: 'extract_dom',
            ...extractInteractiveElements(html),
          }
        }
        if (url) {
          const res = await fetchMarkdown(url)
          return {
            success: res.success,
            action: 'extract_dom',
            url,
            interactiveElements: res.interactiveElements || [],
          }
        }
        return { success: false, error: 'Please provide either a "url" or raw "html".' }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: fetch_markdown, eval_js, extract_dom.`,
        }
    }
  },
}
