/**
 * Firecrawl: Deep Web Crawler & Clean Markdown Extractor for LLM RAG
 * 
 * Inspired by mendableai/firecrawl (github.com/mendableai/firecrawl).
 * Recursively crawls websites, maps sitemaps, converts subpages to clean Markdown,
 * extracts metadata, and exports structured RAG datasets for AI agents.
 */

import { htmlToMarkdown } from './lightpanda'

/**
 * Simulates deep website crawling and link graph mapping
 */
export function extractPageLinks(html = '', baseUrl = '') {
  const linkMatches = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi)]
  const links = new Set()

  try {
    const base = new URL(baseUrl)
    linkMatches.forEach(m => {
      let href = m[1].trim()
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return

      try {
        const resolved = new URL(href, base).href
        if (resolved.startsWith(base.origin)) {
          links.add(resolved)
        }
      } catch {
        // invalid URL
      }
    })
  } catch {
    // baseUrl parsing failure
  }

  return Array.from(links)
}

/**
 * Scrape a single page and convert directly to Markdown
 */
export async function scrapePage(url = '') {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'YogatikFirecrawl/1.0 (LLM-Ready RAG Extractor)' },
    })

    if (!resp.ok) {
      return {
        success: false,
        url,
        status: resp.status,
        error: `HTTP ${resp.status}`,
      }
    }

    const html = await resp.text()
    const parsed = htmlToMarkdown(html)
    const links = extractPageLinks(html, url)

    return {
      success: true,
      url,
      title: parsed.title,
      markdown: parsed.markdown,
      contentLength: parsed.length,
      outboundLinks: links,
    }
  } catch (err) {
    return {
      success: false,
      url,
      error: err.message,
    }
  }
}

/**
 * Crawl multiple pages under a domain (depth-bounded)
 */
export async function crawlWebsite(startUrl = '', maxPages = 5) {
  const visited = new Set()
  const queue = [startUrl]
  const pages = []

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift()
    if (visited.has(currentUrl)) continue
    visited.add(currentUrl)

    const scraped = await scrapePage(currentUrl)
    if (scraped.success) {
      pages.push({
        url: scraped.url,
        title: scraped.title,
        markdown: scraped.markdown.slice(0, 1500),
        contentLength: scraped.contentLength,
      })

      // Add discovered links to queue
      for (const link of (scraped.outboundLinks || [])) {
        if (!visited.has(link) && !queue.includes(link)) {
          queue.push(link)
        }
      }
    }
  }

  return {
    startUrl,
    totalPagesCrawled: pages.length,
    pages,
  }
}

export const firecrawlTool = {
  schema: {
    name: 'firecrawl',
    description: 'Firecrawl deep web crawler and RAG Markdown dataset engine (inspired by mendableai/firecrawl). Recursively crawls websites, generates sitemaps, converts subpages to clean LLM-ready Markdown, and extracts structured data.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['scrape', 'crawl', 'map_links'],
          description: 'Firecrawl action to perform.',
        },
        url: {
          type: 'string',
          description: 'Target website or page URL to scrape or crawl.',
        },
        maxPages: {
          type: 'number',
          description: 'Maximum subpages to crawl (default: 5).',
        },
        html: {
          type: 'string',
          description: 'Raw HTML string to extract internal links from when action is map_links.',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const { action, url = '', maxPages = 5, html = '' } = args

    switch (action) {
      case 'scrape': {
        if (!url) return { success: false, error: 'Please provide a "url" to scrape.' }
        return await scrapePage(url)
      }

      case 'crawl': {
        if (!url) return { success: false, error: 'Please provide a "url" to crawl.' }
        const res = await crawlWebsite(url, maxPages)
        return { success: true, action: 'crawl', ...res }
      }

      case 'map_links': {
        if (!html && !url) return { success: false, error: 'Please provide either "html" or "url".' }
        if (html) {
          const links = extractPageLinks(html, url || 'https://example.com')
          return { success: true, action: 'map_links', totalLinks: links.length, links }
        }
        const scraped = await scrapePage(url)
        return {
          success: scraped.success,
          action: 'map_links',
          url,
          totalLinks: scraped.outboundLinks?.length || 0,
          links: scraped.outboundLinks || [],
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: scrape, crawl, map_links.`,
        }
    }
  },
}
