/**
 * Web search — Brave Search API when a key is configured, otherwise the
 * keyless DuckDuckGo Lite endpoint. Both go through the CORS proxy.
 */

import { proxyFetch, proxyText, proxyJson } from './http'
import { getSetting } from '../db'
import { newsParams, localeSnapshot } from '../locale'
import { searchLocalIndex } from './localIndexEngine.js'

const MAX_RESULTS = 12

const FRESHNESS = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }

export function sanitizeSearchQuery(query = '') {
  let q = String(query || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Clean conversational leading phrases that degrade search engine accuracy
  const conversationalLead = /^(?:can you (?:please )?(?:give|tell|show|write|find|provide|give me|tell me)(?: a| an| the)?|please (?:tell|give|show|find|write)(?: me)?|what (?:is|are|was|were) (?:the )?|tell me (?:about )?(?:the )?|give me (?:a |the )?|do you know (?:about )?|i want (?:a |to know )?|search for (?:a |the )?)\s+/i
  if (conversationalLead.test(q)) {
    const stripped = q.replace(conversationalLead, '').trim()
    if (stripped.length >= 3) q = stripped
  }

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

const NEWS_CACHE = new Map()
const NEWS_CACHE_TTL = 5 * 60_000 // 5 minutes
let rss2jsonCooldownUntil = 0

function parseGoogleNewsXml(xml, count) {
  if (!xml || typeof xml !== 'string') return []
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const items = [...doc.querySelectorAll('item')].slice(0, count)
    return items.map(item => ({
      title: (item.querySelector('title')?.textContent || '').replace(/<[^>]+>/g, '').trim(),
      url: (item.querySelector('link')?.textContent || item.querySelector('guid')?.textContent || '').trim(),
      snippet: (item.querySelector('description')?.textContent || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
      published: item.querySelector('pubDate')?.textContent || undefined,
      engine: 'google_news',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** Google News RSS Search — free keyless real-time news search via direct proxy & rss2json fallback */
async function googleNewsSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    if (!cleanQ) return []

    // 1. Check in-memory news cache (0ms instant return, avoids hitting external APIs repeatedly)
    const normKey = cleanQ.toLowerCase()
    const cached = NEWS_CACHE.get(normKey)
    if (cached && (Date.now() - cached.ts) < NEWS_CACHE_TTL) {
      return cached.results.slice(0, count)
    }

    const L = localeSnapshot()
    const { hl, gl, ceid } = newsParams(L.locale, L.region)
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQ)}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`

    let results = []

    // 2. Try direct CORS proxy first if available (bypasses api.rss2json.com rate limits completely)
    try {
      const xml = await proxyText(rssUrl, { timeout: 4000 })
      results = parseGoogleNewsXml(xml, count)
    } catch {
      results = []
    }

    // 3. If direct proxy returned empty/failed and rss2json is not in 429 cooldown:
    if (!results.length && Date.now() > rss2jsonCooldownUntil) {
      try {
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(4000) })
        if (res.status === 429) {
          // Rate limited: back off for 15 minutes to stop console errors
          rss2jsonCooldownUntil = Date.now() + 15 * 60_000
        } else if (res.ok) {
          const resp = await res.json()
          if (resp?.items?.length) {
            results = resp.items.slice(0, count).map(item => ({
              title: (item.title || '').trim(),
              url: (item.link || '').trim(),
              snippet: (item.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
              published: item.pubDate || undefined,
              engine: 'google_news',
            })).filter(r => r.url && r.title)
          }
        }
      } catch {
        /* skip */
      }
    }

    if (results.length) {
      if (NEWS_CACHE.size > 50) {
        const firstKey = NEWS_CACHE.keys().next().value
        NEWS_CACHE.delete(firstKey)
      }
      NEWS_CACHE.set(normKey, { results, ts: Date.now() })
    }

    return results
  } catch {
    return []
  }
}

/** ArXiv API Search — free keyless academic & scientific paper search */
async function arxivSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const rssUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQ)}&max_results=${count}`
    if (Date.now() > rss2jsonCooldownUntil) {
      try {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`
        const resp = await fetch(url, { signal: AbortSignal.timeout(4000) })
        if (resp.status === 429) {
          rss2jsonCooldownUntil = Date.now() + 15 * 60_000
        } else if (resp.ok) {
          const data = await resp.json()
          if (data?.items?.length) {
            return data.items.slice(0, count).map(item => ({
              title: (item.title || '').replace(/\s+/g, ' ').trim(),
              url: (item.link || item.guid || '').trim(),
              snippet: (item.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
              published: item.pubDate || undefined,
              engine: 'arxiv',
            })).filter(r => r.url && r.title)
          }
        }
      } catch {}
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

/** OpenAlex Search — 100% free, keyless academic paper search with native browser CORS and citation counts */
async function openAlexSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(cleanQ)}&per_page=${count}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!resp.ok) return []
    const data = await resp.json()
    return (data?.results || []).slice(0, count).map(p => ({
      title: `${p.title || p.display_name || ''} (${p.publication_year || '?'}, ${p.cited_by_count || 0} cites)`,
      url: p.doi || p.primary_location?.landing_page_url || `https://openalex.org/${p.id}`,
      snippet: p.abstract_inverted_index ? Object.keys(p.abstract_inverted_index).slice(0, 35).join(' ') : (p.display_name || ''),
      published: p.publication_year ? `${p.publication_year}` : undefined,
      engine: 'openalex',
    })).filter(r => r.title && r.url)
  } catch {
    return []
  }
}

/** Semantic Scholar — academic paper search (desktop direct or OpenAlex fallback for browser CORS) */
async function semanticScholarSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const isElectron = typeof window !== 'undefined' && !!window.__YOGATIK_ELECTRON__
    if (isElectron) {
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(cleanQ)}&limit=${count}&fields=title,url,abstract,year,citationCount,influentialCitationCount`
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null)
      if (resp && resp.ok) {
        const data = await resp.json()
        return (data?.data || []).slice(0, count).map(p => ({
          title: `${p.title || ''} (${p.year || '?'}, ${p.citationCount || 0} cites)`,
          url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
          snippet: (p.abstract || '').slice(0, 250),
          published: p.year ? `${p.year}` : undefined,
          engine: 'semantic_scholar',
        })).filter(r => r.title && r.url)
      }
    }
    // In web browser: OpenAlex provides native CORS support without triggering CORS block or 429 cascades
    return await openAlexSearch(cleanQ, count)
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

/** Hacker News Algolia Search — keyless, fast, open CORS tech/programming/startup search */
async function hackerNewsSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(cleanQ)}&hitsPerPage=${count}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) }).catch(() => proxyJson(url))
    const data = resp && typeof resp.json === 'function' ? await resp.json() : resp
    return (data?.hits || []).map(h => ({
      title: `${h.title || h.story_title || 'HN Discussion'} (${h.points || 0} pts, ${h.num_comments || 0} comments)`,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      snippet: (h.story_text || h.comment_text || h.title || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
      published: h.created_at || undefined,
      engine: 'hackernews',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** Europe PMC Search — keyless, open CORS biomedical & life sciences research search */
async function europePmcSearch(query, count) {
  try {
    const cleanQ = sanitizeSearchQuery(query)
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(cleanQ)}&format=json&pageSize=${count}&resultType=core`
    const resp = await fetch(url, { signal: AbortSignal.timeout(7000) }).catch(() => proxyJson(url))
    const data = resp && typeof resp.json === 'function' ? await resp.json() : resp
    const items = data?.resultList?.result || []
    return items.map(item => ({
      title: (item.title || '').replace(/\.$/, '').replace(/\s+/g, ' ').trim(),
      url: item.doi ? `https://doi.org/${item.doi}` : (item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` : `https://europepmc.org/article/MED/${item.id}`),
      snippet: (item.abstractText || item.authorString || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 250),
      published: item.pubYear ? `${item.pubYear}` : (item.firstPublicationDate || undefined),
      engine: 'europe_pmc',
    })).filter(r => r.url && r.title)
  } catch {
    return []
  }
}

/** Extract clean publisher domain from result URL */
export function extractResultDomain(urlStr = '') {
  try {
    return new URL(urlStr).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

/**
 * Intent-based smart engine routing — picks the optimal engine mix per query.
 */
export function detectSearchIntent(query) {
  const q = (query || '').toLowerCase()
  if (/\b(movie|film|cinema|trailer|actor|actress|director|hollywood|bollywood|tollywood|kollywood|box office|imdb|rotten tomatoes|letterboxd|netflix|ott|anime|manga|game|gameplay|soundtrack|album|song|music)\b/.test(q)) return 'entertainment'
  if (/\b(disease|symptom|drug|therapy|clinical|trial|vaccine|patient|treatment|cancer|cardiology|biology|gene|crispr|pharma|healthcare|medicine|medical|dosage|infection|surgery|syndrome)\b/.test(q)) return 'medical'
  if (/\b(stock|stocks|crypto|bitcoin|ethereum|market|btc|eth|nasdaq|dow|s&p|dividend|fed|inflation|interest rate|quarterly|earnings|revenue|valuation|investing|shares|fund|etf)\b/.test(q)) return 'finance'
  if (/\b(code|coding|debug|error|exception|function|api|library|npm|pip|package|github|repo|repository|syntax|compile|runtime|stack trace|import|module|rust|python|typescript|javascript|golang|docker|kubernetes|linux)\b/.test(q)) return 'code'
  if (/\b(paper|research|study|journal|ieee|arxiv|conference|citation|doi|abstract|methodology|hypothesis|experiment|findings|literature)\b/.test(q)) return 'academic'
  if (/\b(news|latest|today|yesterday|breaking|announced|released|launched|update|election|crisis|event|war|summit|president|minister)\b/.test(q)) return 'news'
  if (/\b(tech|technology|ai|llm|neural|openai|deepseek|claude|gemini|hardware|gpu|nvidia|benchmark|silicon|chips?|semiconductor|startup|hackernews)\b/.test(q)) return 'tech'
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
export function mergeResults(lists, count) {
  const byUrl = new Map()
  lists.forEach((list, rank) => {
    (list || []).forEach((r, i) => {
      if (!r?.url) return
      const key = r.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
      const existing = byUrl.get(key)
      const isPrivate = Boolean(r.private)
      const domain = r.domain || extractResultDomain(r.url)
      if (existing) {
        existing.agree += isPrivate ? 5 : 1
        if (!existing.engines.includes(r.engine)) existing.engines.push(r.engine)
        if (!existing.snippet && r.snippet) existing.snippet = r.snippet
      } else {
        byUrl.set(key, {
          ...r,
          domain,
          agree: isPrivate ? 5 : 1,
          engines: [r.engine],
          position: (isPrivate ? 0 : rank * 100) + i,
        })
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
    // 1. First attempt: Official DuckDuckGo Instant Answer JSON API (fast, reliable, no bot walls)
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&format=json&no_html=1&skip_disambig=0`
      const data = await proxyJson(apiUrl)
      const results = []
      if (data) {
        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || cleanQ,
            url: data.AbstractURL,
            snippet: data.AbstractText,
            engine: 'duckduckgo',
          })
        }
        const extractTopics = (topics) => {
          if (!Array.isArray(topics)) return
          for (const t of topics) {
            if (t.Topics) extractTopics(t.Topics)
            else if (t.FirstURL && (t.Text || t.Result)) {
              const raw = t.Text || t.Result || ''
              results.push({
                title: raw.split(' - ')[0].replace(/<[^>]+>/g, '').trim() || cleanQ,
                url: t.FirstURL,
                snippet: raw.replace(/<[^>]+>/g, '').trim(),
                engine: 'duckduckgo',
              })
            }
          }
        }
        if (data.RelatedTopics) extractTopics(data.RelatedTopics)
        if (data.Results) extractTopics(data.Results)
      }
      if (results.length > 0) {
        return results.slice(0, count)
      }
    } catch {
      // API fallback, continue to scrape attempts if needed
    }

    // 2. Secondary fallback: HTML endpoints with polite timeout
    const L = localeSnapshot()
    const kl = L.region ? `&kl=${encodeURIComponent(`${L.region.toLowerCase()}-${String(L.locale).split('-')[0].toLowerCase()}`)}` : ''
    const html = await proxyText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ)}${kl}`)
      .catch(() => proxyText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(cleanQ)}${kl}`))
      .catch(() => '')
    if (!html) return []
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

const SEARCH_CACHE = new Map()
const SEARCH_CACHE_TTL = 5 * 60_000 // 5 minutes

function withFastTimeout(promise, ms = 2200) {
  let timer
  // Ensure the underlying promise has its own catch handler so it never triggers an unhandled promise rejection
  const safePromise = Promise.resolve(promise).catch(() => [])
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => resolve([]), ms)
  })
  return Promise.race([
    safePromise.then(res => { clearTimeout(timer); return res }),
    timeoutPromise
  ]).catch(() => [])
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
    const { count = 5, recency = 'any', site, engines = 'all', fast = false } = (typeof args === 'object' && args !== null) ? args : {}
    const n = Math.min(Math.max(1, count | 0), MAX_RESULTS)
    if (!query) return { error: 'Empty query' }

    // Auto-infer recency bias when not explicitly provided
    let effectiveRecency = recency
    if (effectiveRecency === 'any') {
      if (/\b(today|yesterday|tonight|this morning)\b/i.test(query)) effectiveRecency = 'day'
      else if (/\b(this week|recent days|latest|breaking)\b/i.test(query)) effectiveRecency = 'week'
      else if (/\b(this month|recently|newest)\b/i.test(query)) effectiveRecency = 'month'
      else if (/\b(this year|2024|2025|2026)\b/i.test(query)) effectiveRecency = 'year'
    }

    // Instant Cache Hit check (0ms latency for repeated or speculatively pre-fetched queries)
    const normKey = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const cacheKey = `${normKey}_${effectiveRecency}_${site || ''}`
    const cached = SEARCH_CACHE.get(cacheKey)
    if (cached && (Date.now() - cached.ts) < SEARCH_CACHE_TTL) {
      const sliced = (cached.data.results || []).slice(0, n)
      return { ...cached.data, results: sliced, count: sliced.length, cached: true }
    }

    const braveKey = await getSetting('apikey_brave')
    const wide = engines === 'all' && !site
    const intent = detectSearchIntent(query)

    const tasks = []
    const defaultTimeout = fast ? 1200 : 2500

    // Query private on-device local index in parallel (<10ms response)
    tasks.push(
      withFastTimeout(
        searchLocalIndex({ query, count: Math.min(n, 3), domain: site })
          .then(res => (res?.results || []).map(r => ({
            title: `[Private Memory] ${r.title}`,
            url: r.url,
            snippet: r.snippet,
            published: r.published,
            engine: 'local_index',
            private: true,
          }))),
        fast ? 800 : 1500
      )
    )

    if (braveKey) {
      tasks.push(withFastTimeout(braveSearch(site ? `${query} site:${site}` : query, braveKey, n, effectiveRecency), defaultTimeout))
    }
    tasks.push(withFastTimeout(duckDuckGoSearch(ddgQuery(query, effectiveRecency, site), n), defaultTimeout))
    if (wide) {
      // Smart engine routing based on detected intent
      if (intent === 'medical') {
        tasks.push(withFastTimeout(europePmcSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(openAlexSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(googleNewsSearch(query, 3), fast ? 1100 : 2200))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'tech') {
        tasks.push(withFastTimeout(hackerNewsSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(githubSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(googleNewsSearch(query, 3), fast ? 1100 : 2200))
        tasks.push(withFastTimeout(stackOverflowSearch(query, 2), defaultTimeout))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'finance') {
        tasks.push(withFastTimeout(googleNewsSearch(query, 4), fast ? 1100 : 2200))
        tasks.push(withFastTimeout(redditSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'code' || intent === 'howto') {
        tasks.push(withFastTimeout(githubSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(stackOverflowSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(hackerNewsSearch(query, 2), defaultTimeout))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'academic') {
        tasks.push(withFastTimeout(arxivSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(crossrefSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(semanticScholarSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(europePmcSearch(query, 2), defaultTimeout))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'entertainment') {
        tasks.push(withFastTimeout(googleNewsSearch(query, 4), fast ? 1500 : 2500))
        tasks.push(withFastTimeout(redditSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'news') {
        tasks.push(withFastTimeout(googleNewsSearch(query, 4), fast ? 1100 : 2200))
        if (!fast) tasks.push(withFastTimeout(redditSearch(query, 2), 2000))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else if (intent === 'community') {
        tasks.push(withFastTimeout(redditSearch(query, 3), defaultTimeout))
        tasks.push(withFastTimeout(stackOverflowSearch(query, 2), defaultTimeout))
        tasks.push(withFastTimeout(googleNewsSearch(query, 2), fast ? 1100 : 2200))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
      } else {
        // General: wide net across all general web search engines
        tasks.push(withFastTimeout(googleNewsSearch(query, 3), fast ? 1100 : 2200))
        tasks.push(withFastTimeout(wikipediaSearch(query, 2), fast ? 900 : 1500))
        if (!fast) {
          tasks.push(withFastTimeout(marginaliaSearch(query, 3), 2000))
          tasks.push(withFastTimeout(githubSearch(query, 2), 2000))
          tasks.push(withFastTimeout(hackerNewsSearch(query, 2), 2000))
          if (/\b(paper|arxiv|study|research|algorithm|theorem|science|physics|academic|scholar)\b/i.test(query)) {
            tasks.push(withFastTimeout(semanticScholarSearch(query, 2), 2000))
            tasks.push(withFastTimeout(arxivSearch(query, 2), 2000))
            tasks.push(withFastTimeout(crossrefSearch(query, 2), 2000))
          }
          if (/\b(review|opinion|problem|issue|reddit|forum|fix|discussion)\b/i.test(query)) {
            tasks.push(withFastTimeout(redditSearch(query, 2), 2000))
            tasks.push(withFastTimeout(stackOverflowSearch(query, 2), 2000))
          }
        }
      }
    }

    try {
      // Early-exit stream racing: Return as soon as sufficient results arrive
      const lists = []
      let completed = 0
      const total = tasks.length

      await new Promise((resolve) => {
        let resolved = false
        const finish = () => {
          if (resolved) return
          resolved = true
          clearTimeout(timer)
          resolve()
        }

        // Hard cap at 1600ms for fast/live mode, 2600ms for normal mode
        const timer = setTimeout(finish, fast ? 1600 : 2600)

        tasks.forEach(async (taskPromise) => {
          try {
            const res = await taskPromise
            if (Array.isArray(res) && res.length > 0) {
              lists.push(res)
            }
          } catch {}
          completed++

          // In fast mode, a single solid engine response with >= 2 results can exit immediately
          if (fast && lists.length >= 1 && lists[0].length >= 2) {
            finish()
            return
          }

          // Early exit if we have >= n results from >= 2 engines, or all done
          if (lists.length >= 2) {
            const merged = mergeResults(lists, n)
            if (merged.length >= n || completed === total) {
              finish()
            }
          } else if (completed === total) {
            finish()
          }
        })
      })

      const results = mergeResults(lists, n)
      if (!results.length) {
        return { query, results: [], note: 'No results found. Try different wording or fewer filters.' }
      }
      const used = [...new Set(results.flatMap(r => r.engines || []))]
      const out = {
        query, recency, site, intent,
        engine: used.join('+') || (braveKey ? 'brave' : 'duckduckgo'),
        engines_queried: tasks.length,
        count: results.length,
        results,
      }
      // Populate LRU cache
      if (SEARCH_CACHE.size > 100) {
        const firstKey = SEARCH_CACHE.keys().next().value
        SEARCH_CACHE.delete(firstKey)
      }
      SEARCH_CACHE.set(cacheKey, { data: out, ts: Date.now() })
      return out
    } catch (err) {
      return { error: `Search failed: ${err.message}` }
    }
  },
}
