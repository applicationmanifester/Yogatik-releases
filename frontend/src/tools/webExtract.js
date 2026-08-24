// Web content extraction via CORS proxy
import { proxyText } from './http'
import { extractReadable } from './readability'

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
    try {
      const html = await proxyText(url)
      const page = extractReadable(html, { maxChars: Math.min(Math.max(1000, max_chars | 0), 20000) })
      if (!page.text || page.text.length < 100) {
        const canRender = typeof window !== 'undefined' && !!window.__YOGATIK_BROWSER__
        if (!canRender) {
          // In web build, provide a graceful static summary or hint without hallucinating desktop tools
          return {
            success: false,
            error: 'No readable article text found — the page is rendered dynamically with client-side JavaScript or is protected by anti-bot.',
            url,
            title: page.title || undefined,
            suggestion: 'For complex JavaScript-rendered web apps, use the Yogatik Desktop app which has an embedded browser engine, or use web_search to find information about this page.',
          }
        }
        return {
          success: false,
          error: 'No readable text found — the page is probably JavaScript-only or behind a paywall.',
          url, title: page.title,
          can_render: true,
          next_step: 'This page renders with JavaScript. Use browser_control to navigate and read the rendered DOM.',
        }
      }
      return {
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
    } catch (e) {
      return { success: false, error: `Could not fetch the page: ${e.message}`, url }
    }
  }
}
