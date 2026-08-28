/**
 * Enhanced Research Swarm Agents
 * Real LLM-driven agents replacing the mock implementation in researchSwarm.ts
 */

import { BaseAgent, AgentConfig, AgentDependencies, AgentCapability, AgentResult, z } from './AgentFramework';
import { AcademicPaper, ResearchGap } from '../tools/academic';
import { analyzeResearchGaps, searchIEEEOpenAlex, searchCrossrefJournal } from '../tools/ieeeResearchAgent';

// ─── Shared Types ──────────────────────────────────────────────────────────────

export interface ResearchProposal {
  title: string;
  problemStatement: string;
  methodology: string;
  expectedOutcome: string;
  targetVenue?: string;
  keywords: string[];
  relatedWork: string[];
  noveltyClaim: string;
}

export interface AgentReview {
  agentId: string;
  agentRole: string;
  critique: string;
  strengths: string[];
  weaknesses: string[];
  suggestedRevisions: string[];
  scoreOutOf10: number;
  confidence: number;
  evidence: string[]; // Citations or reasoning traces
}

export interface ConsensusReport {
  overallScore: number;
  verdict: 'Accept' | 'Minor Revision' | 'Major Revision' | 'Reject';
  reviews: AgentReview[];
  synthesizedRefinements: string[];
  dissentingViews: string[];
  metadata: {
    rounds: number;
    agreementScore: number;
    totalTokens: number;
  };
}

// ─── Capability Definitions ────────────────────────────────────────────────────

export const RESEARCH_CAPABILITIES: AgentCapability[] = [
  {
    id: 'literature_search',
    name: 'Literature Search',
    description: 'Search academic databases for relevant papers',
    inputSchema: z.object({ query: z.string(), venue: z.string().optional(), limit: z.number().optional() }),
    outputSchema: z.array(z.any()),
    requiredTools: ['searchIEEEOpenAlex', 'searchCrossrefJournal'],
    costEstimate: 'medium',
  },
  {
    id: 'gap_analysis',
    name: 'Research Gap Analysis',
    description: 'Extract limitations and future work directions from papers',
    inputSchema: z.array(z.any()),
    outputSchema: z.array(z.any()),
    requiredTools: [],
    costEstimate: 'low',
  },
  {
    id: 'proposal_generation',
    name: 'Research Proposal Generation',
    description: 'Synthesize a novel research proposal from gaps',
    inputSchema: z.object({ gaps: z.array(z.any()), domain: z.string() }),
    outputSchema: z.any(),
    requiredTools: [],
    costEstimate: 'high',
  },
  {
    id: 'peer_review',
    name: 'Peer Review',
    description: 'Critique a research proposal from a specific perspective',
    inputSchema: z.object({ proposal: z.any(), perspective: z.string() }),
    outputSchema: z.any(),
    requiredTools: [],
    costEstimate: 'medium',
  },
];

// ─── Agent 1: Literature Scout ─────────────────────────────────────────────────

export class LiteratureScoutAgent extends BaseAgent<
  { query: string; venue?: string; limit?: number; fromYear?: number },
  AcademicPaper[]
> {
  constructor(deps: AgentDependencies) {
    super({
      id: 'literature_scout',
      name: 'Literature Scout',
      description: 'Searches IEEE venues and cross-references across databases for comprehensive coverage',
      version: '2.0.0',
      capabilities: [RESEARCH_CAPABILITIES[0]],
      requiredTools: ['searchIEEEOpenAlex', 'searchCrossrefJournal'],
    }, deps);
  }

  async execute(input: { query: string; venue?: string; limit?: number; fromYear?: number }): Promise<AgentResult<AcademicPaper[]>> {
    const start = Date.now();
    this.emit('agent:progress', { stage: 'searching', progress: 10, message: `Searching for: ${input.query}` });

    try {
      // Parallel search across sources
      const [ieeeResults, crossrefResults, semanticResults] = await Promise.all([
        this.callTool('searchIEEEOpenAlex', {
          query: input.query,
          venueKey: input.venue as any,
          fromYear: input.fromYear,
          limit: input.limit || 15,
          sortBy: 'cited_by_count',
        }),
        this.callTool('searchCrossrefJournal', {
          query: input.query,
          journalName: input.venue ? `IEEE Transactions on ${input.venue}` : 'IEEE',
          limit: input.limit || 10,
        }),
        this.callTool('searchSemanticScholar', {
          query: input.query,
          limit: input.limit || 10,
        }),
      ]);

      // Deduplicate by DOI
      const allResults = [...ieeeResults, ...crossrefResults, ...semanticResults];
      const unique = this.deduplicateByDOI(allResults);
      
      // Rank by relevance (citation count + recency + venue prestige)
      const ranked = this.rankResults(unique, input.query);

      this.emit('agent:progress', { stage: 'complete', progress: 100, message: `Found ${ranked.length} unique papers` });

      return {
        success: true,
        output: ranked.slice(0, input.limit || 20),
        metadata: { durationMs: Date.now() - start, toolsUsed: ['searchIEEEOpenAlex', 'searchCrossrefJournal', 'searchSemanticScholar'] },
      };
    } catch (error) {
      return { success: false, error: error.message, metadata: { durationMs: Date.now() - start, toolsUsed: [] } };
    }
  }

  private deduplicateByDOI(papers: AcademicPaper[]): AcademicPaper[] {
    const seen = new Set<string>();
    return papers.filter(p => {
      if (!p.doi) return true;
      if (seen.has(p.doi)) return false;
      seen.add(p.doi);
      return true;
    });
  }

  private rankResults(papers: AcademicPaper[], query: string): AcademicPaper[] {
    return papers
      .map(p => ({
        paper: p,
        score: (p.citationCount || 0) * 0.4 + 
               (p.year ? (p.year - 2020) * 2 : 0) * 0.3 + 
               (p.venue?.includes('IEEE') ? 10 : 0) * 0.3,
      }))
      .sort((a, b) => b.score - a.score)
      .map(r => r.paper);
  }
}

// ─── Agent 2: Gap Analyst ──────────────────────────────────────────────────────

export class GapAnalystAgent extends BaseAgent<AcademicPaper[], ResearchGap[]> {
  constructor(deps: AgentDependencies) {
    super({
      id: 'gap_analyst',
      name: 'Gap Analyst',
      description: 'Performs deep LLM-driven gap analysis beyond regex patterns',
      version: '2.0.0',
      capabilities: [RESEARCH_CAPABILITIES[1]],
      requiredTools: [],
    }, deps);
  }

  async execute(papers: AcademicPaper[]): Promise<AgentResult<ResearchGap[]>> {
    const start = Date.now();
    this.emit('agent:progress', { stage: 'analyzing', progress: 20, message: `Analyzing ${papers.length} papers for gaps` });

    try {
      // First pass: heuristic extraction (existing)
      const heuristicGaps = analyzeResearchGaps(papers);

      // Second pass: LLM-enhanced analysis for top papers
      const topPapers = papers.slice(0, 5);
      const llmGaps = await this.llmEnhancedGapAnalysis(topPapers);

      // Merge and enrich
      const merged = this.mergeGaps(heuristicGaps, llmGaps);

      this.emit('agent:progress', { stage: 'complete', progress: 100, message: `Identified ${merged.length} gap profiles` });

      return {
        success: true,
        output: merged,
        metadata: { durationMs: Date.now() - start, toolsUsed: [] },
      };
    } catch (error) {
      return { success: false, error: error.message, metadata: { durationMs: Date.now() - start, toolsUsed: [] } };
    }
  }

  private async llmEnhancedGapAnalysis(papers: AcademicPaper[]): Promise<ResearchGap[]> {
    const prompt = `You are an expert researcher identifying gaps in recent literature. For each paper, extract:

1. Explicit limitations stated by authors
2. Implicit limitations (methodology, scope, assumptions)
3. Future work directions suggested
4. Unexplored adjacent problems
5. Methodological weaknesses

Papers:
${papers.map((p, i) => `${i+1}. ${p.title} (${p.year}, ${p.venue})
Abstract: ${p.abstract?.slice(0, 1500)}`).join('\n\n')}

Return JSON array of gap objects with fields: paperTitle, paperDoi, limitations[], futureWorkDirections[], methodologyWeaknesses[], keywords[], implicitGaps[], adjacentProblems[].`;

    const schema = z.array(z.object({
      paperTitle: z.string(),
      paperDoi: z.string().optional(),
      limitations: z.array(z.string()),
      futureWorkDirections: z.array(z.string()),
      methodologyWeaknesses: z.array(z.string()),
      keywords: z.array(z.string()),
      implicitGaps: z.array(z.string()),
      adjacentProblems: z.array(z.string()),
    }));

    try {
      return await this.llmComplete(prompt, schema);
    } catch {
      return []; // Fallback to heuristic only
    }
  }

  private mergeGaps(heuristic: ResearchGap[], llm: ResearchGap[]): ResearchGap[] {
    const byTitle = new Map<string, ResearchGap>();
    
    for (const g of heuristic) {
      byTitle.set(g.paperTitle, { ...g, implicitGaps: [], adjacentProblems: [] });
    }
    for (const g of llm) {
      const existing = byTitle.get(g.paperTitle);
      if (existing) {
        existing.limitations = [...new Set([...existing.limitations, ...g.limitations])];
        existing.futureWorkDirections = [...new Set([...existing.futureWorkDirections, ...g.futureWorkDirections])];
        existing.methodologyWeaknesses = [...new Set([...existing.methodologyWeaknesses, ...g.methodologyWeaknesses])];
        existing.implicitGaps = g.implicitGaps || [];
        existing.adjacentProblems = g.adjacentProblems || [];
      } else {
        byTitle.set(g.paperTitle, g);
      }
    }
    return Array.from(byTitle.values());
  }
}

// ─── Agent 3: Proposal Architect ───────────────────────────────────────────────

export class ProposalArchitectAgent extends BaseAgent<
  { gaps: ResearchGap[]; domain: string; targetVenue?: string },
  ResearchProposal
> {
  constructor(deps: AgentDependencies) {
    super({
      id: 'proposal_architect',
      name: 'Proposal Architect',
      description: 'Synthesizes novel, venue-targeted research proposals from identified gaps',
      version: '2.0.0',
      capabilities: [RESEARCH_CAPABILITIES[2]],
      requiredTools: [],
    }, deps);
  }

  async execute(input: { gaps: ResearchGap[]; domain: string; targetVenue?: string }): Promise<AgentResult<ResearchProposal>> {
    const start = Date.now();
    this.emit('agent:progress', { stage: 'synthesizing', progress: 30, message: 'Synthesizing research proposal...' });

    try {
      const prompt = `You are a senior researcher writing a grant proposal for ${input.targetVenue || 'IEEE Transactions'}. 
Domain: ${input.domain}

Identified Research Gaps:
${input.gaps.map((g, i) => `${i+1}. ${g.paperTitle}
  Limitations: ${g.limitations.join('; ')}
  Future Work: ${g.futureWorkDirections.join('; ')}
  Weaknesses: ${g.methodologyWeaknesses.join('; ')}
  Implicit Gaps: ${(g as any).implicitGaps?.join('; ') || 'N/A'}
  Adjacent Problems: ${(g as any).adjacentProblems?.join('; ') || 'N/A'}`).join('\n\n')}

Generate a novel research proposal with:
- Compelling title (venue-appropriate)
- Sharp problem statement (2-3 sentences)
- Detailed methodology (technical approach, algorithms, evaluation plan)
- Expected outcomes with measurable metrics
- Novelty claim vs. 2024-2026 literature
- 5-8 keywords
- 5-10 related work citations (DOIs if known)

Return as JSON.`;

      const schema = z.object({
        title: z.string(),
        problemStatement: z.string(),
        methodology: z.string(),
        expectedOutcome: z.string(),
        targetVenue: z.string().optional(),
        keywords: z.array(z.string()),
        relatedWork: z.array(z.string()),
        noveltyClaim: z.string(),
      });

      const proposal = await this.llmComplete(prompt, schema);

      this.emit('agent:progress', { stage: 'complete', progress: 100, message: 'Proposal generated' });

      return {
        success: true,
        output: proposal,
        metadata: { durationMs: Date.now() - start, toolsUsed: [] },
      };
    } catch (error) {
      return { success: false, error: error.message, metadata: { durationMs: Date.now() - start, toolsUsed: [] } };
    }
  }
}

// ─── Agent 4: Specialized Peer Reviewers ───────────────────────────────────────

const REVIEWER_PERSONAS = {
  algorithm_architect: {
    role: 'Algorithm Architect',
    focus: 'Algorithmic novelty, complexity bounds, scalability, theoretical contributions',
    venue: 'IEEE TCAD / TVLSI',
  },
  verification_engineer: {
    role: 'Verification Engineer',
    focus: 'Verification methodology, coverage metrics, formal methods, corner cases, SVA',
    venue: 'IEEE TVLSI / DAC',
  },
  systems_researcher: {
    role: 'Systems Researcher',
    focus: 'System-level impact, energy-delay-product, area-power tradeoffs, real-world workloads',
    venue: 'IEEE TC / MICRO',
  },
  ml_specialist: {
    role: 'ML for Systems Specialist',
    focus: 'ML model validity, training data quality, generalization, inference overhead, reproducibility',
    venue: 'IEEE TNNLS / TCAD',
  },
  ieee_peer_reviewer: {
    role: 'IEEE Peer Reviewer',
    focus: 'Venue fit, experimental rigor, baseline selection, statistical significance, reproducibility',
    venue: 'IEEE Transactions (general)',
  },
} as const;

export type ReviewerPersona = keyof typeof REVIEWER_PERSONAS;

export class PeerReviewerAgent extends BaseAgent<
  { proposal: ResearchProposal; persona: ReviewerPersona },
  AgentReview
> {
  private persona: ReviewerPersona;

  constructor(deps: AgentDependencies, persona: ReviewerPersona) {
    super({
      id: `reviewer_${persona}`,
      name: REVIEWER_PERSONAS[persona].role,
      description: `Peer reviewer specializing in ${REVIEWER_PERSONAS[persona].focus}`,
      version: '2.0.0',
      capabilities: [RESEARCH_CAPABILITIES[3]],
      requiredTools: [],
    }, deps);
    this.persona = persona;
  }

  async execute(input: { proposal: ResearchProposal; persona: ReviewerPersona }): Promise<AgentResult<AgentReview>> {
    const start = Date.now();
    const p = REVIEWER_PERSONAS[input.persona];

    this.emit('agent:progress', { stage: 'reviewing', progress: 25, message: `${p.role} reviewing...` });

    try {
      const prompt = `You are a ${p.role} reviewing for ${p.venue}. Your expertise: ${p.focus}.

Research Proposal:
Title: ${input.proposal.title}
Problem: ${input.proposal.problemStatement}
Methodology: ${input.proposal.methodology}
Expected Outcome: ${input.proposal.expectedOutcome}
Novelty Claim: ${input.proposal.noveltyClaim}
Keywords: ${input.proposal.keywords.join(', ')}

Provide a rigorous review with:
1. Critique (300-500 words): Technical assessment from your perspective
2. Strengths (3-5 bullet points)
3. Weaknesses (3-5 bullet points)
4. Suggested Revisions (3-5 actionable items)
5. Score (0-10, one decimal)
6. Confidence (0-1)
7. Evidence: Specific citations, equations, or reasoning traces supporting your critique

Be critical but constructive. Hold to ${p.venue} standards.`;

      const schema = z.object({
        critique: z.string(),
        strengths: z.array(z.string()),
        weaknesses: z.array(z.string()),
        suggestedRevisions: z.array(z.string()),
        scoreOutOf10: z.number().min(0).max(10),
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.string()),
      });

      const review = await this.llmComplete(prompt, schema);

      const result: AgentReview = {
        agentId: this.id,
        agentRole: p.role,
        ...review,
      };

      this.emit('agent:progress', { stage: 'complete', progress: 100, message: `Score: ${review.scoreOutOf10}/10` });

      return {
        success: true,
        output: result,
        metadata: { durationMs: Date.now() - start, toolsUsed: [] },
      };
    } catch (error) {
      return { success: false, error: error.message, metadata: { durationMs: Date.now() - start, toolsUsed: [] } };
    }
  }
}

// ─── Agent 5: Meta-Reviewer (Aggregator) ───────────────────────────────────────

export class MetaReviewerAgent extends BaseAgent<AgentReview[], ConsensusReport> {
  constructor(deps: AgentDependencies) {
    super({
      id: 'meta_reviewer',
      name: 'Meta Reviewer',
      description: 'Synthesizes multiple reviews into consensus report with dissent tracking',
      version: '2.0.0',
      capabilities: [],
      requiredTools: [],
    }, deps);
  }

  async execute(reviews: AgentReview[]): Promise<AgentResult<ConsensusReport>> {
    const start = Date.now();

    try {
      const scores = reviews.map(r => r.scoreOutOf10);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const spread = maxScore - minScore;

      // Determine verdict
      let verdict: ConsensusReport['verdict'];
      if (avgScore >= 8.5 && spread <= 1.5) verdict = 'Accept';
      else if (avgScore >= 7.5 && spread <= 2.0) verdict = 'Minor Revision';
      else if (avgScore >= 6.0) verdict = 'Major Revision';
      else verdict = 'Reject';

      // Synthesize refinements
      const allRevisions = reviews.flatMap(r => r.suggestedRevisions);
      const revisionCounts = new Map<string, number>();
      for (const r of allRevisions) {
        const key = r.toLowerCase().slice(0, 80);
        revisionCounts.set(key, (revisionCounts.get(key) || 0) + 1);
      }
      const synthesizedRefinements = Array.from(revisionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([r]) => r);

      // Identify dissenting views
      const dissentingViews: string[] = [];
      for (const r of reviews) {
        if (r.scoreOutOf10 < avgScore - 1.5) {
          dissentingViews.push(`${r.agentRole} (${r.scoreOutOf10}/10): ${r.critique.slice(0, 200)}`);
        }
      }

      // LLM synthesis for nuanced consensus
      const synthesisPrompt = `Synthesize these ${reviews.length} expert reviews into a coherent meta-review for an IEEE paper.

Reviews:
${reviews.map(r => `--- ${r.agentRole} (${r.scoreOutOf10}/10) ---\n${r.critique}`).join('\n\n')}

Provide:
1. Executive summary (150 words)
2. Key areas of agreement
3. Key areas of disagreement
4. Prioritized action items for authors
5. Overall recommendation rationale

Return as JSON.`;

      const synthesisSchema = z.object({
        executiveSummary: z.string(),
        agreements: z.array(z.string()),
        disagreements: z.array(z.string()),
        actionItems: z.array(z.string()),
        rationale: z.string(),
      });

      let synthesis = { executiveSummary: '', agreements: [], disagreements: [], actionItems: [], rationale: '' };
      try {
        synthesis = await this.llmComplete(synthesisPrompt, synthesisSchema);
      } catch {
        // Use heuristic fallback
      }

      const report: ConsensusReport = {
        overallScore: Number(avgScore.toFixed(1)),
        verdict,
        reviews,
        synthesizedRefinements,
        dissentingViews,
        metadata: {
          rounds: 1,
          agreementScore: 1 - spread / 10,
          totalTokens: 0,
        },
      };

      return {
        success: true,
        output: report,
        metadata: { durationMs: Date.now() - start, toolsUsed: [] },
      };
    } catch (error) {
      return { success: false, error: error.message, metadata: { durationMs: Date.now() - start, toolsUsed: [] } };
    }
  }
}

// ─── Orchestrator: Full Research Pipeline ──────────────────────────────────────

export interface ResearchPipelineInput {
  query: string;
  domain: string;
  targetVenue?: string;
  maxPapers?: number;
  fromYear?: number;
  reviewerPersonas?: ReviewerPersona[];
}

export interface ResearchPipelineOutput {
  papers: AcademicPaper[];
  gaps: ResearchGap[];
  proposal: ResearchProposal;
  consensus: ConsensusReport;
}

export class ResearchPipelineOrchestrator {
  constructor(
    private scout: LiteratureScoutAgent,
    private gapAnalyst: GapAnalystAgent,
    private architect: ProposalArchitectAgent,
    private reviewers: Map<ReviewerPersona, PeerReviewerAgent>,
    private metaReviewer: MetaReviewerAgent
  ) {}

  async execute(input: ResearchPipelineInput): Promise<ResearchPipelineOutput> {
    // Stage 1: Literature Search
    const searchResult = await this.scout.execute({
      query: input.query,
      venue: input.targetVenue?.replace('IEEE Transactions on ', ''),
      limit: input.maxPapers || 20,
      fromYear: input.fromYear || 2022,
    });
    if (!searchResult.success) throw new Error(`Search failed: ${searchResult.error}`);
    const papers = searchResult.output!;

    // Stage 2: Gap Analysis
    const gapResult = await this.gapAnalyst.execute(papers);
    if (!gapResult.success) throw new Error(`Gap analysis failed: ${gapResult.error}`);
    const gaps = gapResult.output!;

    // Stage 3: Proposal Generation
    const proposalResult = await this.architect.execute({
      gaps,
      domain: input.domain,
      targetVenue: input.targetVenue,
    });
    if (!proposalResult.success) throw new Error(`Proposal generation failed: ${proposalResult.error}`);
    const proposal = proposalResult.output!;

    // Stage 4: Multi-Perspective Review
    const personas = input.reviewerPersonas || ['algorithm_architect', 'verification_engineer', 'ieee_peer_reviewer'];
    const reviews: AgentReview[] = [];
    
    for (const persona of personas) {
      const reviewer = this.reviewers.get(persona);
      if (reviewer) {
        const reviewResult = await reviewer.execute({ proposal, persona });
        if (reviewResult.success) reviews.push(reviewResult.output!);
      }
    }

    // Stage 5: Consensus
    const consensusResult = await this.metaReviewer.execute(reviews);
    if (!consensusResult.success) throw new Error(`Consensus failed: ${consensusResult.error}`);
    const consensus = consensusResult.output!;

    return { papers, gaps, proposal, consensus };
  }
}

// ─── Factory Functions ─────────────────────────────────────────────────────────

export function createResearchSwarm(deps: AgentDependencies): ResearchPipelineOrchestrator {
  const scout = new LiteratureScoutAgent(deps);
  const gapAnalyst = new GapAnalystAgent(deps);
  const architect = new ProposalArchitectAgent(deps);
  
  const reviewers = new Map<ReviewerPersona, PeerReviewerAgent>([
    ['algorithm_architect', new PeerReviewerAgent(deps, 'algorithm_architect')],
    ['verification_engineer', new PeerReviewerAgent(deps, 'verification_engineer')],
    ['systems_researcher', new PeerReviewerAgent(deps, 'systems_researcher')],
    ['ml_specialist', new PeerReviewerAgent(deps, 'ml_specialist')],
    ['ieee_peer_reviewer', new PeerReviewerAgent(deps, 'ieee_peer_reviewer')],
  ]);
  
  const metaReviewer = new MetaReviewerAgent(deps);

  return new ResearchPipelineOrchestrator(scout, gapAnalyst, architect, reviewers, metaReviewer);
}