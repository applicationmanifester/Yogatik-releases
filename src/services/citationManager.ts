/**
 * BibTeX Citation Formatter & Graph Visualizer Service
 */

import type { AcademicPaper } from '@/tools/academic';

export interface BibTeXEntry {
  citationKey: string;
  type: 'article' | 'book' | 'inproceedings' | 'misc';
  fields: Record<string, string>;
}

export function formatPaperToBibTeX(paper: AcademicPaper): string {
  const authorPart = (paper.authors[0] || 'Unknown').split(' ').pop()?.toLowerCase() || 'author';
  const yearPart = paper.year || new Date().getFullYear();
  const key = `${authorPart}${yearPart}`;

  return `@article{${key},
  author    = {${paper.authors.join(' and ')}},
  title     = {${paper.title}},
  year      = {${yearPart}},
  ${paper.venue ? `journal   = {${paper.venue}},` : ''}
  ${paper.doi ? `doi       = {${paper.doi}},` : ''}
  ${paper.url ? `url       = {${paper.url}}` : ''}
}`;
}

export function generateBibTeXFile(papers: AcademicPaper[]): string {
  return papers.map((p) => formatPaperToBibTeX(p)).join('\n\n');
}

export interface GraphNode {
  id: string;
  label: string;
  group: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export function buildCitationNetwork(papers: AcademicPaper[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  papers.forEach((paper, idx) => {
    nodes.push({
      id: paper.id,
      label: paper.title.length > 30 ? paper.title.slice(0, 27) + '...' : paper.title,
      group: idx % 3,
    });
  });

  // Link papers sharing author or domain
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const p1 = papers[i];
      const p2 = papers[j];
      if (!p1 || !p2) continue;

      const sharedAuthor = p1.authors.some((a) => p2.authors.includes(a));
      if (sharedAuthor) {
        links.push({
          source: p1.id,
          target: p2.id,
        });
      }
    }
  }

  return { nodes, links };
}
