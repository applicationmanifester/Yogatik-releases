import { describe, it, expect } from 'vitest'
import {
  extractLaTeXFormulas,
  extractTables,
  slidingWindowChunker,
  parseDocumentContent,
  unlimitedOcrTool,
} from './unlimitedOcr'

describe('Baidu Unlimited-OCR Long-Context Document & Math Engine', () => {
  it('extracts display and inline LaTeX mathematical formulas accurately', () => {
    const documentText = `
    # Quantum Field Theory Notes
    The Euler-Lagrange field equation is given by:
    $$\\partial_\\mu \\left( \\frac{\\partial \\mathcal{L}}{\\partial (\\partial_\\mu \\phi)} \\right) - \\frac{\\partial \\mathcal{L}}{\\partial \\phi} = 0$$

    In one dimension, the wave velocity $v = \\frac{\\omega}{k}$ applies.
    We spent $45.99 on the book.
    `

    const math = extractLaTeXFormulas(documentText)
    expect(math.totalFormulas).toBeGreaterThanOrEqual(2)
    expect(math.formulas.some(f => f.type === 'display')).toBe(true)
    expect(math.formulas.some(f => f.type === 'inline')).toBe(true)
    expect(math.formulas.some(f => f.latex.includes('partial_\\mu'))).toBe(true)
  })

  it('detects and converts table rows into standard Markdown tables', () => {
    const tableText = `
    Quarter\tRevenue\tProfit\tMargin
    Q1\t$10.5M\t$2.1M\t20%
    Q2\t$12.3M\t$2.8M\t22.7%
    `

    const tables = extractTables(tableText)
    expect(tables.totalTables).toBe(1)
    expect(tables.markdownTables[0]).toContain('| Quarter | Revenue | Profit | Margin |')
    expect(tables.markdownTables[0]).toContain('| --- | --- | --- | --- |')
    expect(tables.markdownTables[0]).toContain('| Q1 | $10.5M | $2.1M | 20% |')
  })

  it('chunks long documents using Reference Sliding Window Attention (R-SWA)', () => {
    const longContent = 'A'.repeat(5000)
    const swa = slidingWindowChunker(longContent, { windowSize: 1500, overlap: 200 })

    expect(swa.totalChunks).toBeGreaterThanOrEqual(3)
    expect(swa.chunks[0].length).toBe(1500)
    expect(swa.chunks[1].startOffset).toBe(1300) // 1500 - 200 overlap
  })

  it('parses full document hierarchy, stats, and structures', () => {
    const fullDoc = `
    # Technical Whitepaper: Deep Attention
    ## 1. Introduction
    We introduce R-SWA for infinite context.
    $$\\text{Attn}(Q,K,V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d}}\\right)V$$

    ## 2. Experimental Results
    Model\tAccuracy\tLatency
    Baseline\t84.2%\t120ms
    Unlimited-OCR\t92.7%\t45ms
    `

    const parsed = parseDocumentContent(fullDoc)
    expect(parsed.success).toBe(true)
    expect(parsed.headings.length).toBe(3)
    expect(parsed.stats.formulaCount).toBeGreaterThanOrEqual(1)
    expect(parsed.stats.tableCount).toBe(1)
  })

  it('unlimitedOcrTool executes parse, formula, table, and chunking actions', async () => {
    const parseRes = await unlimitedOcrTool.execute({
      action: 'parse_document',
      content: '# Heading 1\nSome paragraph text with $E = mc^2$.',
    })
    expect(parseRes.success).toBe(true)
    expect(parseRes.stats.headingCount).toBe(1)

    const inspectRes = await unlimitedOcrTool.execute({ action: 'inspect_pipeline' })
    expect(inspectRes.success).toBe(true)
    expect(inspectRes.attentionMechanism).toContain('Sliding Window')
  })
})
