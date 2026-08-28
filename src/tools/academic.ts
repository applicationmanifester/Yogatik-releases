/**
 * Academic Research & Paper Synthesis Engine
 * Direct Crossref, IEEE DOI Resolver, arXiv, OpenAlex, Semantic Scholar
 */

export interface AcademicPaper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  abstract: string;
  openAccessPdfUrl?: string;
  citationCount?: number;
  url: string;
  source: 'arxiv' | 'openalex' | 'semanticscholar' | 'crossref';
}

export interface CitationNode {
  id: string;
  title: string;
  year?: number;
  citations: number;
  references: string[];
}

/**
 * Direct DOI Lookup (Crossref API) — works on all IEEE Transactions & journals (e.g. 10.1109/...)
 */
export async function lookupDOI(doi: string): Promise<AcademicPaper | null> {
  try {
    const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
    const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const item = data.message;
    if (!item) return null;

    const authors = (item.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
    const title = Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled');
    const venue = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'];
    const year = item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0];
    
    // Abstract cleaning (Crossref often embeds JATS XML tags like <jats:p>)
    let abstract = item.abstract || '';
    abstract = abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Check Open Access link
    let openAccessPdfUrl: string | undefined;
    if (Array.isArray(item.link)) {
      const pdfLink = item.link.find((l: any) => l['content-type'] === 'application/pdf');
      if (pdfLink) openAccessPdfUrl = pdfLink.URL;
    }

    return {
      id: item.DOI,
      title,
      authors,
      year,
      venue,
      doi: item.DOI,
      abstract,
      openAccessPdfUrl,
      citationCount: item['is-referenced-by-count'] || 0,
      url: `https://doi.org/${item.DOI}`,
      source: 'crossref',
    };
  } catch (error) {
    console.warn('Crossref DOI lookup failed:', error);
    return null;
  }
}

/**
 * Search papers on arXiv (Computer Science, Electrical Engineering, AI, Physics, Math)
 */
export async function searchArxiv(query: string, maxResults = 5): Promise<AcademicPaper[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodedQuery}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    const entries = xmlDoc.getElementsByTagName('entry');

    const papers: AcademicPaper[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;

      const id = entry.getElementsByTagName('id')[0]?.textContent ?? '';
      const title = entry.getElementsByTagName('title')[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? 'Untitled';
      const summary = entry.getElementsByTagName('summary')[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const published = entry.getElementsByTagName('published')[0]?.textContent;
      const year = published ? new Date(published).getFullYear() : undefined;

      const authorTags = entry.getElementsByTagName('author');
      const authors: string[] = [];
      for (let j = 0; j < authorTags.length; j++) {
        const name = authorTags[j]?.getElementsByTagName('name')[0]?.textContent;
        if (name) authors.push(name.trim());
      }

      // PDF link
      const links = entry.getElementsByTagName('link');
      let pdfUrl: string | undefined;
      for (let k = 0; k < links.length; k++) {
        const link = links[k];
        if (link?.getAttribute('title') === 'pdf') {
          pdfUrl = link.getAttribute('href') ?? undefined;
          break;
        }
      }

      papers.push({
        id,
        title,
        authors,
        year,
        abstract: summary,
        openAccessPdfUrl: pdfUrl,
        url: id,
        source: 'arxiv',
      });
    }

    return papers;
  } catch (error) {
    console.warn('arXiv search failed:', error);
    return [];
  }
}

/**
 * Search papers on OpenAlex (Global academic corpus including IEEE, Springer, ACM, etc.)
 */
export async function searchOpenAlex(query: string, maxResults = 5): Promise<AcademicPaper[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.openalex.org/works?search=${encodedQuery}&per-page=${maxResults}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const results = data.results || [];

    return results.map((work: any) => {
      const authors = (work.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean);
      
      // OpenAlex abstracts are stored as inverted index
      let abstract = '';
      if (work.abstract_inverted_index) {
        const words: [number, string][] = [];
        for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
          for (const pos of positions as number[]) {
            words.push([pos, word]);
          }
        }
        words.sort((a, b) => a[0] - b[0]);
        abstract = words.map((w) => w[1]).join(' ');
      }

      return {
        id: work.id,
        title: work.display_name || work.title || 'Untitled',
        authors,
        year: work.publication_year,
        venue: work.primary_location?.source?.display_name,
        doi: work.doi ? work.doi.replace('https://doi.org/', '') : undefined,
        abstract,
        openAccessPdfUrl: work.open_access?.oa_url || undefined,
        citationCount: work.cited_by_count,
        url: work.doi || work.id,
        source: 'openalex',
      };
    });
  } catch (error) {
    console.warn('OpenAlex search failed:', error);
    return [];
  }
}

/**
 * Search Semantic Scholar Open API
 */
export async function searchSemanticScholar(query: string, maxResults = 5): Promise<AcademicPaper[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=${maxResults}&fields=title,authors,year,abstract,citationCount,isOpenAccess,openAccessPdf,url,venue,externalIds`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const papers = data.data || [];

    return papers.map((p: any) => ({
      id: p.paperId,
      title: p.title,
      authors: (p.authors || []).map((a: any) => a.name),
      year: p.year,
      venue: p.venue,
      doi: p.externalIds?.DOI,
      abstract: p.abstract || '',
      openAccessPdfUrl: p.openAccessPdf?.url,
      citationCount: p.citationCount,
      url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
      source: 'semanticscholar',
    }));
  } catch (error) {
    console.warn('Semantic Scholar search failed:', error);
    return [];
  }
}

import { academicCache } from '../services/academicCache'

/**
 * Unified multi-source academic paper search (supports DOI or keyword queries) with caching & ranking
 */
export async function unifiedAcademicSearch(query: string, limit = 10): Promise<AcademicPaper[]> {
  const trimmed = query.trim();
  
  // 1. Check cache
  const cached = await academicCache.get(trimmed, limit)
  if (cached && cached.length > 0) return cached

  // If query is a DOI (e.g. "10.1109/TPAMI.2023.1234567" or "https://doi.org/10.1109/...")
  if (/^(https?:\/\/doi\.org\/)?10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i.test(trimmed)) {
    const doiResult = await lookupDOI(trimmed);
    if (doiResult) {
      await academicCache.set(trimmed, [doiResult], 3600000, limit)
      return [doiResult];
    }
  }

  const fetchLimit = Math.ceil(limit * 1.5)
  const [arxivResults, openAlexResults, semanticResults] = await Promise.all([
    searchArxiv(query, fetchLimit),
    searchOpenAlex(query, fetchLimit),
    searchSemanticScholar(query, fetchLimit),
  ]);

  const all = [...arxivResults, ...openAlexResults, ...semanticResults];
  const uniqueMap = new Map<string, AcademicPaper>();

  for (const paper of all) {
    const key = paper.doi ? paper.doi.toLowerCase() : paper.title.toLowerCase().trim();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, paper);
    }
  }

  // Rank by: (title match score * 3) + (recency score * 2) + log10(citations + 1)
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const ranked = Array.from(uniqueMap.values()).sort((a, b) => {
    const aTitleMatch = queryWords.filter((w) => a.title.toLowerCase().includes(w)).length
    const bTitleMatch = queryWords.filter((w) => b.title.toLowerCase().includes(w)).length

    const aYearScore = (a.year || 2020) - 2020
    const bYearScore = (b.year || 2020) - 2020

    const aCiteScore = Math.log10((a.citationCount || 0) + 1)
    const bCiteScore = Math.log10((b.citationCount || 0) + 1)

    const aScore = aTitleMatch * 3 + aYearScore * 0.5 + aCiteScore * 2
    const bScore = bTitleMatch * 3 + bYearScore * 0.5 + bCiteScore * 2

    return bScore - aScore
  })

  const results = ranked.slice(0, limit);
  await academicCache.set(trimmed, results, 3600000, limit)
  return results;
}

/**
 * IEEE / ACM Standard Academic Paper LaTeX & Markdown Template Generator
 */
export function generateAcademicPaperTemplate(data: {
  title: string;
  authors: string[];
  abstract: string;
  keywords: string[];
  introduction: string;
  relatedWork: string;
  methodology: string;
  experimentalResults: string;
  conclusion: string;
  references: string[];
}): { markdown: string; latex: string } {
  const markdown = `# ${data.title}

**Authors:** ${data.authors.join(', ')}

## Abstract
${data.abstract}

**Keywords:** ${data.keywords.join(', ')}

---

## 1. Introduction
${data.introduction}

## 2. Related Work & IEEE Foundation
${data.relatedWork}

## 3. Proposed Methodology & Architecture
${data.methodology}

## 4. Experimental Results & Verification
${data.experimentalResults}

## 5. Conclusion & Future Directions
${data.conclusion}

## References
${data.references.map((ref, idx) => `[${idx + 1}] ${ref}`).join('\n')}
`;

  const latex = `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath,amsfonts,amssymb}
\\usepackage{graphicx}
\\usepackage{cite}

\\begin{document}

\\title{${data.title}}

\\author{${data.authors.map((a) => `\\IEEEauthorblockN{${a}}`).join(' \\and ')}}

\\maketitle

\\begin{abstract}
${data.abstract}
\\end{abstract}

\\begin{IEEEkeywords}
${data.keywords.join(', ')}
\\end{IEEEkeywords}

\\section{Introduction}
${data.introduction}

\\section{Related Work}
${data.relatedWork}

\\section{Proposed Methodology}
${data.methodology}

\\section{Experiments and Results}
${data.experimentalResults}

\\section{Conclusion}
${data.conclusion}

\\begin{thebibliography}{99}
${data.references.map((ref, idx) => `\\bibitem{ref${idx + 1}} ${ref}`).join('\n')}
\\end{thebibliography}

\\end{document}
`;

  return { markdown, latex };
}
