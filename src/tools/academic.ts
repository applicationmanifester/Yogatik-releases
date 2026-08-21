/**
 * Academic Research & Paper Synthesis Engine
 * Uses open-access, keyless academic APIs: arXiv, OpenAlex, Semantic Scholar, Crossref
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

/**
 * Unified multi-source academic paper search
 */
export async function unifiedAcademicSearch(query: string, limit = 10): Promise<AcademicPaper[]> {
  const [arxivResults, openAlexResults, semanticResults] = await Promise.all([
    searchArxiv(query, Math.ceil(limit / 2)),
    searchOpenAlex(query, Math.ceil(limit / 2)),
    searchSemanticScholar(query, Math.ceil(limit / 2)),
  ]);

  const all = [...arxivResults, ...openAlexResults, ...semanticResults];
  const uniqueMap = new Map<string, AcademicPaper>();

  for (const paper of all) {
    const normalizedTitle = paper.title.toLowerCase().trim();
    if (!uniqueMap.has(normalizedTitle)) {
      uniqueMap.set(normalizedTitle, paper);
    }
  }

  return Array.from(uniqueMap.values()).slice(0, limit);
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
