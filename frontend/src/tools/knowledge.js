/**
 * Open, keyless knowledge sources. Every endpoint here was checked for
 * availability and CORS behaviour before being added; the ones that need a
 * proxy say so, the rest are called directly from the browser.
 *
 *   Wikipedia / Wikidata  CC BY-SA, open API, CORS
 *   OpenAlex              fully open scholarly graph, CORS
 *   arXiv                 open preprints, needs proxy (no CORS)
 *   Stack Exchange        CC BY-SA, CORS
 *   Hacker News (Algolia) CORS
 *   Open Library          Internet Archive, CORS
 *   Wayback Machine       Internet Archive, CORS
 *   dictionaryapi.dev     open source wrapper over Wiktionary data, CORS
 */

import { proxyText } from './http'

const json = async (url, init) => {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).hostname}`)
  return r.json()
}

function cleanTextQuery(query = '', maxLen = 160) {
  let q = String(query || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[#*`_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length > maxLen) {
    const firstSentence = q.split(/[.?!]/)[0]
    q = (firstSentence && firstSentence.length >= 10 && firstSentence.length <= maxLen) ? firstSentence : q.slice(0, maxLen)
  }
  return q.trim()
}

// ─── Wikipedia ───────────────────────────────────────────────────────────────
export const wikipediaTool = {
  schema: {
    description:
      'Look up an encyclopedia article on Wikipedia and return its summary, or search Wikipedia by topic. ' +
      'Best first stop for definitions, people, places, events and background — more reliable than a web search for established facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Article title or search terms' },
        lang: { type: 'string', description: 'Language code (default en)' },
        full: { type: 'boolean', description: 'Return the full article intro rather than a short summary' },
      },
      required: ['query'],
    },
  },
  async execute({ query, lang = 'en', full = false }) {
    const cleanQuery = cleanTextQuery(query, 140)
    if (!cleanQuery) return { success: false, error: 'Empty query' }
    const base = `https://${lang}.wikipedia.org`
    try {
      // Try the exact page first; fall back to search when it misses.
      const summary = await json(`${base}/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery)}`).catch(() => null)

      if (summary && summary.type !== 'disambiguation' && summary.extract) {
        let extract = summary.extract
        if (full) {
          const p = await json(
            `${base}/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(summary.title)}&format=json&origin=*`
          ).catch(() => null)
          const page = p && Object.values(p.query?.pages || {})[0]
          if (page?.extract) extract = page.extract
        }
        return {
          success: true, tool: 'wikipedia',
          title: summary.title,
          extract,
          description: summary.description,
          url: summary.content_urls?.desktop?.page,
          thumbnail: summary.thumbnail?.source,
          disambiguation: false,
        }
      }

      const data = await json(
        `${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&srlimit=5&format=json&origin=*`
      )
      const hits = (data.query?.search || []).map(r => ({
        title: r.title,
        snippet: (r.snippet || '').replace(/<[^>]+>/g, ''),
        url: `${base}/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      }))
      if (!hits.length) return { success: false, error: `No Wikipedia article found for "${cleanQuery}"` }
      return {
        success: true, tool: 'wikipedia', query: cleanQuery, results: hits,
        note: summary?.type === 'disambiguation'
          ? 'That title is a disambiguation page — pick one of these and look it up by exact title.'
          : 'No exact page; these are search matches.',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Academic papers ─────────────────────────────────────────────────────────
export const scholarTool = {
  schema: {
    description:
      'Search academic literature (OpenAlex, plus arXiv preprints). Returns titles, authors, year, citation counts, open-access links and abstracts. ' +
      'Use for research questions, "what does the evidence say", or when the user asks for papers or studies.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic or paper title' },
        limit: { type: 'number', description: 'How many papers (1-10, default 5)' },
        since: { type: 'number', description: 'Only papers published in or after this year' },
        preprints: { type: 'boolean', description: 'Also search arXiv preprints (default true)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, limit = 5, since, preprints = true }) {
    const n = Math.min(Math.max(1, limit | 0), 10)
    // Strip future years like 2025/2026 and sanitize length
    const cleanQuery = cleanTextQuery(query.replace(/\b(2025|2026|2027|2028)\b/g, ''), 150) || 'research'
    const out = []

    try {
      const filter = since ? `&filter=from_publication_date:${since}-01-01` : ''
      const data = await json(
        `https://api.openalex.org/works?search=${encodeURIComponent(cleanQuery)}&per-page=${n + 5}${filter}&mailto=yogatik`
      )
      for (const w of data.results || []) {
        // OpenAlex stores abstracts as an inverted index to sidestep copyright.
        let abstract = ''
        if (w.abstract_inverted_index) {
          const words = []
          for (const [word, positions] of Object.entries(w.abstract_inverted_index)) {
            for (const pos of positions) words[pos] = word
          }
          abstract = words.join(' ').slice(0, 700)
        }
        out.push({
          source: 'openalex',
          title: w.title || w.display_name,
          year: w.publication_year,
          authors: (w.authorships || []).slice(0, 5).map(a => a.author?.display_name).filter(Boolean),
          venue: w.primary_location?.source?.display_name,
          citations: w.cited_by_count,
          open_access: w.open_access?.is_oa || false,
          url: w.primary_location?.landing_page_url || w.doi,
          pdf: w.best_oa_location?.pdf_url || undefined,
          abstract: abstract || undefined,
        })
      }
    } catch { /* OpenAlex down — arXiv may still answer */ }

    if (preprints) {
      try {
        // arXiv has no CORS headers, so it goes through the proxy.
        const xml = await proxyText(
          `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(cleanQuery)}&max_results=${Math.min(n, 5)}&sortBy=relevance`
        )
        const doc = new DOMParser().parseFromString(xml, 'text/xml')
        for (const e of [...doc.querySelectorAll('entry')].slice(0, n)) {
          const txt = (sel) => e.querySelector(sel)?.textContent?.trim() || ''
          out.push({
            source: 'arxiv',
            title: txt('title').replace(/\s+/g, ' '),
            year: Number(txt('published').slice(0, 4)) || undefined,
            authors: [...e.querySelectorAll('author name')].map(a => a.textContent?.trim()).filter(Boolean),
            url: txt('id'),
            pdf: e.querySelector('link[title="pdf"]')?.getAttribute('href') || undefined,
            abstract: txt('summary').replace(/\s+/g, ' ').slice(0, 700) || undefined,
            open_access: true,
          })
        }
      } catch { /* preprints are a bonus, not a requirement */ }
    }

    if (!out.length) return { success: false, error: `No papers found for "${cleanQuery}"` }
    return { success: true, tool: 'scholar', query: cleanQuery, count: out.length, papers: out.slice(0, n + 3) }
  },
}

// ─── Programming Q&A ─────────────────────────────────────────────────────────
export const stackOverflowTool = {
  schema: {
    description:
      'Search Stack Overflow for programming problems and return the accepted or highest-voted answers. ' +
      'Use for error messages, API usage and "how do I" coding questions — real answers beat guessing.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Error message or question' },
        tag: { type: 'string', description: 'Restrict to a tag, e.g. "javascript"' },
        limit: { type: 'number', description: 'How many questions (1-5, default 3)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, tag, limit = 3 }) {
    const cleanQuery = cleanTextQuery(query, 120)
    if (!cleanQuery) return { success: false, error: 'Empty query' }
    const n = Math.min(Math.max(1, limit | 0), 5)
    try {
      const cleanTag = tag ? cleanTextQuery(tag, 30) : ''
      const tagged = cleanTag ? `&tagged=${encodeURIComponent(cleanTag)}` : ''
      const data = await json(
        `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(cleanQuery)}${tagged}` +
        `&site=stackoverflow&pagesize=${n}&filter=!nNPvSNVZJS`
      )
      const items = data.items || []
      if (!items.length) return { success: false, error: `Nothing on Stack Overflow for "${cleanQuery}"` }

      const ids = items.map(i => i.question_id).join(';')
      const answers = await json(
        `https://api.stackexchange.com/2.3/questions/${ids}/answers?order=desc&sort=votes&site=stackoverflow&pagesize=10&filter=withbody`
      ).catch(() => ({ items: [] }))

      const strip = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900)

      return {
        success: true, tool: 'stackoverflow', query: cleanQuery,
        questions: items.map(q => {
          const best = (answers.items || [])
            .filter(a => a.question_id === q.question_id)
            .sort((a, b) => (b.is_accepted - a.is_accepted) || (b.score - a.score))[0]
          return {
            title: q.title,
            url: q.link,
            score: q.score,
            answered: q.is_answered,
            asked: new Date(q.creation_date * 1000).toISOString().slice(0, 10),
            tags: q.tags,
            top_answer: best ? { score: best.score, accepted: !!best.is_accepted, body: strip(best.body) } : undefined,
          }
        }),
        licence: 'Answers are CC BY-SA — attribute Stack Overflow when quoting.',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Discussion / sentiment ──────────────────────────────────────────────────
export const hackerNewsTool = {
  schema: {
    description:
      'Search Hacker News discussions. Useful for practitioner opinion on tools, launches and trade-offs — ' +
      'what people who used something actually thought, as opposed to marketing copy.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic, product or company' },
        limit: { type: 'number', description: 'How many threads (1-10, default 5)' },
        sort: { type: 'string', enum: ['relevance', 'recent'], description: 'Default relevance' },
      },
      required: ['query'],
    },
  },
  async execute({ query, limit = 5, sort = 'relevance' }) {
    const cleanQuery = cleanTextQuery(query, 120)
    if (!cleanQuery) return { success: false, error: 'Empty query' }
    const n = Math.min(Math.max(1, limit | 0), 10)
    const path = sort === 'recent' ? 'search_by_date' : 'search'
    try {
      const data = await json(`https://hn.algolia.com/api/v1/${path}?query=${encodeURIComponent(cleanQuery)}&tags=story&hitsPerPage=${n}`)
      const hits = (data.hits || []).filter(h => h.title)
      if (!hits.length) return { success: false, error: `No Hacker News threads for "${cleanQuery}"` }
      return {
        success: true, tool: 'hackernews', query: cleanQuery,
        threads: hits.map(h => ({
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
          points: h.points,
          comments: h.num_comments,
          date: (h.created_at || '').slice(0, 10),
        })),
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Archived pages ──────────────────────────────────────────────────────────
export const archiveTool = {
  schema: {
    description:
      'Find an archived snapshot of a URL in the Internet Archive Wayback Machine. ' +
      'Use when a page is dead, paywalled, or when the user asks what a page said at some earlier date.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The page to look up' },
        date: { type: 'string', description: 'Target date as YYYYMMDD (default: most recent)' },
      },
      required: ['url'],
    },
  },
  async execute({ url, date }) {
    try {
      const q = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}${date ? `&timestamp=${date}` : ''}`
      const data = await json(q).catch(err => {
        if (/429/.test(err.message)) {
          throw new Error('The Internet Archive is rate-limiting requests right now — try again in a minute.')
        }
        throw err
      })
      const snap = data.archived_snapshots?.closest
      if (!snap?.available) {
        return { success: false, error: 'No archived snapshot exists for that URL.', url }
      }
      return {
        success: true, tool: 'archive', url,
        archived_url: snap.url,
        captured: `${snap.timestamp.slice(0, 4)}-${snap.timestamp.slice(4, 6)}-${snap.timestamp.slice(6, 8)}`,
        note: 'Pass archived_url to web_extract to read the archived text.',
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── Dictionary ──────────────────────────────────────────────────────────────
export const dictionaryTool = {
  schema: {
    description: 'Define an English word: meanings, part of speech, pronunciation, synonyms and example usage.',
    parameters: {
      type: 'object',
      properties: { word: { type: 'string', description: 'The word to define' } },
      required: ['word'],
    },
  },
  async execute({ word }) {
    try {
      const cleanWord = cleanTextQuery(word, 60)
      const data = await json(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`)
      const entry = data[0]
      if (!entry) return { success: false, error: `No definition found for "${word}"` }
      return {
        success: true, tool: 'dictionary',
        word: entry.word,
        phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text,
        audio: entry.phonetics?.find(p => p.audio)?.audio || undefined,
        meanings: (entry.meanings || []).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definitions: m.definitions.slice(0, 3).map(d => ({ definition: d.definition, example: d.example })),
          synonyms: (m.synonyms || []).slice(0, 6),
        })),
        source: entry.sourceUrls?.[0],
      }
    } catch {
      return { success: false, error: `No definition found for "${word}"` }
    }
  },
}

// ─── Books ───────────────────────────────────────────────────────────────────
export const booksTool = {
  schema: {
    description: 'Search Open Library (Internet Archive) for books by title, author or subject. Returns editions, years and whether a copy can be read online.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Title, author or subject' },
        limit: { type: 'number', description: 'How many books (1-10, default 5)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, limit = 5 }) {
    const cleanQuery = cleanTextQuery(query, 120)
    if (!cleanQuery) return { success: false, error: 'Empty query' }
    const n = Math.min(Math.max(1, limit | 0), 10)
    try {
      const data = await json(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanQuery)}&limit=${n}&fields=title,author_name,first_publish_year,key,ebook_access,subject,number_of_pages_median`
      )
      const docs = data.docs || []
      if (!docs.length) return { success: false, error: `No books found for "${cleanQuery}"` }
      return {
        success: true, tool: 'books', query: cleanQuery,
        books: docs.map(b => ({
          title: b.title,
          authors: (b.author_name || []).slice(0, 3),
          year: b.first_publish_year,
          pages: b.number_of_pages_median,
          readable: b.ebook_access && b.ebook_access !== 'no',
          url: `https://openlibrary.org${b.key}`,
          subjects: (b.subject || []).slice(0, 5),
        })),
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}
