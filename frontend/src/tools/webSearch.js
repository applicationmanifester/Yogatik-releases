/**
 * Web search — Brave Search API when a key is configured, otherwise the
 * keyless DuckDuckGo Lite endpoint. Both go through the CORS proxy.
 */

import { proxyFetch, proxyText } from './http'
import { getSetting } from '../db'

const MAX_RESULTS = 8

const FRESHNESS = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }

async function braveSearch(query, key, count, recency) {
  const fresh = FRESHNESS[recency] ? `&freshness=${FRESHNESS[recency]}` : ''
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}${fresh}`
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
    published: r.page_age || r.age || undefined,
  }))
}

// DuckDuckGo has no freshness parameter, but its query syntax supports both.
function ddgQuery(query, recency, site) {
  let q = query
  if (site) q += ` site:${site.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`
  const days = { day: 1, week: 7, month: 30, year: 365 }[recency]
  if (days) {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    q += ` after:${since}`
  }
  return q
}

/**
 * Marginalia: a genuinely independent crawler that favours non-commercial,
 * text-heavy pages. Complements DuckDuckGo, which mirrors Bing's index.
 */
async function marginaliaSearch(query, count) {
  const html = await proxyText(`https://old-search.marginalia.nu/search?query=${encodeURIComponent(query)}`)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out = []
  for (const card of [...doc.querySelectorAll('.search-result')].slice(0, count)) {
    const a = card.querySelector('a[href^="http"]')
    if (!a) continue
    out.push({
      title: (a.textContent || '').trim(),
      url: a.getAttribute('href'),
      snippet: (card.querySelector('.description, p')?.textContent || '').replace(/\s+/g, ' ').trim(),
      engine: 'marginalia',
    })
  }
  return out
}

/** Wikipedia is often the best single answer for definitional queries. */
async function wikipediaSearch(query, count) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${count}&format=json&origin=*`
  const resp = await fetch(url)
  if (!resp.ok) return []
  const data = await resp.json()
  return (data.query?.search || []).map(r => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: (r.snippet || '').replace(/<[^>]+>/g, ''),
    engine: 'wikipedia',
  }))
}

/** Merge engines, dedupe by URL, and rank by how many engines agreed. */
function mergeResults(lists, count) {
  const byUrl = new Map()
  lists.forEach((list, rank) => {
    list.forEach((r, i) => {
      if (!r?.url) return
      const key = r.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
      const existing = byUrl.get(key)
      if (existing) {
        existing.agree += 1
        existing.engines.push(r.engine)
        if (!existing.snippet && r.snippet) existing.snippet = r.snippet
      } else {
        byUrl.set(key, { ...r, agree: 1, engines: [r.engine], position: rank * 100 + i })
      }
    })
  })
  return [...byUrl.values()]
    .sort((a, b) => (b.agree - a.agree) || (a.position - b.position))
    .slice(0, count)
    .map(({ position, ...r }) => r)
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
      engine: 'duckduckgo',
    }
  }).filter(r => r.url && r.title)
}

export const webSearchTool = {
  schema: {
    description: 'Search the live web across several independent indexes at once (DuckDuckGo, Marginalia, Wikipedia, and Brave if a key is set), merged and deduplicated. Results agreed on by multiple engines rank higher. Use web_extract afterwards to read a specific result in full.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: `Number of results (1-${MAX_RESULTS}, default 5)` },
        recency: {
          type: 'string', enum: ['any', 'day', 'week', 'month', 'year'],
          description: 'Restrict to recently published pages. Use for news and "latest" questions.',
        },
        site: { type: 'string', description: 'Restrict to one domain, e.g. "arxiv.org"' },
        engines: {
          type: 'string', enum: ['all', 'web'],
          description: '"all" (default) queries several independent indexes and merges them; "web" is faster and uses one.',
        },
      },
      required: ['query'],
    },
  },
  async execute({ query, count = 5, recency = 'any', site, engines = 'all' }) {
    const n = Math.min(Math.max(1, count | 0), MAX_RESULTS)
    if (!query?.trim()) return { error: 'Empty query' }

    const braveKey = await getSetting('apikey_brave')
    const wide = engines === 'all' && !site

    // Query several engines at once and merge, the way a metasearch engine
    // does. One index misses things another finds, and agreement between
    // independent indexes is a useful ranking signal on its own.
    const tasks = []
    if (braveKey) {
      tasks.push(braveSearch(site ? `${query} site:${site}` : query, braveKey, n, recency).catch(() => []))
    }
    tasks.push(duckDuckGoSearch(ddgQuery(query, recency, site), n).catch(() => []))
    if (wide) {
      tasks.push(marginaliaSearch(query, 4).catch(() => []))
      tasks.push(wikipediaSearch(query, 2).catch(() => []))
    }

    try {
      const lists = await Promise.all(tasks)
      const results = mergeResults(lists, n)
      if (!results.length) {
        return { query, results: [], note: 'No results found. Try different wording or fewer filters.' }
      }
      const used = [...new Set(results.flatMap(r => r.engines || []))]
      return {
        query, recency, site,
        engine: used.join('+') || (braveKey ? 'brave' : 'duckduckgo'),
        engines_queried: tasks.length,
        count: results.length,
        results,
      }
    } catch (err) {
      return { error: `Search failed: ${err.message}` }
    }
  },
}
