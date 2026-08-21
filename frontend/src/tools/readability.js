/**
 * Shared page-to-text extraction for the research tools.
 *
 * A scoring pass beats "grab <article> or <body>" because most pages bury the
 * content among nav, cookie banners, related-article rails and comment threads,
 * and the model cannot tell the difference once it is all one blob of text.
 */

const STRIP = [
  'form', 'button',
  'nav', 'header', 'footer', 'aside',
  '[role=navigation]', '[role=banner]', '[role=complementary]', '[aria-hidden=true]',
  '[class*=cookie]', '[class*=consent]', '[class*=newsletter]', '[class*=subscribe]',
  '[class*=advert]', '[class*=sidebar]', '[class*=related]', '[class*=recommend]',
  '[class*=share]', '[class*=social]', '[class*=comment]', '[class*=popup]',
  '[class*=modal]', '[class*=paywall]', '[id*=cookie]', '[id*=comment]',
].join(',')

const CANDIDATES = 'article, main, [role=main], [itemprop=articleBody], .post, .article, .content, #content, .entry-content, .markdown-body'

/** Density of real prose: long text with few links is usually the article. */
function score(el) {
  const text = el.textContent || ''
  if (text.length < 200) return 0
  const linkText = [...el.querySelectorAll('a')].reduce((n, a) => n + (a.textContent || '').length, 0)
  const linkRatio = linkText / text.length
  const paragraphs = el.querySelectorAll('p').length
  return text.length * (1 - Math.min(linkRatio, 0.95)) + paragraphs * 120
}

/** Metadata worth having: publication date tells the model how stale a claim is. */
function meta(doc) {
  const pick = (...sels) => {
    for (const s of sels) {
      const el = doc.querySelector(s)
      const v = el?.getAttribute?.('content') || el?.getAttribute?.('datetime') || el?.textContent
      if (v?.trim()) return v.trim()
    }
    return ''
  }
  return {
    title: pick('meta[property="og:title"]', 'meta[name="twitter:title"]', 'h1', 'title'),
    description: pick('meta[name=description]', 'meta[property="og:description"]'),
    published: pick(
      'meta[property="article:published_time"]', 'meta[name=date]',
      'meta[name="publish-date"]', 'time[datetime]',
    ),
    author: pick('meta[name=author]', 'meta[property="article:author"]', '[rel=author]'),
    site: pick('meta[property="og:site_name"]'),
  }
}

// ─── Structured Data Extractors ────────────────────────────────────────────

/** Extract HTML tables into structured { headers, rows } arrays. */
function extractTables(root) {
  const tables = []
  for (const table of [...root.querySelectorAll('table')].slice(0, 5)) {
    const headers = [...table.querySelectorAll('thead th, thead td, tr:first-child th')]
      .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    const rows = []
    const bodyRows = [...table.querySelectorAll('tbody tr, tr')].slice(headers.length ? 0 : 1, 25)
    for (const tr of bodyRows) {
      const cells = [...tr.querySelectorAll('td, th')]
        .map(td => (td.textContent || '').replace(/\s+/g, ' ').trim())
      if (cells.some(c => c.length > 0)) rows.push(cells)
    }
    if (headers.length >= 2 && rows.length >= 1) {
      tables.push({ headers, rows: rows.slice(0, 20) })
    }
  }
  return tables.length ? tables : undefined
}

/** Extract <pre><code> blocks with language detection. */
function extractCodeBlocks(root) {
  const blocks = []
  for (const pre of [...root.querySelectorAll('pre')].slice(0, 8)) {
    const code = pre.querySelector('code') || pre
    const text = (code.textContent || '').trim()
    if (text.length < 10) continue

    // Detect language from class names (e.g. "language-python", "hljs-javascript")
    let language = ''
    const cls = (code.className || '') + ' ' + (pre.className || '')
    const langMatch = cls.match(/(?:language-|lang-|hljs-)(\w+)/i)
    if (langMatch) language = langMatch[1]
    else if (/\bpython\b/i.test(cls)) language = 'python'
    else if (/\bjavascript|js\b/i.test(cls)) language = 'javascript'
    else if (/\btypescript|ts\b/i.test(cls)) language = 'typescript'
    else if (/\bbash|shell|sh\b/i.test(cls)) language = 'bash'

    blocks.push({ language: language || 'unknown', code: text.slice(0, 2000) })
  }
  return blocks.length ? blocks : undefined
}

/** Parse JSON-LD / schema.org structured data from the page. */
function extractJsonLd(doc) {
  const results = []
  for (const script of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, 5)) {
    try {
      const data = JSON.parse(script.textContent || '{}')
      if (!data || typeof data !== 'object') continue
      // Flatten arrays (some pages wrap in [])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items.slice(0, 3)) {
        const type = item['@type'] || 'Unknown'
        const entry = { type }
        if (item.name) entry.name = String(item.name).slice(0, 200)
        if (item.headline) entry.headline = String(item.headline).slice(0, 200)
        if (item.description) entry.description = String(item.description).slice(0, 300)
        if (item.datePublished) entry.datePublished = item.datePublished
        if (item.author) entry.author = typeof item.author === 'string' ? item.author : (item.author?.name || '')
        if (item.aggregateRating) entry.rating = item.aggregateRating
        if (item.mainEntity?.acceptedAnswer) entry.answer = String(item.mainEntity.acceptedAnswer.text || '').slice(0, 500)
        results.push(entry)
      }
    } catch { /* malformed JSON-LD, skip */ }
  }
  return results.length ? results : undefined
}

/** Extract image alt texts and figure captions for visual context. */
function extractImageContext(root) {
  const images = []
  for (const img of [...root.querySelectorAll('img[alt], figure img')].slice(0, 10)) {
    const alt = (img.getAttribute('alt') || '').trim()
    const figure = img.closest('figure')
    const caption = figure ? (figure.querySelector('figcaption')?.textContent || '').trim() : ''
    const src = img.getAttribute('src') || ''
    if ((alt.length > 5 || caption.length > 5) && !/placeholder|spacer|pixel|tracking/i.test(src)) {
      images.push({
        alt: alt.slice(0, 200) || undefined,
        caption: caption.slice(0, 300) || undefined,
        src: src.slice(0, 500) || undefined,
      })
    }
  }
  return images.length ? images : undefined
}

// ─── Main Extraction ───────────────────────────────────────────────────────

/**
 * @returns {{title,text,truncated,words,published,author,site,description,tables,code_blocks,json_ld,images}}
 */
export function extractReadable(html, { maxChars = 6000 } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const info = meta(doc)

  // Extract JSON-LD before stripping scripts
  const json_ld = extractJsonLd(doc)

  // Always safe to drop.
  doc.querySelectorAll('script, style, noscript, svg, iframe').forEach(el => el.remove())

  const bodyLen = (doc.body?.textContent || '').length || 1

  // Strip boilerplate, but never an element holding a large share of the page:
  // MDN nests its article inside a wrapper whose class contains "sidebar", and
  // removing that ancestor deleted the entire document.
  doc.querySelectorAll(STRIP).forEach(el => {
    if ((el.textContent || '').length / bodyLen < 0.4) el.remove()
  })

  // Pick the densest plausible container rather than trusting the first match.
  let best = null
  let bestScore = 0
  for (const el of doc.querySelectorAll(CANDIDATES)) {
    const s = score(el)
    if (s > bestScore) { best = el; bestScore = s }
  }
  if (!best || bestScore < 400) {
    for (const el of doc.querySelectorAll('div, section')) {
      const s = score(el)
      if (s > bestScore) { best = el; bestScore = s }
    }
  }
  const root = best || doc.body

  // Extract structured data from the content root
  const tables = extractTables(root)
  const code_blocks = extractCodeBlocks(root)
  const images = extractImageContext(root)

  // Keep block structure: headings and list items become lines, so the model
  // sees where sections start instead of one undifferentiated paragraph.
  const parts = []
  root.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre, td').forEach(el => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (t.length < 2) return
    const tag = el.tagName.toLowerCase()
    if (tag.startsWith('h')) parts.push(`\n## ${t}`)
    else if (tag === 'li') parts.push(`• ${t}`)
    else parts.push(t)
  })

  let text = (parts.join('\n') || root.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
  // Drop repeated boilerplate lines (cookie notices survive as duplicates).
  const seen = new Set()
  text = text.split('\n').filter(line => {
    const k = line.trim().toLowerCase()
    if (k.length < 25) return true
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).join('\n')

  const truncated = text.length > maxChars
  return {
    ...info,
    text: truncated ? text.slice(0, maxChars) : text,
    truncated,
    words: text.split(/\s+/).length,
    tables,
    code_blocks,
    json_ld,
    images,
  }
}
