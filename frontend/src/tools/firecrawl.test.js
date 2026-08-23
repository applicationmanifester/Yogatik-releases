import { describe, it, expect } from 'vitest'
import {
  extractPageLinks,
  firecrawlTool,
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
})
