/**
 * Citation Manager — Academic Citation Resolution & Format Exporter
 *
 * Supports:
 *  - DOI resolution via Crossref / OpenAlex API
 *  - Automated BibTeX entry generation
 *  - CSL-JSON export compatible with Zotero and Mendeley
 *  - Citation graph indexing
 */

export interface CitationItem {
  doi?: string
  title: string
  authors: string[]
  year: number
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  url?: string
  abstract?: string
  citationCount?: number
}

export interface CslJsonItem {
  id: string
  type: 'article-journal' | 'paper-conference' | 'book' | 'chapter'
  title: string
  author: Array<{ given?: string; family: string }>
  'container-title'?: string
  volume?: string
  issue?: string
  page?: string
  DOI?: string
  URL?: string
  issued: { 'date-parts': number[][] }
}

/**
 * Resolves a DOI into structured citation metadata using Crossref API
 */
export async function resolveDoi(doi: string): Promise<CitationItem | null> {
  const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, '')
  if (!cleanDoi) return null

  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Yogatik-Research/2.0 (mailto:support@yogatik.app)',
        Accept: 'application/json',
      },
    })

    if (!resp.ok) return null
    const data = await resp.json()
    const msg = data.message

    const authors = Array.isArray(msg.author)
      ? msg.author.map((a: { given?: string; family?: string; name?: string }) =>
          a.name || `${a.given ? a.given + ' ' : ''}${a.family || ''}`.trim()
        )
      : ['Unknown Author']

    const year =
      msg['published-print']?.['date-parts']?.[0]?.[0] ||
      msg['published-online']?.['date-parts']?.[0]?.[0] ||
      msg.created?.['date-parts']?.[0]?.[0] ||
      new Date().getFullYear()

    return {
      doi: cleanDoi,
      title: Array.isArray(msg.title) ? msg.title[0] : msg.title || 'Untitled',
      authors,
      year,
      journal: Array.isArray(msg['container-title']) ? msg['container-title'][0] : msg['container-title'],
      volume: msg.volume,
      issue: msg.issue,
      pages: msg.page,
      publisher: msg.publisher,
      url: msg.URL || `https://doi.org/${cleanDoi}`,
      abstract: msg.abstract,
      citationCount: msg['is-referenced-by-count'] || 0,
    }
  } catch (err) {
    console.warn('[CitationManager] Crossref resolution failed:', err)
    return null
  }
}

/**
 * Converts citation metadata to a clean BibTeX entry
 */
export function formatBibtex(item: CitationItem): string {
  const firstAuthor = item.authors[0]?.split(' ').pop()?.toLowerCase() || 'author'
  const citeKey = `${firstAuthor}${item.year}${item.title.split(' ')[0]?.toLowerCase().replace(/\W/g, '') || ''}`

  const fields: string[] = [
    `  title = {${item.title}}`,
    `  author = {${item.authors.join(' and ')}}`,
    `  year = {${item.year}}`,
  ]

  if (item.journal) fields.push(`  journal = {${item.journal}}`)
  if (item.volume) fields.push(`  volume = {${item.volume}}`)
  if (item.issue) fields.push(`  number = {${item.issue}}`)
  if (item.pages) fields.push(`  pages = {${item.pages}}`)
  if (item.publisher) fields.push(`  publisher = {${item.publisher}}`)
  if (item.doi) fields.push(`  doi = {${item.doi}}`)
  if (item.url) fields.push(`  url = {${item.url}}`)

  return `@article{${citeKey},\n${fields.join(',\n')}\n}`
}

/**
 * Converts citation items to CSL-JSON format (used by Zotero, Mendeley, Pandoc)
 */
export function formatCslJson(items: CitationItem[]): CslJsonItem[] {
  return items.map((item, idx) => {
    const authors = item.authors.map((authorStr) => {
      const parts = authorStr.trim().split(' ')
      if (parts.length === 1) return { family: parts[0] }
      const family = parts.pop() || ''
      const given = parts.join(' ')
      return { given, family }
    })

    return {
      id: item.doi || `cite_${idx + 1}`,
      type: 'article-journal',
      title: item.title,
      author: authors,
      'container-title': item.journal,
      volume: item.volume,
      issue: item.issue,
      page: item.pages,
      DOI: item.doi,
      URL: item.url,
      issued: {
        'date-parts': [[item.year]],
      },
    }
  })
}
