/**
 * deep_research — search → fetch top pages in parallel → extract readable text.
 * One tool call instead of N round-trips through the LLM, which is both far
 * faster and much cheaper in tokens than search-then-extract-then-extract.
 */

import { proxyText } from './http'
import { webSearchTool } from './webSearch'
import { extractReadable } from './readability'
import { chunkText, buildIndex, search as bm25, tokenize } from '../retrieval'

const PER_PAGE_CHARS = 4000      // what the model finally sees, per page
const EXTRACT_CHARS = 24000     // what we keep to rank against the question
const FETCH_TIMEOUT = 12000

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
  const quoted = text.match(/"[^"]+"/g) || []          // keep phrases intact
  const rest = text.replace(/"[^"]+"/g, ' ')
  const words = rest
    .replace(/[?!.,;:]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !FILLER.has(w.toLowerCase()))
  const out = [...quoted, ...words].join(' ').trim()
  // If filtering removed nearly everything, the original was already terse.
  return out.split(/\s+/).length >= 2 ? out : text.trim()
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

async function fetchPage(url) {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT))
  try {
    const html = await Promise.race([proxyText(url), timeout])
    // Keep far more than we will send: relevantExcerpt needs material to rank,
    // and the answer is often past the first 4000 characters.
    const page = extractReadable(html, { maxChars: EXTRACT_CHARS })
    // Under ~200 chars it is a cookie wall or a JS-only shell, not an article.
    if (page.text.length < 200) return null
    return { url, ...page }
  } catch {
    return null
  }
}

export const researchTool = {
  schema: {
    description:
      'Research a topic on the live web: runs a search, then reads the top result pages in parallel and returns their extracted text with source URLs, publication dates and authors. ' +
      'Use this for anything requiring current information (news, prices, releases, events, documentation) instead of answering from memory. ' +
      'Prefer this over calling web_search and web_extract separately.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to research' },
        depth: { type: 'number', description: 'How many pages to read (1-5, default 3)' },
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

  async execute({ query, depth = 3, recency = 'any', site, follow_up = false }) {
    if (!query?.trim()) return { error: 'Empty query' }
    const n = Math.min(Math.max(1, depth | 0), 5)
    const searchQuery = toSearchQuery(query)

    let search = await webSearchTool.execute({
      query: searchQuery, count: Math.min(n + 4, 10), recency, site,
    })

    // One retry with the raw wording before giving up — reformulation
    // occasionally strips the very term that mattered.
    if (!search.error && !search.results?.length && searchQuery !== query) {
      search = await webSearchTool.execute({ query, count: Math.min(n + 4, 10), recency, site })
    }
    if (search.error) return search
    if (!search.results?.length) {
      return { query, sources: [], pages: [], note: 'No search results. Try different wording.' }
    }

    // Skip hosts that reliably yield nothing readable, then over-fetch a little
    // so failures still leave `n` usable pages.
    const candidates = search.results.filter(r => !LOW_YIELD.test(r.url)).slice(0, n + 3)
    const settled = await Promise.all(candidates.map(r => fetchPage(r.url)))
    const pages = markDuplicates(settled.filter(Boolean)).slice(0, n)

    if (!pages.length) {
      return {
        query,
        engine: search.engine,
        pages: [],
        sources: search.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
        note: 'Search worked but none of the pages could be read (paywalls or JavaScript-only sites). Use the snippets below, and say they are snippets rather than full articles.',
      }
    }

    let allPages = pages

    // Second hop: chase the terms the first round surfaced. This is what makes
    // the difference between "one search" and actual research.
    if (follow_up && pages.length) {
      const leads = followUpTerms(
        pages.map(p => ({ content: p.text })), query,
      ).slice(0, 3)
      if (leads.length) {
        const second = await webSearchTool.execute({
          query: `${searchQuery} ${leads.join(' ')}`, count: 4, recency, site,
        })
        const seen = new Set(pages.map(p => p.url))
        const more = (second.results || [])
          .filter(r => !seen.has(r.url) && !LOW_YIELD.test(r.url))
          .slice(0, 3)
        const fetched = (await Promise.all(more.map(r => fetchPage(r.url)))).filter(Boolean)
        allPages = markDuplicates([...pages, ...fetched])
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

    return {
      success: true,
      tool: 'deep_research',
      query,
      engine: search.engine,
      fetched_at: new Date().toISOString(),
      query_used: searchQuery !== query ? searchQuery : undefined,
      hops: follow_up ? 2 : 1,
      cross_check: findConflicts(rendered),
      related_terms: followUpTerms(rendered, query),
      pages: rendered,
      sources: search.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })),
    }
  },
}
