// Web content extraction via CORS proxy
import { proxyText } from './http'
import { extractReadable } from './readability'

export const webExtractTool = {
  schema: {
    description: 'Read a specific web page and return its main article text, with title, author and publication date. Use when the user gives a URL, or to read one result from web_search in full.',
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
        return {
          success: false,
          error: 'No readable text found — the page is probably JavaScript-only or behind a paywall.',
          url, title: page.title,
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
      }
    } catch (e) {
      return { success: false, error: `Could not fetch the page: ${e.message}`, url }
    }
  }
}
