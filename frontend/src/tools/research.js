/**
 * deep_research — search → fetch top pages in parallel → extract readable text.
 * One tool call instead of N round-trips through the LLM, which is both far
 * faster and much cheaper in tokens than search-then-extract-then-extract.
 */

import { proxyText } from './http'
import { webSearchTool } from './webSearch'

const PER_PAGE_CHARS = 3500
const FETCH_TIMEOUT = 12000

function readable(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,nav,footer,header,aside,iframe,noscript,form,svg').forEach(el => el.remove())
  const main = doc.querySelector('article') || doc.querySelector('main') || doc.body
  const text = (main?.innerText || main?.textContent || '').replace(/\s+/g, ' ').trim()
  return {
    url,
    title: (doc.querySelector('title')?.textContent || '').trim(),
    text: text.slice(0, PER_PAGE_CHARS),
    truncated: text.length > PER_PAGE_CHARS,
  }
}

async function fetchPage(url) {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT))
  try {
    const html = await Promise.race([proxyText(url), timeout])
    const page = readable(html, url)
    return page.text.length > 200 ? page : null // skip JS-only shells
  } catch {
    return null
  }
}

export const researchTool = {
  schema: {
    description:
      'Research a topic on the live web: runs a search, then reads the top result pages in parallel and returns their extracted text with source URLs. ' +
      'Use this for anything requiring current information (news, prices, releases, events, documentation) instead of answering from memory. ' +
      'Prefer this over calling web_search and web_extract separately.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to research' },
        depth: { type: 'number', description: 'How many pages to read (1-5, default 3)' },
      },
      required: ['query'],
    },
  },

  async execute({ query, depth = 3 }) {
    if (!query?.trim()) return { error: 'Empty query' }
    const n = Math.min(Math.max(1, depth | 0), 5)

    const search = await webSearchTool.execute({ query, count: Math.min(n + 2, 8) })
    if (search.error) return search
    if (!search.results?.length) return { query, sources: [], pages: [], note: 'No search results.' }

    // Read candidates concurrently; slow or JS-only pages simply drop out.
    const settled = await Promise.all(search.results.slice(0, n + 2).map(r => fetchPage(r.url)))
    const pages = settled.filter(Boolean).slice(0, n)

    return {
      success: true,
      tool: 'deep_research',
      query,
      engine: search.engine,
      fetched_at: new Date().toISOString(),
      pages: pages.map((p, i) => ({
        n: i + 1,
        title: p.title || search.results[i]?.title || p.url,
        url: p.url,
        content: p.text,
      })),
      // Everything the search surfaced, even pages we could not read —
      // the model can still cite them or ask to extract one specifically.
      sources: search.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
    }
  },
}
