/**
 * Web search — Brave Search API when a key is configured, otherwise the
 * keyless DuckDuckGo Lite endpoint. Both go through the CORS proxy.
 */

import { proxyFetch, proxyText, proxyJson } from './http'
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
    engine: 'brave',
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
/** Wikipedia is often the best single answer for definitional queries. */
async function wikipediaSearch(query, count) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${count}&format=json&origin=*`
    const data = await fetch(url).then(r => r.json()).catch(() => proxyJson(url))
    return (data?.query?.search || []).map(r => ({
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      snippet: (r.snippet || '').replace(/<[^>]+>/g, ''),
      engine: 'wikipedia',
    }))
  } catch {
    return []
  }
}

/** Google News RSS Search — free keyless real-time news search via native RSS JSON */
async function googleNewsSearch(query, count) {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
    const resp = await fetch(url).then(r => r.json()).catch(() => null)
    if (resp?.items?.length) {
      return resp.items.slice(0, count).map(item => ({
        title: (item.title || '').trim(),
        url: (item.link || '').trim(),
        snippet: (item.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
        published: item.pubDate || undefined,
        engine: 'google_news',
      })).filter(r => r.url && r.title)
    }
    // Fallback: proxyText RSS parse
    const xml = await proxyText(rssUrl)
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const items = [...doc.querySelectorAll('item')].slice(0, count)
    return items.map(item => ({
      title: (item.querySelector('title')?.textContent || '').trim(),
      url: (item.querySelector('link')?.textContent || '').trim(),
      snippet: (item.querySelector('description')?.textContent || '').replace(/<[^>]+>/g, '').trim().slice(0, 250),
      published: item.querySelector('pubDate')?.textContent || undefined,
      engine: 'google_news',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** ArXiv API Search — free keyless academic & scientific paper search */
async function arxivSearch(query, count) {
  try {
    const rssUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${count}`
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
    const resp = await fetch(url).then(r => r.json()).catch(() => null)
    if (resp?.items?.length) {
      return resp.items.slice(0, count).map(item => ({
        title: (item.title || '').replace(/\s+/g, ' ').trim(),
        url: (item.link || item.guid || '').trim(),
        snippet: (item.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
        published: item.pubDate || undefined,
        engine: 'arxiv',
      })).filter(r => r.url && r.title)
    }
    const xml = await proxyText(rssUrl)
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const entries = [...doc.querySelectorAll('entry')].slice(0, count)
    return entries.map(e => ({
      title: (e.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim(),
      url: (e.querySelector('id')?.textContent || '').trim(),
      snippet: (e.querySelector('summary')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 250),
      published: e.querySelector('published')?.textContent || undefined,
      engine: 'arxiv',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** Crossref Search — free keyless academic publication search */
async function crossrefSearch(query, count) {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${count}`
    const data = await proxyJson(url)
    const items = data?.message?.items || []
    return items.map(item => ({
      title: Array.isArray(item.title) ? item.title[0] : (item.title || ''),
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      snippet: item.abstract ? item.abstract.replace(/<[^>]+>/g, '').slice(0, 250) : (item.publisher || ''),
      published: item.created?.['date-time'] || undefined,
      engine: 'crossref',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** Reddit JSON Search — free keyless community & opinion search */
async function redditSearch(query, count) {
  try {
    const data = await proxyJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${count}`)
    const children = data?.data?.children || []
    return children.map(c => {
      const p = c.data
      return {
        title: p.title || '',
        url: `https://www.reddit.com${p.permalink}`,
        snippet: (p.selftext || p.title || '').slice(0, 250),
        engine: 'reddit',
      }
    }).filter(r => r.url && r.title)
  } catch {
    return []
  }
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
  try {
    const html = await proxyText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)
      .catch(() => proxyText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`))
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const rows = [...doc.querySelectorAll('a.result__url, a.result-link, a.result__a')]
    const snippets = [...doc.querySelectorAll('.result__snippet, td.result-snippet')]
    return rows.slice(0, count).map((a, i) => {
      let url = a.getAttribute('href') || ''
      const m = url.match(/[?&]uddg=([^&]+)/)
      if (m) url = decodeURIComponent(m[1])
      if (url.startsWith('//')) url = 'https:' + url
      return {
        title: (a.textContent || '').trim(),
        url,
        snippet: (snippets[i]?.textContent || '').replace(/\s+/g, ' ').trim(),
        engine: 'duckduckgo',
      }
    }).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

export const webSearchTool = {
  schema: {
    description: 'Search the live web across 8 independent free indexes (DuckDuckGo, Google News, Wikipedia, Marginalia, ArXiv, Crossref, Reddit, and Brave), merged and deduplicated. Multi-engine agreement increases result rank.',
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

    const tasks = []
    if (braveKey) {
      tasks.push(braveSearch(site ? `${query} site:${site}` : query, braveKey, n, recency).catch(() => []))
    }
    tasks.push(duckDuckGoSearch(ddgQuery(query, recency, site), n).catch(() => []))
    if (wide) {
      tasks.push(googleNewsSearch(query, 3).catch(() => []))
      tasks.push(wikipediaSearch(query, 2).catch(() => []))
      tasks.push(marginaliaSearch(query, 3).catch(() => []))
      if (/paper|arxiv|study|research|algorithm|model|code|math|science|physics|ai/i.test(query)) {
        tasks.push(arxivSearch(query, 2).catch(() => []))
        tasks.push(crossrefSearch(query, 2).catch(() => []))
      }
      if (/review|opinion|problem|issue|reddit|forum|fix|discussion/i.test(query)) {
        tasks.push(redditSearch(query, 2).catch(() => []))
      }
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
