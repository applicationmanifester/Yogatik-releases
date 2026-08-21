/**
 * Advanced Utility & Specialized Research Tools
 * Vector RAG Search, BibTeX Generation, Citation Network, and Math Simulation
 */

import { clientVectorStore } from '@/services/vectorStore';
import { generateBibTeXFile, buildCitationNetwork } from '@/services/citationManager';
import type { AcademicPaper } from '@/tools/academic';

/**
 * 1. Vector Search Tool
 */
export async function executeVectorSearch(params: Record<string, unknown>): Promise<{ results: any[]; total: number }> {
  const queryEmbedding = params.queryEmbedding as number[] || [];
  const topK = typeof params.topK === 'number' ? params.topK : 5;

  if (!queryEmbedding || queryEmbedding.length === 0) {
    return { results: [], total: clientVectorStore.count() };
  }

  const matches = clientVectorStore.search(queryEmbedding, topK);
  return {
    results: matches.map((m) => ({
      id: m.doc.id,
      title: m.doc.title,
      content: m.doc.content,
      score: Number(m.score.toFixed(4)),
      metadata: m.doc.metadata,
    })),
    total: clientVectorStore.count(),
  };
}

/**
 * 2. BibTeX Exporter Tool
 */
export async function executeBibtexExport(params: Record<string, unknown>): Promise<{ bibtex: string; count: number }> {
  const papers = (params.papers as AcademicPaper[]) || [];
  const bibtex = generateBibTeXFile(papers);
  return {
    bibtex,
    count: papers.length,
  };
}

/**
 * 3. Citation Network Builder Tool
 */
export async function executeCitationNetwork(params: Record<string, unknown>): Promise<{ nodes: any[]; links: any[] }> {
  const papers = (params.papers as AcademicPaper[]) || [];
  const graph = buildCitationNetwork(papers);
  return graph;
}

/**
 * 4. Algorithm & Math Symbolic Evaluator Tool
 */
export function executeMathEvaluation(expression: string): { expression: string; result: number | string } {
  try {
    // Clean and validate mathematical formula
    const cleanExpr = expression.replace(/[^0-9+\-*/().^% eEpiPIsqrtsincoantlg]/g, '');
    const sanitized = cleanExpr
      .replace(/pi/gi, 'Math.PI')
      .replace(/e/gi, 'Math.E')
      .replace(/\^/g, '**')
      .replace(/sqrt\(/gi, 'Math.sqrt(')
      .replace(/sin\(/gi, 'Math.sin(')
      .replace(/cos\(/gi, 'Math.cos(')
      .replace(/tan\(/gi, 'Math.tan(')
      .replace(/log\(/gi, 'Math.log(');

    // Evaluate in safe scope
    const fn = new Function(`return (${sanitized})`);
    const val = fn();
    return {
      expression,
      result: typeof val === 'number' ? (Number.isFinite(val) ? val : 'Infinity/NaN') : String(val),
    };
  } catch (err: any) {
    return {
      expression,
      result: `Error evaluating expression: ${err.message}`,
    };
  }
}
