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
        // Honest, but a dead end on its own: this tool only ever sees static
        // HTML, and on desktop browser_control CAN render the page. Put the next
        // step in the RESULT — the same trick the youtube tool's transcript_note
        // uses — so the model escalates instead of reporting the content
        // unreadable. Never name a tool the current build does not have.
        const canRender = typeof window !== 'undefined' && !!window.__YOGATIK_BROWSER__
        return {
          success: false,
          error: 'No readable text found — the page is probably JavaScript-only or behind a paywall.',
          url, title: page.title,
          can_render: canRender,
          next_step: canRender
            ? 'This page renders with JavaScript, which this tool cannot run. Use browser_control: ' +
              'navigate to the url, then action "read" to get the rendered page.'
            : 'This page renders with JavaScript. Reading it needs the Yogatik desktop app, which can ' +
              'run the page in a real browser. Say so plainly rather than guessing at the content.',
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
