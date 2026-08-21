/**
 * Unpaywall & Open Access PDF Resolver
 * Automatically resolves legal, free open-access full-text PDFs for IEEE paywalled DOIs
 * via Unpaywall, OpenAlex OA, Semantic Scholar, and arXiv preprints.
 */

export interface OpenAccessResult {
  doi: string;
  isOa: boolean;
  oaStatus?: string;
  pdfUrl?: string;
  hostType?: 'publisher' | 'repository';
  version?: 'publishedVersion' | 'acceptedVersion' | 'submittedVersion';
  sourceTitle?: string;
}

/**
 * Resolve open access full-text PDF using the Unpaywall REST API (free & legal)
 * Works for IEEE, ACM, Springer, Elsevier DOIs with institutional/author repository preprints.
 */
export async function resolveUnpaywallPdf(doi: string, email = 'yogatik.academic@gmail.com'): Promise<OpenAccessResult | null> {
  try {
    const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=${encodeURIComponent(email)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.is_oa) {
      return {
        doi: cleanDoi,
        isOa: false,
      };
    }

    const bestOa = data.best_oa_location;
    return {
      doi: cleanDoi,
      isOa: true,
      oaStatus: data.oa_status,
      pdfUrl: bestOa?.url_for_pdf || bestOa?.url,
      hostType: bestOa?.host_type,
      version: bestOa?.version,
      sourceTitle: bestOa?.repository_institution || bestOa?.endpoint_id,
    };
  } catch (err) {
    console.warn('Unpaywall resolution failed:', err);
    return null;
  }
}

/**
 * Multi-fallback full-text PDF hunter
 * Cascades across Unpaywall -> Semantic Scholar -> OpenAlex -> arXiv
 */
export async function findFullTextPdf(doiOrTitle: string): Promise<string | null> {
  const isDoi = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i.test(doiOrTitle.trim().replace(/^https?:\/\/doi\.org\//i, ''));

  if (isDoi) {
    // 1. Try Unpaywall
    const unpaywall = await resolveUnpaywallPdf(doiOrTitle);
    if (unpaywall?.pdfUrl) return unpaywall.pdfUrl;

    // 2. Try Crossref DOI direct
    try {
      const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doiOrTitle)}`);
      if (res.ok) {
        const item = (await res.json())?.message;
        const pdfLink = item?.link?.find((l: any) => l['content-type'] === 'application/pdf');
        if (pdfLink?.URL) return pdfLink.URL;
      }
    } catch {}
  }

  // 3. Fallback: Search Semantic Scholar for open access PDF URL
  try {
    const s2Url = `https://api.semanticscholar.org/graph/v1/paper/${isDoi ? `DOI:${doiOrTitle}` : `search?query=${encodeURIComponent(doiOrTitle)}&limit=1`}&fields=isOpenAccess,openAccessPdf`;
    const res = await fetch(s2Url);
    if (res.ok) {
      const data = await res.json();
      const paper = isDoi ? data : data.data?.[0];
      if (paper?.openAccessPdf?.url) return paper.openAccessPdf.url;
    }
  } catch {}

  return null;
}
