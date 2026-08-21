/**
 * IEEE-Targeted Research Agent
 * 
 * Capabilities the base academic.ts lacked:
 *   1. IEEE venue-filtered search via OpenAlex source filter
 *   2. Crossref journal-scoped search for specific IEEE Transactions
 *   3. Research gap analysis — extracts limitations & future work from abstracts
 *   4. Problem statement generator — synthesizes a novel research proposal
 *   5. Full research workflow orchestrator — chains search → analyze → propose
 */

import type { AcademicPaper } from './academic';
import { searchSemanticScholar } from './academic';

// ─── IEEE journal identifiers ───────────────────────────────────────────────

/** Known IEEE Transactions and their OpenAlex Source IDs / ISSN prefixes */
export const IEEE_VENUES: Record<string, { openAlexSourceId?: string; issnPrefix?: string; fullName: string }> = {
  'TVLSI':  { openAlexSourceId: 'S70989754',  fullName: 'IEEE Transactions on Very Large Scale Integration (VLSI) Systems' },
  'TCAD':   { openAlexSourceId: 'S150988509', fullName: 'IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems' },
  'TPAMI':  { openAlexSourceId: 'S137773608', fullName: 'IEEE Transactions on Pattern Analysis and Machine Intelligence' },
  'TSP':    { openAlexSourceId: 'S92561886',  fullName: 'IEEE Transactions on Signal Processing' },
  'TNNLS':  { openAlexSourceId: 'S13570488',  fullName: 'IEEE Transactions on Neural Networks and Learning Systems' },
  'TC':     { openAlexSourceId: 'S95457808',  fullName: 'IEEE Transactions on Computers' },
  'TECS':   { openAlexSourceId: 'S198228070', fullName: 'ACM Transactions on Embedded Computing Systems' },
  'ACCESS': { openAlexSourceId: 'S2764812631', fullName: 'IEEE Access' },
};

// ─── 1. IEEE Venue-Filtered Search (OpenAlex) ──────────────────────────────

export interface IEEESearchOptions {
  query: string;
  venueKey?: keyof typeof IEEE_VENUES;  // e.g. 'TVLSI'
  fromYear?: number;
  toYear?: number;
  sortBy?: 'relevance' | 'date' | 'cited_by_count';
  limit?: number;
}

/**
 * Search OpenAlex specifically for IEEE Transactions papers.
 * Supports venue filter, date range, and sort order.
 */
export async function searchIEEEOpenAlex(opts: IEEESearchOptions): Promise<AcademicPaper[]> {
  try {
    const { query, venueKey, fromYear, toYear, sortBy = 'date', limit = 10 } = opts;

    // Build OpenAlex filter string
    const filters: string[] = [];
    if (venueKey && IEEE_VENUES[venueKey]?.openAlexSourceId) {
      filters.push(`primary_location.source.id:${IEEE_VENUES[venueKey].openAlexSourceId}`);
    }
    if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
    if (toYear)   filters.push(`to_publication_date:${toYear}-12-31`);

    const filterParam = filters.length > 0 ? `&filter=${filters.join(',')}` : '';
    const sortParam = sortBy === 'date' ? '&sort=publication_date:desc'
                    : sortBy === 'cited_by_count' ? '&sort=cited_by_count:desc'
                    : '';

    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}${filterParam}${sortParam}&per-page=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.results || []).map((work: any) => {
      const authors = (work.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean);

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
        title: work.display_name || 'Untitled',
        authors,
        year: work.publication_year,
        venue: work.primary_location?.source?.display_name,
        doi: work.doi ? work.doi.replace('https://doi.org/', '') : undefined,
        abstract,
        openAccessPdfUrl: work.open_access?.oa_url || undefined,
        citationCount: work.cited_by_count,
        url: work.doi || work.id,
        source: 'openalex' as const,
      };
    });
  } catch (error) {
    console.warn('IEEE OpenAlex search failed:', error);
    return [];
  }
}

// ─── 2. Crossref Journal-Scoped Search ──────────────────────────────────────

/**
 * Search Crossref for papers published in a specific IEEE journal (by ISSN or container-title).
 * This directly hits the Crossref REST API with journal-level filtering.
 */
export async function searchCrossrefJournal(query: string, journalName: string, limit = 10, sortBy: 'relevance' | 'published' = 'published'): Promise<AcademicPaper[]> {
  try {
    const sort = sortBy === 'published' ? '&sort=published&order=desc' : '';
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&query.container-title=${encodeURIComponent(journalName)}&rows=${limit}${sort}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const items = data.message?.items || [];

    return items.map((item: any) => {
      const authors = (item.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
      const title = Array.isArray(item.title) ? item.title[0] : (item.title || 'Untitled');
      const venue = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'];
      const year = item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0];
      let abstract = item.abstract || '';
      abstract = abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      return {
        id: item.DOI,
        title,
        authors,
        year,
        venue,
        doi: item.DOI,
        abstract,
        openAccessPdfUrl: undefined,
        citationCount: item['is-referenced-by-count'] || 0,
        url: `https://doi.org/${item.DOI}`,
        source: 'crossref' as const,
      };
    });
  } catch (error) {
    console.warn('Crossref journal search failed:', error);
    return [];
  }
}

// ─── 3. Research Gap Analyzer ───────────────────────────────────────────────

export interface ResearchGap {
  paperTitle: string;
  paperDoi?: string;
  limitations: string[];
  futureWorkDirections: string[];
  methodologyWeaknesses: string[];
  keywords: string[];
}

/**
 * Heuristic research gap extraction from paper abstracts.
 * Looks for phrases like "however", "limitation", "future work", "remains", "challenge".
 */
export function analyzeResearchGaps(papers: AcademicPaper[]): ResearchGap[] {
  const limitationPatterns = [
    /however[,\s]+([^.]+\.)/gi,
    /limitation[s]?\s+(?:include|are|is)[:\s]+([^.]+\.)/gi,
    /(?:does not|cannot|do not|fails to)\s+([^.]+\.)/gi,
    /(?:lack[s]?\s+of|absence\s+of)\s+([^.]+\.)/gi,
    /(?:suffers?\s+from)\s+([^.]+\.)/gi,
    /(?:restricted|constrained)\s+(?:to|by)\s+([^.]+\.)/gi,
    /(?:remain[s]?\s+(?:a\s+)?(?:challenge|open\s+problem|unsolved))[:\s]*([^.]*\.)/gi,
  ];

  const futureWorkPatterns = [
    /future\s+(?:work|research|direction[s]?|stud(?:y|ies))\s+(?:include[s]?|could|should|will|may|can)[:\s]+([^.]+\.)/gi,
    /(?:can\s+be\s+extended|could\s+be\s+improved)\s+([^.]+\.)/gi,
    /(?:open\s+(?:problem|question|challenge))[:\s]*([^.]+\.)/gi,
    /(?:it\s+would\s+be\s+interesting\s+to)\s+([^.]+\.)/gi,
  ];

  const weaknessPatterns = [
    /(?:high\s+(?:overhead|latency|power|area))\s*([^.]*\.)/gi,
    /(?:exponential|quadratic)\s+(?:time|space|complexity)\s*([^.]*\.)/gi,
    /(?:scalability)\s+(?:issue[s]?|concern[s]?|limitation[s]?)\s*([^.]*\.)/gi,
    /(?:only\s+(?:considers?|supports?|handles?))\s+([^.]+\.)/gi,
  ];

  return papers.map((paper) => {
    const text = paper.abstract || '';
    const extract = (patterns: RegExp[]): string[] => {
      const results: string[] = [];
      for (const pattern of patterns) {
        let match;
        const p = new RegExp(pattern.source, pattern.flags);
        while ((match = p.exec(text)) !== null) {
          const snippet = (match[1] || match[0]).trim();
          if (snippet.length > 10 && snippet.length < 400) {
            results.push(snippet);
          }
        }
      }
      return [...new Set(results)];
    };

    // Extract domain keywords (simple: capitalize-significant words from the title)
    const stopWords = new Set(['a','an','the','of','in','on','for','to','and','with','by','from','is','are','at','as','or','using','based','via']);
    const keywords = paper.title
      .replace(/[^a-zA-Z\s-]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
      .slice(0, 8);

    return {
      paperTitle: paper.title,
      paperDoi: paper.doi,
      limitations: extract(limitationPatterns),
      futureWorkDirections: extract(futureWorkPatterns),
      methodologyWeaknesses: extract(weaknessPatterns),
      keywords,
    };
  });
}

// ─── 4. Problem Statement & Research Proposal Generator ─────────────────────

export interface ResearchProposal {
  title: string;
  problemStatement: string;
  objectives: string[];
  methodology: string;
  expectedOutcome: string;
  targetVenue: string;
  basedOnPapers: { title: string; doi?: string }[];
  keywords: string[];
}

/**
 * Synthesize a research proposal from analyzed gaps.
 * This is a structured extraction engine — the LLM refines the proposal in conversation.
 */
export function generateResearchProposal(
  topic: string,
  gaps: ResearchGap[],
  basePapers: AcademicPaper[],
  targetVenue = 'IEEE Transactions on VLSI Systems'
): ResearchProposal {
  // Collect all identified gaps and keywords across papers
  const allLimitations = gaps.flatMap((g) => g.limitations);
  const allFutureWork = gaps.flatMap((g) => g.futureWorkDirections);
  const allWeaknesses = gaps.flatMap((g) => g.methodologyWeaknesses);
  const allKeywords = [...new Set(gaps.flatMap((g) => g.keywords))];

  // Build problem statement from identified gaps
  const gapSummary = [
    ...allLimitations.slice(0, 3),
    ...allWeaknesses.slice(0, 2),
  ].join(' Furthermore, ');

  const futureDirections = allFutureWork.slice(0, 3).join(' Additionally, ');

  const problemStatement = gapSummary
    ? `Existing approaches in ${topic} face the following challenges: ${gapSummary} ${futureDirections ? `Recent literature suggests: ${futureDirections}` : ''} There is a critical need for a novel methodology that addresses these shortcomings while maintaining competitive performance metrics.`
    : `The field of ${topic} continues to evolve with increasing demands for efficiency, scalability, and reliability. Current state-of-the-art methods, while effective, leave room for improvement in power consumption, area optimization, and verification coverage. This proposal aims to bridge these gaps through a systematic and novel approach.`;

  // Derive objectives from gaps
  const objectives: string[] = [];
  if (allLimitations.length > 0 && allLimitations[0]) {
    objectives.push(`Address the identified limitation: ${allLimitations[0].substring(0, 120)}`);
  }
  if (allWeaknesses.length > 0 && allWeaknesses[0]) {
    objectives.push(`Overcome methodology weakness: ${allWeaknesses[0].substring(0, 120)}`);
  }
  objectives.push(`Develop a novel framework for ${topic} with improved performance metrics`);
  objectives.push(`Validate the proposed approach through comprehensive experimental evaluation`);
  objectives.push(`Compare results against state-of-the-art baselines from recent IEEE publications`);

  // Methodology skeleton
  const methodology = [
    `Phase 1 — Literature Survey: Systematic review of ${basePapers.length}+ recent ${targetVenue} papers on ${topic}.`,
    `Phase 2 — Problem Formulation: Formal definition of the optimization/verification problem with mathematical modeling.`,
    `Phase 3 — Proposed Architecture: Design a novel approach that addresses identified gaps in ${allKeywords.slice(0, 4).join(', ')}.`,
    `Phase 4 — Implementation: RTL/SystemVerilog implementation with industry-standard EDA tools (Synopsys, Cadence, or open-source Yosys/OpenROAD).`,
    `Phase 5 — Experimental Validation: Benchmark against ISCAS/IWLS/OpenCores suites; measure area, power, timing, and coverage metrics.`,
    `Phase 6 — Paper Preparation: IEEE Transactions format (IEEEtran), targeting ${targetVenue}.`,
  ].join('\n');

  const expectedOutcome = `A peer-reviewed research contribution to ${targetVenue} demonstrating measurable improvements over existing methods in ${allKeywords.slice(0, 3).join(', ')}. Expected deliverables include: (1) a novel methodology/framework, (2) open-source implementation or reproducible benchmarks, (3) comprehensive experimental results with statistical analysis.`;

  return {
    title: `A Novel Approach to ${topic}: Addressing ${allKeywords.slice(0, 3).join(', ')} Challenges`,
    problemStatement,
    objectives,
    methodology,
    expectedOutcome,
    targetVenue,
    basedOnPapers: basePapers.map((p) => ({ title: p.title, doi: p.doi })),
    keywords: allKeywords,
  };
}

// ─── 5. Full Research Workflow Orchestrator ──────────────────────────────────

export interface ResearchWorkflowResult {
  searchResults: AcademicPaper[];
  gapAnalysis: ResearchGap[];
  proposal: ResearchProposal;
  recommendedPaper: AcademicPaper | null;
}

/**
 * End-to-end IEEE research workflow:
 *   1. Search for recent IEEE Transactions papers on a topic
 *   2. Analyze each paper for research gaps
 *   3. Identify the most promising base paper
 *   4. Generate a structured research proposal
 */
export async function executeResearchWorkflow(
  topic: string,
  venueKey: keyof typeof IEEE_VENUES = 'TVLSI',
  limit = 10,
): Promise<ResearchWorkflowResult> {
  const currentYear = new Date().getFullYear();

  // Step 1: Multi-source IEEE-targeted search
  const venueName = IEEE_VENUES[venueKey]?.fullName || 'IEEE Transactions';
  
  const [ieeeResults, crossrefResults, semanticResults] = await Promise.all([
    searchIEEEOpenAlex({ query: topic, venueKey, fromYear: currentYear - 3, sortBy: 'date', limit }),
    searchCrossrefJournal(topic, venueName, Math.ceil(limit / 2), 'published'),
    searchSemanticScholar(`${topic} ${venueName}`, Math.ceil(limit / 2)),
  ]);

  // Deduplicate by normalized title
  const uniqueMap = new Map<string, AcademicPaper>();
  for (const paper of [...ieeeResults, ...crossrefResults, ...semanticResults]) {
    const key = paper.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, paper);
    }
  }

  const searchResults = Array.from(uniqueMap.values())
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .slice(0, limit);

  // Step 2: Analyze gaps across all found papers
  const gapAnalysis = analyzeResearchGaps(searchResults);

  // Step 3: Recommend the best base paper (recent + high citations + identified gaps)
  let recommendedPaper: AcademicPaper | null = null;
  let bestScore = -1;
  for (let i = 0; i < searchResults.length; i++) {
    const paper = searchResults[i];
    const gap = gapAnalysis[i];
    if (!paper || !gap) continue;
    const recencyScore = (paper.year || 2020) - 2020;
    const gapScore = (gap.limitations.length + gap.futureWorkDirections.length + gap.methodologyWeaknesses.length) * 3;
    const citationScore = Math.min((paper.citationCount || 0) / 10, 10);
    const abstractScore = (paper.abstract?.length || 0) > 100 ? 5 : 0;
    const doiScore = paper.doi ? 5 : 0;
    const total = recencyScore + gapScore + citationScore + abstractScore + doiScore;
    if (total > bestScore) {
      bestScore = total;
      recommendedPaper = paper;
    }
  }

  // Step 4: Generate research proposal
  const proposal = generateResearchProposal(topic, gapAnalysis, searchResults, venueName);

  return { searchResults, gapAnalysis, proposal, recommendedPaper };
}
