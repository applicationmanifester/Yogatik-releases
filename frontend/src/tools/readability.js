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

/**
 * @returns {{title,text,truncated,words,published,author,site,description}}
 */
export function extractReadable(html, { maxChars = 6000 } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const info = meta(doc)

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
  }
}
