/**
 * Yogatik Private On-Device Search Engine & Web Crawler
 * 
 * $0 Cost, 100% Local, Zero Cloud Dependencies.
 * Features:
 *  - On-Device Indexing in IndexedDB (Dexie)
 *  - BM25 Full-Text Retrieval with Field Weighting (Title, URL, Content)
 *  - 384-Dimensional TurboVec Feature Hashing & Cosine Similarity
 *  - Targeted Domain Web Crawler with polite rate-limiting & link extraction
 *  - Contextual Snippet Generator with Query Highlighting
 *  - Single-Click Browser Page Indexer
 */

import { proxyText } from './http.js'
import { extractReadable } from './readability.js'
import { STEALTH_HEADERS } from './scrapling.js'
import {
  saveIndexedPage,
  getIndexedPages,
  getIndexedPage,
  deleteIndexedPage,
  clearIndexedPages,
  countIndexedPages,
  getAllIndexedDomains,
} from '../db.js'

// Standard English Stop Words to filter out for cleaner indexing
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if',
  'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most',
  'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d',
  'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they',
  'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
  'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who',
  'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d',
  'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
])

/**
 * Tokenize string into clean array of words
 */
export function tokenizeText(text = '') {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

/**
 * Generates a 384-dimensional feature vector using deterministic Murmur-style hashing.
 * Provides instant on-device vector representation without external models.
 */
export function generateFeatureVector(text = '', dim = 384) {
  const vec = new Float32Array(dim)
  if (!text) return Array.from(vec)

  const tokens = tokenizeText(text)
  if (!tokens.length) return Array.from(vec)

  // Subword / n-gram and word feature hashing
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]
    // Word hash
    let h1 = 0x811c9dc5
    for (let j = 0; j < word.length; j++) {
      h1 = Math.imul(h1 ^ word.charCodeAt(j), 0x01000193)
    }
    const idx1 = Math.abs(h1) % dim
    const sign1 = (h1 & 1) ? 1 : -1
    vec[idx1] += sign1 * 1.5

    // Bigram hash with adjacent token
    if (i < tokens.length - 1) {
      const bigram = word + '_' + tokens[i + 1]
      let h2 = 0x811c9dc5
      for (let j = 0; j < bigram.length; j++) {
        h2 = Math.imul(h2 ^ bigram.charCodeAt(j), 0x01000193)
      }
      const idx2 = Math.abs(h2) % dim
      const sign2 = (h2 & 1) ? 1 : -1
      vec[idx2] += sign2 * 2.0
    }
  }

  // L2 Normalization
  let norm = 0
  for (let i = 0; i < dim; i++) {
    norm += vec[i] * vec[i]
  }
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] /= norm
    }
  }

  return Array.from(vec)
}

/**
 * Calculates cosine similarity between two numeric vectors
 */
export function cosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length !== v2.length) return 0
  let dot = 0
  let n1 = 0
  let n2 = 0
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i]
    n1 += v1[i] * v1[i]
    n2 += v2[i] * v2[i]
  }
  if (n1 === 0 || n2 === 0) return 0
  return dot / (Math.sqrt(n1) * Math.sqrt(n2))
}

/**
 * Extracts a dynamic contextual snippet around the highest concentration of query tokens
 */
export function extractContextualSnippet(content = '', queryTokens = [], maxLen = 220) {
  if (!content) return ''
  const clean = content.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  if (!queryTokens.length) return clean.slice(0, maxLen) + '...'

  const lower = clean.toLowerCase()
  let bestIdx = -1
  let maxScore = -1

  for (const q of queryTokens) {
    let idx = lower.indexOf(q)
    while (idx !== -1) {
      let score = 0
      const windowStart = Math.max(0, idx - 50)
      const windowEnd = Math.min(clean.length, idx + maxLen)
      const windowText = lower.slice(windowStart, windowEnd)

      for (const token of queryTokens) {
        if (windowText.includes(token)) score++
      }

      if (score > maxScore) {
        maxScore = score
        bestIdx = idx
      }
      idx = lower.indexOf(q, idx + 1)
    }
  }

  if (bestIdx === -1) return clean.slice(0, maxLen) + '...'

  const start = Math.max(0, bestIdx - 60)
  const end = Math.min(clean.length, start + maxLen)
  let snippet = clean.slice(start, end).trim()
  if (start > 0) snippet = '...' + snippet
  if (end < clean.length) snippet = snippet + '...'
  return snippet
}

/**
 * BM25 Scoring algorithm for candidate document
 */
export function computeBM25Score({ queryTokens, doc, avgDocLen = 400, k1 = 1.2, b = 0.75 }) {
  if (!queryTokens.length) return 0

  const titleTokens = tokenizeText(doc.title || '')
  const urlTokens = tokenizeText(doc.url || '')
  const descTokens = tokenizeText(doc.description || '')
  const bodyTokens = tokenizeText(doc.content || '')

  const docLen = titleTokens.length + bodyTokens.length
  const lenNorm = 1 - b + b * (docLen / Math.max(avgDocLen, 50))

  let score = 0

  for (const term of queryTokens) {
    // Count occurrences with field weighting
    let tf = 0
    // Title matches are heavily weighted
    for (const t of titleTokens) if (t === term || t.includes(term)) tf += 3.5
    // URL matches are strong signals
    for (const t of urlTokens) if (t === term || t.includes(term)) tf += 2.5
    // Description matches
    for (const t of descTokens) if (t === term || t.includes(term)) tf += 2.0
    // Body matches
    for (const t of bodyTokens) if (t === term) tf += 1.0

    if (tf > 0) {
      // Basic IDF proxy assuming localized corpus
      const idf = 1.5
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * lenNorm))
    }
  }

  return score
}

/**
 * Searches the private on-device index
 */
export async function searchLocalIndex({ query = '', count = 5, domain = null }) {
  const cleanQ = String(query || '').trim()
  if (!cleanQ) return { query, count: 0, results: [] }

  const queryTokens = tokenizeText(cleanQ)
  const queryVector = generateFeatureVector(cleanQ)

  // Fetch candidate pages from IndexedDB
  const pages = await getIndexedPages({ limit: 250, domain })
  if (!pages.length) {
    return { query, count: 0, results: [], message: 'Index is empty. Index pages or crawl sites to search.' }
  }

  // Calculate average doc length for BM25
  let totalLen = 0
  for (const p of pages) {
    totalLen += p.wordCount || 300
  }
  const avgDocLen = totalLen / Math.max(pages.length, 1)

  // Score each page
  const scored = []
  for (const doc of pages) {
    const bm25 = computeBM25Score({ queryTokens, doc, avgDocLen })
    let vecSim = 0
    if (doc.vector && Array.isArray(doc.vector)) {
      vecSim = cosineSimilarity(queryVector, doc.vector)
    }

    // Combined ranking score
    const combinedScore = (bm25 * 0.7) + (Math.max(0, vecSim) * 10 * 0.3)

    if (combinedScore > 0.05) {
      const dynamicSnippet = extractContextualSnippet(doc.content || doc.description, queryTokens, 220)
      scored.push({
        title: doc.title || doc.url,
        url: doc.url,
        domain: doc.domain,
        snippet: dynamicSnippet || doc.snippet || doc.description,
        published: doc.updatedAt ? new Date(doc.updatedAt).toISOString().slice(0, 10) : undefined,
        score: Math.round(combinedScore * 100) / 100,
        wordCount: doc.wordCount,
        engine: 'local_index',
        private: true,
        source: 'Yogatik Private Memory',
      })
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score)
  const results = scored.slice(0, count)

  return {
    query: cleanQ,
    count: results.length,
    results,
    domain: domain || undefined,
  }
}

/**
 * Direct web page indexer: Fetches a URL, cleans readability, generates vectors, and saves.
 */
export async function indexUrlDirect(url) {
  if (!url) throw new Error('Missing URL to index')
  const cleanUrl = url.trim()

  let html
  try {
    html = await proxyText(cleanUrl, { headers: STEALTH_HEADERS })
  } catch (err) {
    throw new Error(`Failed to fetch ${cleanUrl}: ${err.message}`)
  }

  if (!html || html.length < 50) {
    throw new Error(`Empty content received for ${cleanUrl}`)
  }

  const parsed = extractReadable(html, 50000)
  const title = (parsed.title || cleanUrl).trim()
  const content = parsed.text || ''
  const description = parsed.description || content.slice(0, 300)
  const snippet = description.slice(0, 250)
  const vector = generateFeatureVector(title + ' ' + description + ' ' + content.slice(0, 2000))

  const saved = await saveIndexedPage({
    url: cleanUrl,
    title,
    description,
    snippet,
    content,
    wordCount: parsed.words || content.split(/\s+/).length,
    vector,
  })

  return saved
}

/**
 * Indexes page from active browser DOM/content directly (e.g. from BrowserPanel or window)
 */
export async function indexPageContent({ url, title, content, description = '' }) {
  if (!url) throw new Error('Cannot index without URL')
  const cleanUrl = url.trim()
  const cleanTitle = (title || cleanUrl).trim()
  const cleanContent = (content || '').trim()
  const cleanDesc = (description || cleanContent.slice(0, 300)).trim()
  const snippet = cleanDesc.slice(0, 250)
  const vector = generateFeatureVector(cleanTitle + ' ' + cleanDesc + ' ' + cleanContent.slice(0, 2000))

  return await saveIndexedPage({
    url: cleanUrl,
    title: cleanTitle,
    description: cleanDesc,
    snippet,
    content: cleanContent,
    wordCount: cleanContent.split(/\s+/).length,
    vector,
  })
}

/**
 * Extracts clean internal links from HTML for a given domain
 */
export function extractDomainLinks(html, baseUrl, targetHost) {
  if (!html || !baseUrl) return []
  const links = new Set()
  const hrefRegex = /href=["']([^"'#\s>]+)["']/gi
  let match

  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = match[1].trim()
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue
    }

    try {
      const resolved = new URL(rawHref, baseUrl)
      // Only keep HTTP/HTTPS
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue

      // Check host matches or is subdomain
      const linkHost = resolved.hostname.toLowerCase()
      if (linkHost !== targetHost && !linkHost.endsWith('.' + targetHost)) {
        continue
      }

      // Ignore common non-html assets
      const pathname = resolved.pathname.toLowerCase()
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|tar|gz|exe|dmg|iso|mp3|mp4|avi|css|js|woff|woff2|ttf)$/.test(pathname)) {
        continue
      }

      // Drop fragments and query variations if redundant
      resolved.hash = ''
      links.add(resolved.href)
    } catch {}
  }

  return Array.from(links)
}

/**
 * Targeted Domain Web Crawler
 * Crawls up to `maxPages` from `startUrl` within the same domain.
 */
export async function crawlSite({
  startUrl,
  maxPages = 10,
  maxDepth = 2,
  delayMs = 250,
  onProgress = null,
} = {}) {
  if (!startUrl) throw new Error('Target start URL is required')

  let parsedStart
  try {
    parsedStart = new URL(startUrl.trim())
  } catch {
    throw new Error('Invalid start URL provided')
  }

  const targetHost = parsedStart.hostname.toLowerCase()
  const visited = new Set()
  const queue = [{ url: parsedStart.href, depth: 0 }]
  const indexed = []
  let count = 0

  while (queue.length > 0 && count < maxPages) {
    const item = queue.shift()
    if (!item || visited.has(item.url)) continue
    visited.add(item.url)

    if (onProgress) {
      onProgress({
        status: 'crawling',
        currentUrl: item.url,
        crawledCount: count,
        queueLength: queue.length,
        depth: item.depth,
      })
    }

    try {
      const html = await proxyText(item.url, { headers: STEALTH_HEADERS })
      if (html && html.length > 50) {
        const readable = extractReadable(html, 50000)
        const title = (readable.title || item.url).trim()
        const content = readable.text || ''
        const description = readable.description || content.slice(0, 300)
        const vector = generateFeatureVector(title + ' ' + description + ' ' + content.slice(0, 2000))

        const saved = await saveIndexedPage({
          url: item.url,
          domain: targetHost.replace(/^www\./, ''),
          title,
          description,
          snippet: description.slice(0, 250),
          content,
          wordCount: readable.words || content.split(/\s+/).length,
          vector,
        })

        indexed.push(saved)
        count++

        // Extract more links if depth limit not reached
        if (item.depth < maxDepth && count < maxPages) {
          const links = extractDomainLinks(html, item.url, targetHost)
          for (const link of links) {
            if (!visited.has(link) && !queue.some(q => q.url === link)) {
              queue.push({ url: link, depth: item.depth + 1 })
            }
          }
        }
      }
    } catch (e) {
      // Continue crawling other links even if one fails
      console.warn(`Crawler failed to process ${item.url}:`, e.message)
    }

    // Polite rate limiting pause
    if (delayMs > 0 && queue.length > 0 && count < maxPages) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  if (onProgress) {
    onProgress({
      status: 'completed',
      crawledCount: count,
      queueLength: 0,
      indexed,
    })
  }

  return {
    success: true,
    domain: targetHost,
    pagesCrawled: count,
    pages: indexed,
  }
}

/**
 * Get comprehensive overview stats of the local search engine
 */
export async function getLocalIndexStats() {
  const [totalPages, domainsList] = await Promise.all([
    countIndexedPages(),
    getAllIndexedDomains(),
  ])

  return {
    totalPages,
    totalDomains: domainsList.length,
    topDomains: domainsList.slice(0, 10),
  }
}

export const localIndexSearchTool = {
  schema: {
    description: 'Search Yogatik\'s private on-device local search index of crawled and indexed pages. 100% private, zero-cost, runs purely on the user\'s local device.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword or search query' },
        count: { type: 'number', description: 'Number of results to return (default 5)' },
        domain: { type: 'string', description: 'Optional domain filter (e.g. "github.com")' },
      },
      required: ['query'],
    },
  },
  async execute(args) {
    return await searchLocalIndex(args)
  },
}

export const localCrawlerTool = {
  schema: {
    description: 'Crawl and index a website or domain locally into Yogatik\'s private on-device search index at $0 cost.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL to begin crawling' },
        max_pages: { type: 'number', description: 'Maximum number of pages to crawl and index (1-30, default 8)' },
        depth: { type: 'number', description: 'Link traversal depth (1-3, default 2)' },
      },
      required: ['url'],
    },
  },
  async execute(args) {
    return await crawlSite({
      startUrl: args.url,
      maxPages: Math.min(Number(args.max_pages) || 8, 30),
      maxDepth: Math.min(Number(args.depth) || 2, 3),
    })
  },
}
