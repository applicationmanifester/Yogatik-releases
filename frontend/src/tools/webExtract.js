// Web content extraction via CORS proxy
import { proxyText } from './http'
import { extractReadable } from './readability'

const EXTRACT_CACHE = new Map()
const EXTRACT_CACHE_TTL = 10 * 60_000 // 10 minutes
const FETCH_TIMEOUT_MS = 5000

export const webExtractTool = {
  schema: {
    description: 'Read a specific web page and return its main article text, with title, author and publication date. Use when the user gives a URL, or to read one result from web_search in full. Fetches STATIC HTML only — it does not run JavaScript, so single-page apps and login-gated pages come back empty; for those use browser_control (desktop app), which renders the page in a real browser.',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'Web page URL' },
      max_chars: { type: 'number', description: 'Maximum characters to return (default 8000)' },
    }, required: ['url'] },
  },
  async execute({ url, max_chars = 8000 }) {
    if (!/^https?:\/\//i.test(url || '')) return { success: false, error: 'Provide a full http(s) URL' }
    if (url.includes('news.google.com/rss/articles/')) {
      return {
        success: false,
        error: 'Google News redirect links cannot be extracted directly. Use web_search or provide the publisher direct URL.',
        url,
      }
    }

    const cleanUrl = url.trim()
    const targetChars = Math.min(Math.max(1000, max_chars | 0), 20000)
    const cacheKey = `${cleanUrl}_${targetChars}`
    const cached = EXTRACT_CACHE.get(cacheKey)
    if (cached && (Date.now() - cached.ts) < EXTRACT_CACHE_TTL) {
      return { ...cached.data, cached: true }
    }

    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Fetch timeout')), FETCH_TIMEOUT_MS))
      const html = await Promise.race([proxyText(cleanUrl), timeout])
      const page = extractReadable(html, { maxChars: targetChars })
      if (!page.text || page.text.length < 100) {
        const canRender = typeof window !== 'undefined' && !!window.__YOGATIK_BROWSER__
        return {
          success: false,
          error: 'No readable text found — the page is probably JavaScript-only or behind a paywall.',
          url,
          title: page.title || undefined,
          can_render: canRender,
          next_step: canRender
            ? 'This page renders with JavaScript, which this tool cannot run. Use browser_control: navigate to the url, then action "read" to get the rendered page.'
            : 'This page renders with JavaScript. Reading it needs the Yogatik Desktop app, which can run the page in a real browser. Say so plainly rather than guessing at the content.',
        }
      }
      const out = {
        success: true, tool: 'web_extract', url,
        title: page.title,
        published: page.published || undefined,
        author: page.author || undefined,
        site: page.site || undefined,
        text: page.text,
        words: page.words,
        truncated: page.truncated,
        tables: page.tables || undefined,
        code_blocks: page.code_blocks || undefined,
        json_ld: page.json_ld || undefined,
        images: page.images || undefined,
      }
      if (EXTRACT_CACHE.size > 150) {
        const firstKey = EXTRACT_CACHE.keys().next().value
        EXTRACT_CACHE.delete(firstKey)
      }
      EXTRACT_CACHE.set(cacheKey, { data: out, ts: Date.now() })
      return out
    } catch (e) {
      return { success: false, error: `Could not fetch the page: ${e.message}`, url }
    }
  }
}
