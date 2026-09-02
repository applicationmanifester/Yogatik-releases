/**
 * deep_research — search → fetch top pages in parallel → extract readable text.
 * One tool call instead of N round-trips through the LLM, which is both far
 * faster and much cheaper in tokens than search-then-extract-then-extract.
 */

import { proxyText } from './http'
import { webSearchTool } from './webSearch'
import { extractReadable } from './readability'
import { chunkText, buildIndex, search as bm25, tokenize } from '../retrieval'

const PER_PAGE_CHARS = 6000      // what the model finally sees, per page
const EXTRACT_CHARS = 36000     // what we keep to rank against the question
const FETCH_TIMEOUT = 4500

const PAGE_CACHE = new Map()
const PAGE_CACHE_TTL = 10 * 60_000

const RESEARCH_CACHE = new Map()
const RESEARCH_CACHE_TTL = 5 * 60_000

/**
 * Search engines want keywords, but the model tends to forward the user's
 * sentence verbatim ("could you find out whether X is still true in 2026?").
 * Stripping the conversational scaffolding measurably improves results.
 */
const FILLER = new Set((
  'what who when where why how is are was were do does did can could would should ' +
  'will please tell me about find out give show explain a an the of for to in on ' +
  'and or i you we my your it its that this these those any some there here'
).split(' '))

export function toSearchQuery(text = '') {
  // Strip future year tokens which break search engine & API term matching
  let cleanedText = String(text || '')
    .replace(/\b(2025|2026|2027|2028)\b/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleanedText.length > 180) {
    const firstSentence = cleanedText.split(/[.?!]/)[0]
    cleanedText = (firstSentence && firstSentence.length >= 10 && firstSentence.length <= 180) ? firstSentence : cleanedText.slice(0, 160)
  }
  const quoted = cleanedText.match(/"[^"]+"/g) || []          // keep phrases intact
  const rest = cleanedText.replace(/"[^"]+"/g, ' ')
  const words = rest
    .replace(/[?!.,;:]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !FILLER.has(w.toLowerCase()))
  const out = [...quoted, ...words].join(' ').trim()
  return out.split(/\s+/).length >= 2 ? out : (cleanedText.trim() || String(text || '').trim().slice(0, 140))
}

/**
 * Decompose a multi-part query into 2-3 focused sub-queries for parallel search.
 */
export function decomposeQuery(query = '') {
  let clean = String(query || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return []
  if (clean.length > 200) {
    const firstSentence = clean.split(/[.?!]/)[0]
    clean = (firstSentence && firstSentence.length >= 10 && firstSentence.length <= 200) ? firstSentence : clean.slice(0, 160)
  }
  const splitPattern = /\b(?:vs|versus|compared to|and also|as well as)\b/i
  if (splitPattern.test(clean)) {
    const parts = clean.split(splitPattern).map(p => p.trim()).filter(p => p.length >= 3)
    if (parts.length >= 2) return parts.slice(0, 3).map(p => toSearchQuery(p))
  }
  return [toSearchQuery(clean)]
}

/**
 * Domain credibility & authority scoring for candidate search results.
 */
const HIGH_AUTH_DOMAINS = /\.(edu|gov|org)$|arxiv\.org|github\.com|wikipedia\.org|docs\.|nature\.com|ieee\.org|nytimes\.com|bbc\.com|reuters\.com|bloomberg\.com|techcrunch\.com/i
const LOW_AUTH_DOMAINS = /top10|best5|affiliate|review202|coupon|cheap/i

export function scoreDomain(urlStr = '') {
  try {
    const host = new URL(urlStr).hostname.toLowerCase()
    if (HIGH_AUTH_DOMAINS.test(host)) return 2.5
    if (LOW_AUTH_DOMAINS.test(host)) return 0.4
    return 1.0
  } catch {
    return 1.0
  }
}

/**
 * Extract key bulleted summary points & metrics across retrieved pages.
 */
function extractStructuredMetrics(pages) {
  const bullets = []
  const metrics = []
  pages.forEach((p, idx) => {
    const lines = (p.text || '').split('\n').map(l => l.trim())
    lines.forEach(line => {
      if ((line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) && line.length > 20 && line.length < 200) {
        if (bullets.length < 8) bullets.push(`[Source ${idx + 1}] ${line.replace(/^[-*•]\s*/, '')}`)
      }
      const match = line.match(/(?:[$€£₹]\s?\d[\d,.]*\s?(?:billion|million|bn|m|k)?|\b\d[\d,.]*\s?(?:%|percent|billion|million|users|TOPS|GB|MB)\b)/i)
      if (match && metrics.length < 8 && line.length < 150) {
        metrics.push({ metric: match[0], context: line, page: idx + 1 })
      }
    })
  })
  return {
    key_takeaways: bullets.length ? bullets : undefined,
    extracted_metrics: metrics.length ? metrics : undefined,
  }
}

/**
 * Extract structured tables from HTML pages into { headers, rows } JSON.
 */
function extractTablesFromHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const tables = []
    for (const table of [...doc.querySelectorAll('table')].slice(0, 5)) {
      const headers = [...table.querySelectorAll('thead th, thead td, tr:first-child th')]
        .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      const rows = []
      for (const tr of [...table.querySelectorAll('tbody tr, tr')].slice(headers.length ? 0 : 1, 20)) {
        const cells = [...tr.querySelectorAll('td, th')]
          .map(td => (td.textContent || '').replace(/\s+/g, ' ').trim())
        if (cells.some(c => c.length > 0)) rows.push(cells)
      }
      if (headers.length >= 2 && rows.length >= 1) {
        tables.push({ headers, rows: rows.slice(0, 15) })
      }
    }
    return tables.length ? tables : undefined
  } catch {
    return undefined
  }
}

/**
 * Extract citation/reference DOI links and arXiv IDs from page text.
 */
function extractCitations(pages) {
  const citations = []
  const seen = new Set()
  const doiPattern = /\b10\.\d{4,}\/[^\s"'<>]+/g
  const arxivPattern = /\barxiv:\s*(\d{4}\.\d{4,5})/gi
  for (const p of pages) {
    const text = p.text || p.content || ''
    for (const m of text.matchAll(doiPattern)) {
      const doi = m[0].replace(/[.,;:)]+$/, '')
      if (!seen.has(doi)) { seen.add(doi); citations.push({ type: 'doi', id: doi, url: `https://doi.org/${doi}`, source_page: p.url || p.title }) }
    }
    for (const m of text.matchAll(arxivPattern)) {
      const id = m[1]
      if (!seen.has(id)) { seen.add(id); citations.push({ type: 'arxiv', id, url: `https://arxiv.org/abs/${id}`, source_page: p.url || p.title }) }
    }
  }
  return citations.length ? citations.slice(0, 20) : undefined
}

/**
 * Confidence scoring: how trustworthy is each finding based on
 * number of corroborating sources and domain authority.
 */
function computeConfidence(pages) {
  if (!pages.length) return { overall: 'low', score: 0 }
  const avgAuth = pages.reduce((sum, p) => sum + scoreDomain(p.url || ''), 0) / pages.length
  const sourceCount = pages.length
  let score = Math.min(1, (sourceCount / 5) * 0.5 + (avgAuth / 2.5) * 0.5)
  let level = 'low'
  if (score >= 0.7) level = 'high'
  else if (score >= 0.4) level = 'medium'
  return { overall: level, score: Number(score.toFixed(2)), sources: sourceCount, avg_authority: Number(avgAuth.toFixed(2)) }
}

/**
 * Return the passages of a page that actually answer the query, rather than
 * its first N characters — the relevant part is often halfway down.
 */
function relevantExcerpt(text, query, maxChars) {
  if (text.length <= maxChars) return { text, ranked: false }
  const chunks = chunkText(text, { size: 900, overlap: 120 })
  if (chunks.length < 2) return { text: text.slice(0, maxChars), ranked: false }

  const hits = bm25(buildIndex(chunks), query, 8)
  if (!hits.length) return { text: text.slice(0, maxChars), ranked: false }

  // Keep the original reading order so the excerpt still flows.
  const picked = hits
    .sort((a, b) => a.i - b.i)
    .map(h => chunks[h.i])

  let out = ''
  for (const c of picked) {
    if (out.length + c.length > maxChars) break
    out += (out ? '\n…\n' : '') + c
  }
  return { text: out || text.slice(0, maxChars), ranked: true }
}

/**
 * Numbers, dates and percentages are where sources disagree in ways that matter.
 * Surfacing the disagreement lets the model report it instead of silently
 * picking whichever page it read first.
 */
const FIGURE = /(?:[$€£₹]\s?\d[\d,.]*\s?(?:billion|million|bn|m|k)?|\b\d[\d,.]*\s?(?:%|percent|billion|million|users|people|deaths|cases|MB|GB|km|kg|°C|°F)\b|\b(?:19|20)\d{2}\b)/gi

function findConflicts(pages) {
  const byFigure = new Map()
  pages.forEach((p, i) => {
    const seen = new Set((p.content.match(FIGURE) || []).map(f => f.replace(/\s+/g, ' ').trim().toLowerCase()))
    for (const f of seen) {
      if (!byFigure.has(f)) byFigure.set(f, new Set())
      byFigure.get(f).add(i + 1)
    }
  })

  // A figure asserted by several sources is corroborated; group near-identical
  // figures so "3.2 million" vs "3.4 million" reads as a discrepancy.
  const corroborated = []
  const groups = new Map()
  for (const [fig, pageSet] of byFigure) {
    if (pageSet.size > 1) corroborated.push({ figure: fig, pages: [...pageSet] })
    const unit = fig.replace(/[\d,.]+/g, '#')
    if (!groups.has(unit)) groups.set(unit, [])
    groups.get(unit).push({ figure: fig, pages: [...pageSet] })
  }

  const conflicting = [...groups.values()]
    .filter(g => g.length > 1 && g.length < 6 && !/^#$|^\(19\|20\)/.test(g[0].figure))
    .map(g => ({ variants: g.map(v => `${v.figure} [${v.pages.join(',')}]`) }))
    .slice(0, 5)

  return {
    corroborated: corroborated.slice(0, 8),
    possible_discrepancies: conflicting.length ? conflicting : undefined,
  }
}

/**
 * Terms that appear across the retrieved pages but not in the question — the
 * leads a human researcher would follow next.
 */
function followUpTerms(pages, query) {
  const asked = new Set(tokenize(query))
  const freq = new Map()
  for (const p of pages) {
    const seen = new Set(tokenize(p.content))
    for (const t of seen) {
      if (asked.has(t) || t.length < 4) continue
      freq.set(t, (freq.get(t) || 0) + 1)
    }
  }
  return [...freq.entries()]
    .filter(([, n]) => n >= Math.min(2, pages.length))   // mentioned by 2+ pages
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t)
}

/** Flag pages that repeat each other — syndicated copies waste the budget. */
function markDuplicates(pages) {
  const sigs = pages.map(p => new Set(tokenize(p.text).slice(0, 120)))
  const dupe = new Set()
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      if (dupe.has(j)) continue
      const a = sigs[i], b = sigs[j]
      if (!a.size || !b.size) continue
      let shared = 0
      for (const t of a) if (b.has(t)) shared++
      if (shared / Math.min(a.size, b.size) > 0.7) dupe.add(j)
    }
  }
  return pages.filter((_, i) => !dupe.has(i))
}

/** Sites that reliably return a paywall or a JS shell rather than content. */
const LOW_YIELD = /(facebook|instagram|twitter|x)\.com|linkedin\.com|pinterest\.|tiktok\.com|\.pdf($|\?)/i

const AD_TRACKER = /\b(?:duckduckgo\.com\/y\.js|bing\.com\/aclick|google\.com\/aclk|doubleclick\.net|t3\.gstatic\.com|amazon\.com\/gp\/r\.html|ad_domain=|ad_provider=|click_metadata=|aclick|aclk|rlid=)\b/i

async function fetchPage(url) {
  if (!url || AD_TRACKER.test(url)) return null
  const cached = PAGE_CACHE.get(url)
  if (cached && (Date.now() - cached.ts) < PAGE_CACHE_TTL) {
    return cached.data
  }
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT))
  try {
    const html = await Promise.race([proxyText(url), timeout])
    const page = extractReadable(html, { maxChars: EXTRACT_CHARS })
    if (page.text.length < 200) return null
    const res = { url, ...page }
    if (PAGE_CACHE.size > 200) {
      const firstKey = PAGE_CACHE.keys().next().value
      PAGE_CACHE.delete(firstKey)
    }
    PAGE_CACHE.set(url, { data: res, ts: Date.now() })
    return res
  } catch {
    return null
  }
}

export const researchTool = {
  schema: {
    description:
      'Research a topic on the live web: runs a search, then reads the top result pages in parallel and returns their extracted text with source URLs, publication dates and authors. ' +
      'Use this for anything requiring current information (news, prices, releases, events, documentation) instead of answering from memory. ' +
      'Prefer this over calling web_search and web_extract separately. ' +
      'Each returned page carries an "n" index — use that number for inline citations, and treat a claim as established only once at least two of the returned pages independently agree on it; a single source is a lead worth flagging as unconfirmed, not a fact.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to research' },
        depth: { type: 'number', description: 'How many pages to read (1-8, default 3)' },
        recency: {
          type: 'string',
          enum: ['any', 'day', 'week', 'month', 'year'],
          description: 'Bias the search toward recent pages. Use for news or "latest" questions.',
        },
        site: { type: 'string', description: 'Optional: restrict to one domain, e.g. "docs.python.org"' },
        follow_up: {
          type: 'boolean',
          description: 'Run a second, narrower search using terms discovered in the first round. Slower but much better for open-ended research questions.',
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
    const query = typeof rawQuery === 'string' ? rawQuery.trim() : String(rawQuery || '').trim()
    if (!query) return { error: 'Empty query' }
    const { depth = 3, recency = 'any', site, follow_up = false } = (typeof args === 'object' && args !== null) ? args : {}
    const n = Math.min(Math.max(1, depth | 0), 8)

    const rCacheKey = `${query.toLowerCase()}_${n}_${recency}_${site || ''}_${follow_up}`
    const rCached = RESEARCH_CACHE.get(rCacheKey)
    if (rCached && (Date.now() - rCached.ts) < RESEARCH_CACHE_TTL) {
      return { ...rCached.data, cached: true }
    }

    const subQueries = decomposeQuery(query)

    // Execute sub-queries concurrently for comprehensive coverage
    const searchResults = await Promise.all(subQueries.map(sq =>
      webSearchTool.execute({ query: sq, count: Math.min(n + 4, 10), recency, site })
    ))

    const allResults = []
    const seenUrls = new Set()
    searchResults.forEach(search => {
      if (search?.results) {
        search.results.forEach(r => {
          if (!seenUrls.has(r.url) && !LOW_YIELD.test(r.url)) {
            seenUrls.add(r.url)
            allResults.push(r)
          }
        })
      }
    })

    if (!allResults.length) {
      return { query, sources: [], pages: [], note: 'No search results. Try different wording.' }
    }

    // Rank candidates by combining search position with domain authority score
    const rankedCandidates = allResults
      .map((r, idx) => ({ ...r, score: (100 - idx) * scoreDomain(r.url) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n + 3)

    const settled = await Promise.all(rankedCandidates.map(r => fetchPage(r.url)))
    const pages = markDuplicates(settled.filter(Boolean)).slice(0, n)

    if (!pages.length) {
      return {
        query,
        engine: [...new Set(searchResults.map(s => s?.engine).filter(Boolean))].join('+') || 'unknown',
        pages: [],
        sources: allResults.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
        note: 'Search worked but none of the pages could be read (paywalls or JavaScript-only sites). Use the snippets below, and say they are snippets rather than full articles.',
      }
    }

    let allPages = pages

    // Second hop: chase the terms the first round surfaced. This is what makes
    // the difference between "one search" and actual research.
    if (follow_up && pages.length) {
      const MAX_HOPS = 3
      let currentPages = pages
      for (let hop = 0; hop < MAX_HOPS - 1; hop++) {
        const leads = followUpTerms(
          currentPages.map(p => ({ content: p.text })), query,
        ).slice(0, 3)
        if (!leads.length) break
        const hopSearch = await webSearchTool.execute({
          query: `${query} ${leads.join(' ')}`, count: 4, recency, site,
        })
        const seen = new Set(allPages.map(p => p.url))
        const more = (hopSearch.results || [])
          .filter(r => !seen.has(r.url) && !LOW_YIELD.test(r.url))
          .slice(0, 3)
        if (!more.length) break
        const fetched = (await Promise.all(more.map(r => fetchPage(r.url)))).filter(Boolean)
        if (!fetched.length) break
        allPages = markDuplicates([...allPages, ...fetched])
        currentPages = fetched // next hop uses newly fetched pages for term discovery
      }
    }

    const rendered = allPages.map((p, i) => {
      const { text, ranked } = relevantExcerpt(p.text, query, PER_PAGE_CHARS)
      return {
        n: i + 1,
        title: p.title || p.url,
        url: p.url,
        published: p.published || undefined,
        author: p.author || undefined,
        site: p.site || undefined,
        excerpted: ranked || undefined,
        content: text,
      }
    })

    // Extract structured tables from raw HTML of fetched pages
    const structuredTables = []
    for (const p of allPages) {
      if (p._html) {
        const tables = extractTablesFromHtml(p._html)
        if (tables) structuredTables.push({ source: p.url, tables })
      }
    }

    return {
      success: true,
      tool: 'deep_research',
      query,
      sub_queries: subQueries.length > 1 ? subQueries : undefined,
      fetched_at: new Date().toISOString(),
      hops: follow_up ? Math.min(3, allPages.length > pages.length ? 2 + (allPages.length - pages.length > 3 ? 1 : 0) : 1) : 1,
      confidence: computeConfidence(allPages),
      structured_findings: extractStructuredMetrics(allPages),
      structured_tables: structuredTables.length ? structuredTables : undefined,
      citations: extractCitations(rendered),
      cross_check: findConflicts(rendered),
      related_terms: followUpTerms(rendered, query),
      pages: rendered,
      sources: allResults.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
    }
  },
}
