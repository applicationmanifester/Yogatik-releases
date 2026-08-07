/**
 * Web search — Brave Search API when a key is configured, otherwise the
 * keyless DuckDuckGo Lite endpoint. Both go through the CORS proxy.
 */

import { proxyFetch, proxyText } from './http'
import { getSetting } from '../db'

const MAX_RESULTS = 8

async function braveSearch(query, key, count) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`
  const resp = await proxyFetch(url, {
    credentials: true,
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
  })
  if (!resp.ok) throw new Error(`Brave search failed (${resp.status})`)
  const data = await resp.json()
  return (data.web?.results || []).slice(0, count).map(r => ({
    title: r.title,
    url: r.url,
    snippet: (r.description || '').replace(/<[^>]+>/g, ''),
  }))
}

async function duckDuckGoSearch(query, count) {
  const html = await proxyText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = [...doc.querySelectorAll('a.result-link')]
  const snippets = [...doc.querySelectorAll('td.result-snippet')]
  return rows.slice(0, count).map((a, i) => {
    let url = a.getAttribute('href') || ''
    // DDG wraps targets as /l/?uddg=<encoded>
    const m = url.match(/[?&]uddg=([^&]+)/)
    if (m) url = decodeURIComponent(m[1])
    if (url.startsWith('//')) url = 'https:' + url
    return {
      title: a.textContent.trim(),
      url,
      snippet: (snippets[i]?.textContent || '').replace(/\s+/g, ' ').trim(),
    }
  }).filter(r => r.url && r.title)
}

export const webSearchTool = {
  schema: {
    description: 'Search the web for current information, news, facts, or documentation. Returns ranked results with titles, URLs and snippets. Use web_extract afterwards to read a specific result in full.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: `Number of results (1-${MAX_RESULTS}, default 5)` },
      },
      required: ['query'],
    },
  },
  async execute({ query, count = 5 }) {
    const n = Math.min(Math.max(1, count | 0), MAX_RESULTS)
    if (!query?.trim()) return { error: 'Empty query' }

    const braveKey = await getSetting('apikey_brave')
    try {
      const results = braveKey
        ? await braveSearch(query, braveKey, n)
        : await duckDuckGoSearch(query, n)

      if (!results.length) return { query, results: [], note: 'No results found.' }
      return { query, engine: braveKey ? 'brave' : 'duckduckgo', count: results.length, results }
    } catch (err) {
      return { error: `Search failed: ${err.message}` }
    }
  },
}
