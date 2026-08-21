/**
 * Web search — Brave Search API when a key is configured, otherwise the
 * keyless DuckDuckGo Lite endpoint. Both go through the CORS proxy.
 */

import { proxyFetch, proxyText, proxyJson } from './http'
import { getSetting } from '../db'

const MAX_RESULTS = 12

const FRESHNESS = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }

export function sanitizeSearchQuery(query = '') {
  let q = String(query || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length > 180) {
    const firstSentence = q.split(/[.?!]/)[0]
    q = (firstSentence && firstSentence.length >= 10 && firstSentence.length <= 180) ? firstSentence : q.slice(0, 160)
  }
  return q.trim()
}

async function braveSearch(query, key, count, recency) {
  const cleanQ = sanitizeSearchQuery(query)
  const fresh = FRESHNESS[recency] ? `&freshness=${FRESHNESS[recency]}` : ''
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(cleanQ)}&count=${count}${fresh}`
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
  let q = sanitizeSearchQuery(query)
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
  const cleanQ = sanitizeSearchQuery(query)
  const html = await proxyText(`https://old-search.marginalia.nu/search?query=${encodeURIComponent(cleanQ)}`)
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
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&srlimit=${count}&format=json&origin=*`
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

/** Google News RSS Search — free keyless real-time news search via rss2json */
async function googleNewsSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ)}&hl=en-US&gl=US&ceid=US:en`
    // rss2json converts RSS → JSON without CORS issues (Google News blocks datacenter IPs directly)
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) }).then(r => r.json()).catch(() => null)
    if (!resp?.items?.length) return []
    return resp.items.slice(0, count).map(item => ({
      title: (item.title || '').trim(),
      url: (item.link || '').trim(),
      snippet: (item.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
      published: item.pubDate || undefined,
      engine: 'google_news',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** ArXiv API Search — free keyless academic & scientific paper search */
async function arxivSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const rssUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQ)}&max_results=${count}`
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
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(cleanQ)}&rows=${count}`
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

/** GitHub Public Search — find repos, code, and README snippets (keyless) */
async function githubSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(cleanQ)}&sort=stars&per_page=${count}`
    const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return []
    const data = await resp.json()
    return (data?.items || []).slice(0, count).map(r => ({
      title: `${r.full_name} ⭐${r.stargazers_count}`,
      url: r.html_url,
      snippet: (r.description || '').slice(0, 250),
      published: r.updated_at || undefined,
      engine: 'github',
    }))
  } catch {
    return []
  }
}

/** Semantic Scholar — free keyless academic paper search with citation counts */
async function semanticScholarSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(cleanQ)}&limit=${count}&fields=title,url,abstract,year,citationCount,influentialCitationCount`
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => proxyFetch(url))
    if (!resp.ok) return []
    const data = await resp.json()
    return (data?.data || []).slice(0, count).map(p => ({
      title: `${p.title || ''} (${p.year || '?'}, ${p.citationCount || 0} cites)`,
      url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
      snippet: (p.abstract || '').slice(0, 250),
      published: p.year ? `${p.year}` : undefined,
      engine: 'semantic_scholar',
    })).filter(r => r.title && r.url)
  } catch {
    return []
  }
}

/** StackOverflow/StackExchange Search — programming Q&A with accepted answers */
async function stackOverflowSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(cleanQ)}&site=stackoverflow&pagesize=${count}&filter=default`
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return []
    const data = await resp.json()
    return (data?.items || []).slice(0, count).map(q => ({
      title: `${q.title || ''} [${q.score || 0}↑${q.is_answered ? ' ✓' : ''}]`,
      url: q.link || '',
      snippet: (q.tags || []).join(', '),
      published: q.creation_date ? new Date(q.creation_date * 1000).toISOString() : undefined,
      engine: 'stackoverflow',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/**
 * Intent-based smart engine routing — picks the optimal engine mix per query.
 */
function detectSearchIntent(query) {
  const q = (query || '').toLowerCase()
  if (/\b(code|coding|debug|error|exception|function|api|library|npm|pip|package|github|repo|repository|syntax|compile|runtime|stack trace|import|module)\b/.test(q)) return 'code'
  if (/\b(paper|research|study|journal|ieee|arxiv|conference|citation|doi|abstract|methodology|hypothesis|experiment|findings|literature)\b/.test(q)) return 'academic'
  if (/\b(news|latest|today|yesterday|breaking|announced|released|launched|update|election|crisis|event)\b/.test(q)) return 'news'
  if (/\b(review|opinion|reddit|forum|community|discuss|experience|recommend|best|worst|comparison|vs|versus)\b/.test(q)) return 'community'
  if (/\b(how to|tutorial|guide|learn|example|step by step|setup|install|configure)\b/.test(q)) return 'howto'
  return 'general'
}

/** Reddit JSON Search — free keyless community & opinion search */
async function redditSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const data = await proxyJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(cleanQ)}&limit=${count}`)
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
    const cleanQ = sanitizeSearchQuery(query)
    const html = await proxyText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}`)
      .catch(() => proxyText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(cleanQ)}`))
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
  async execute(args = {}) {
    let rawQuery = typeof args === 'string' ? args : (args?.query ?? args?.q ?? args?.search_query ?? args?.keyword ?? args?.text ?? args?.input ?? args?.terms ?? args?.searchTerm ?? '')
    if (!rawQuery && typeof args === 'object' && args !== null) {
      const firstVal = Object.values(args).find(v => typeof v === 'string' && v.trim())
      if (firstVal) rawQuery = firstVal
    }
    const query = sanitizeSearchQuery(typeof rawQuery === 'string' ? rawQuery.trim() : String(rawQuery || '').trim())
    const { count = 5, recency = 'any', site, engines = 'all' } = (typeof args === 'object' && args !== null) ? args : {}
    const n = Math.min(Math.max(1, count | 0), MAX_RESULTS)
    if (!query) return { error: 'Empty query' }

    const braveKey = await getSetting('apikey_brave')
    const wide = engines === 'all' && !site
    const intent = detectSearchIntent(query)

    const tasks = []
    if (braveKey) {
      tasks.push(braveSearch(site ? `${query} site:${site}` : query, braveKey, n, recency).catch(() => []))
    }
    tasks.push(duckDuckGoSearch(ddgQuery(query, recency, site), n).catch(() => []))
    if (wide) {
      // Smart engine routing based on detected intent
      if (intent === 'code' || intent === 'howto') {
        tasks.push(githubSearch(query, 3).catch(() => []))
        tasks.push(stackOverflowSearch(query, 3).catch(() => []))
        tasks.push(wikipediaSearch(query, 2).catch(() => []))
      } else if (intent === 'academic') {
        tasks.push(arxivSearch(query, 3).catch(() => []))
        tasks.push(crossrefSearch(query, 3).catch(() => []))
        tasks.push(semanticScholarSearch(query, 3).catch(() => []))
        tasks.push(wikipediaSearch(query, 2).catch(() => []))
      } else if (intent === 'news') {
        tasks.push(googleNewsSearch(query, 4).catch(() => []))
        tasks.push(redditSearch(query, 2).catch(() => []))
        tasks.push(wikipediaSearch(query, 2).catch(() => []))
      } else if (intent === 'community') {
        tasks.push(redditSearch(query, 3).catch(() => []))
        tasks.push(stackOverflowSearch(query, 2).catch(() => []))
        tasks.push(googleNewsSearch(query, 2).catch(() => []))
        tasks.push(wikipediaSearch(query, 2).catch(() => []))
      } else {
        // General: wide net across all engines
        tasks.push(googleNewsSearch(query, 3).catch(() => []))
        tasks.push(wikipediaSearch(query, 2).catch(() => []))
        tasks.push(marginaliaSearch(query, 3).catch(() => []))
        tasks.push(githubSearch(query, 2).catch(() => []))
        tasks.push(semanticScholarSearch(query, 2).catch(() => []))
        if (/paper|arxiv|study|research|algorithm|model|code|math|science|physics|ai/i.test(query)) {
          tasks.push(arxivSearch(query, 2).catch(() => []))
          tasks.push(crossrefSearch(query, 2).catch(() => []))
        }
        if (/review|opinion|problem|issue|reddit|forum|fix|discussion/i.test(query)) {
          tasks.push(redditSearch(query, 2).catch(() => []))
          tasks.push(stackOverflowSearch(query, 2).catch(() => []))
        }
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
        query, recency, site, intent,
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
