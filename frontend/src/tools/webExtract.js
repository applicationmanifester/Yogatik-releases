// Web content extraction via CORS proxy
import { proxyText } from './http'
import { extractReadable } from './readability'
import { chunkText, buildIndex, search } from '../retrieval'

const EXTRACT_CACHE = new Map()
const EXTRACT_CACHE_TTL = 10 * 60_000 // 10 minutes
const FETCH_TIMEOUT_MS = 5000
// How much of a long page to actually extract when `focus` is given, before
// ranking it down to `max_chars`. Without a focus the tool still extracts
// only `max_chars` worth (unchanged, zero-cost default) — this larger cap is
// paid only when the caller has told us what to look for and getting it
// right is worth reading more of the page first.
const EXTRACT_FULL_CAP = 60000

/**
 * Relevance-ranked compression of a long page down to a character budget —
 * the alternative to `web_extract`'s default blind head-truncation.
 *
 * A long article's relevant section is routinely NOT in its first 8000
 * characters (the byline, an ad-supported intro, a wall of related links —
 * this app's own web pages are full of exactly this noise, per the CSP/ad
 * notes elsewhere in this codebase). Chunking the FULL extracted text with
 * retrieval.js's existing BM25 chunker/ranker (the same engine doc_search and
 * local_vault_search already use — no new algorithm, no download) and
 * keeping only the top-ranked chunks turns "the first N characters" into
 * "the N characters that actually answer the question." Kept chunks are
 * re-sorted back into their ORIGINAL page order before joining, so the
 * excerpt still reads top-to-bottom like a passage, not a shuffled ranking.
 *
 * Never returns MORE confidence than it has: when the focus terms do not
 * appear on the page at all, `matched: false` says so plainly rather than
 * silently falling back to a head slice that would look exactly like a
 * relevant answer.
 */
export function compressToRelevantPassages(text, focus, budgetChars, { chunkSize = 900, overlap = 150 } = {}) {
  const clean = String(text || '')
  const budget = budgetChars !== undefined ? Math.max(1, budgetChars | 0) : clean.length
  const chunks = chunkText(clean, { size: chunkSize, overlap })

  if (chunks.length <= 1) {
    const sliced = clean.slice(0, budget)
    return {
      text: sliced,
      stats: {
        focus, matched: null, // too short to chunk — nothing to rank
        original_chars: clean.length, returned_chars: sliced.length,
        chunks_kept: chunks.length, chunks_total: chunks.length,
      },
    }
  }

  const index = buildIndex(chunks)
  const ranked = search(index, focus, chunks.length)
  if (!ranked.length) {
    const sliced = clean.slice(0, budget)
    return {
      text: sliced,
      stats: {
        focus, matched: false,
        original_chars: clean.length, returned_chars: sliced.length,
        chunks_kept: 0, chunks_total: chunks.length,
      },
    }
  }

  const kept = []
  let spent = 0
  for (const { i } of ranked) {
    if (spent >= budget) break
    kept.push(i)
    spent += chunks[i].length
  }
  kept.sort((a, b) => a - b) // restore page order so the excerpt reads top-to-bottom

  const joined = kept
    .map((idx, pos) => (pos > 0 && idx !== kept[pos - 1] + 1) ? `\n\n[…skipped…]\n\n${chunks[idx]}` : chunks[idx])
    .join('\n\n')

  return {
    text: joined,
    stats: {
      focus, matched: true,
      original_chars: clean.length, returned_chars: joined.length,
      chunks_kept: kept.length, chunks_total: chunks.length,
    },
  }
}

export const webExtractTool = {
  schema: {
    description: 'Read a specific web page and return its main article text, with title, author and publication date. Use when the user gives a URL, or to read one result from web_search in full. Pass `focus` (the question you are trying to answer) on a long page — instead of returning the first max_chars characters, the page is chunked and ranked so you get the passages that actually address it, wherever they are on the page. Fetches STATIC HTML only — it does not run JavaScript, so single-page apps and login-gated pages come back empty; for those use browser_control (desktop app), which renders the page in a real browser.',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'Web page URL' },
      max_chars: { type: 'number', description: 'Maximum characters to return (default 8000)' },
      focus: { type: 'string', description: 'Optional: the question or topic you actually need from this page. When set, the returned text is the most RELEVANT passages (ranked, not just the first ones) instead of a blind head-truncation — the right tool for a long page where the answer might be anywhere on it.' },
    }, required: ['url'] },
  },
  async execute({ url, max_chars = 8000, focus }) {
    if (!/^https?:\/\//i.test(url || '')) return { success: false, error: 'Provide a full http(s) URL' }
    if (url.includes('news.google.com/rss/articles/')) {
      return {
        success: false,
        error: 'Google News redirect links cannot be extracted directly. Use web_search or provide the publisher direct URL.',
        url,
      }
    }

    const cleanUrl = url.trim()
    const targetChars = Math.min(Math.max(1000, max_chars | 0), 20000)
    const focusQuery = typeof focus === 'string' ? focus.trim() : ''
    const cacheKey = `${cleanUrl}_${targetChars}_${focusQuery}`
    const cached = EXTRACT_CACHE.get(cacheKey)
    if (cached && (Date.now() - cached.ts) < EXTRACT_CACHE_TTL) {
      return { ...cached.data, cached: true }
    }

    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Fetch timeout')), FETCH_TIMEOUT_MS))
      const html = await Promise.race([proxyText(cleanUrl), timeout])
      // Without a focus, extract exactly targetChars — identical to this
      // tool's prior behavior, zero extra cost. WITH one, pull the whole
      // article (up to a generous cap) so relevance ranking below can see
      // passages a blind head-truncation would never reach.
      const page = extractReadable(html, { maxChars: focusQuery ? EXTRACT_FULL_CAP : targetChars })
      if (!page.text || page.text.length < 100) {
        const canRender = typeof window !== 'undefined' && !!window.__YOGATIK_BROWSER__
        return {
          success: false,
          error: 'No readable text found — the page is probably JavaScript-only or behind a paywall.',
          url,
          title: page.title || undefined,
          can_render: canRender,
          next_step: canRender
            ? 'This page renders with JavaScript, which this tool cannot run. Use browser_control: navigate to the url, then action "read" to get the rendered page.'
            : 'This page renders with JavaScript. Reading it needs the Yogatik Desktop app, which can run the page in a real browser. Say so plainly rather than guessing at the content.',
        }
      }
      let text = page.text
      let truncated = page.truncated
      let words = page.words
      let compression
      if (focusQuery && page.text.length > targetChars) {
        const compressed = compressToRelevantPassages(page.text, focusQuery, targetChars)
        text = compressed.text
        truncated = true
        compression = compressed.stats
        // `page.words` counted the FULL extraction (up to EXTRACT_FULL_CAP) —
        // reporting that next to a much shorter compressed `text` would read
        // as a contradiction, so recount against what is actually returned.
        words = text.split(/\s+/).filter(Boolean).length
      }

      const out = {
        success: true, tool: 'web_extract', url,
        title: page.title,
        published: page.published || undefined,
        author: page.author || undefined,
        site: page.site || undefined,
        text,
        words,
        truncated,
        compression,
        tables: page.tables || undefined,
        code_blocks: page.code_blocks || undefined,
        json_ld: page.json_ld || undefined,
        images: page.images || undefined,
      }
      if (EXTRACT_CACHE.size > 150) {
        const firstKey = EXTRACT_CACHE.keys().next().value
        EXTRACT_CACHE.delete(firstKey)
      }
      EXTRACT_CACHE.set(cacheKey, { data: out, ts: Date.now() })
      return out
    } catch (e) {
      return { success: false, error: `Could not fetch the page: ${e.message}`, url }
    }
  }
}
