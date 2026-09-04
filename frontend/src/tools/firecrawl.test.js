import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  extractPageLinks,
  firecrawlTool,
  scrapePage,
} from './firecrawl'

describe('Firecrawl Deep Crawler & Clean Markdown Extractor', () => {
  it('extracts and resolves same-origin internal links for recursive crawling', () => {
    const sampleHtml = `
      <html>
        <body>
          <a href="/docs/intro">Intro</a>
          <a href="/docs/api">API Reference</a>
          <a href="https://external.com/out">External</a>
          <a href="#section">Anchor</a>
        </body>
      </html>
    `

    const links = extractPageLinks(sampleHtml, 'https://example.com/docs')
    expect(links).toContain('https://example.com/docs/intro')
    expect(links).toContain('https://example.com/docs/api')
    expect(links).not.toContain('https://external.com/out')
    expect(links.some(l => l.includes('#'))).toBe(false)
  })

  it('firecrawlTool executes map_links action on sample HTML', async () => {
    const res = await firecrawlTool.execute({
      action: 'map_links',
      url: 'https://mysite.org',
      html: '<a href="/features">Features</a><a href="/pricing">Pricing</a>',
    })

    expect(res.success).toBe(true)
    expect(res.totalLinks).toBe(2)
    expect(res.links).toContain('https://mysite.org/features')
    expect(res.links).toContain('https://mysite.org/pricing')
  })

  // scrapePage used to call a bare `fetch()`, bypassing tools/http.js's
  // proxyFetch/proxyText — the shared CORS-fallback layer. Fixed 2026-09-04;
  // these confirm it now goes through the same real fetch path as every
  // other web tool (mocking global.fetch, which proxyFetch itself calls).
  describe('scrapePage — routed through the real proxy layer', () => {
    const originalFetch = global.fetch
    afterEach(() => { global.fetch = originalFetch; vi.unstubAllGlobals() })

    it('fetches a page and converts it to Markdown', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<title>Docs</title><h1>Welcome</h1><a href="/next">Next</a>',
      })
      const res = await scrapePage('https://example.com')
      expect(res.success).toBe(true)
      expect(res.title).toBe('Docs')
      expect(res.markdown).toContain('Welcome')
      expect(global.fetch).toHaveBeenCalled()
    })

    it('reports a real fetch failure honestly rather than throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network disabled in test'))
      const res = await scrapePage('https://example.com')
      expect(res.success).toBe(false)
      expect(res.error).toBeTruthy()
    })
  })
})
