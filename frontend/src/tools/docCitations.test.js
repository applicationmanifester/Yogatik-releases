import { describe, it, expect, vi } from 'vitest'
import { CITE_INSTRUCTION, buildSourcesStrip } from '../citations'
import { docSearchTool } from './documents'

// documents.js reads settings + docs from Dexie and flips the semantic
// consent flag; none of that is this test's concern — the contract being
// pinned is the SHAPE the model sees (bracketed numbers + instruction line).
vi.mock('../db', () => ({
  getDocuments: vi.fn(async () => [
    {
      id: 'd1', name: 'Handbook.pdf', createdAt: 1,
      chunks: [
        'Full-time employees accrue 18 days of paid annual leave per year through the HR portal.',
        'Travel expenses must be filed within 30 days of the trip with receipts attached.',
        'The notice period is 60 days for senior roles and 30 days otherwise.',
      ],
    },
    {
      id: 'd2', name: 'Policy.docx', createdAt: 1,
      chunks: [
        'Health insurance coverage begins on the first day of employment.',
      ],
    },
  ]),
  getSetting: vi.fn(async () => ({})),
}))
vi.mock('../features', () => ({
  resolveFeatures: () => ({}), // semanticSearch off → pure BM25 path
}))
vi.mock('../semantic', () => ({
  semanticRerank: vi.fn(),
  setSemanticConsent: vi.fn(),
}))

describe('doc_search tool result — inline citation wiring ([citations])', () => {
  it('numbers every passage [1..k] and appends the one-line citation instruction', async () => {
    const res = await docSearchTool.execute({ query: 'leave days', top_k: 2 })

    expect(res.success).toBe(true)
    expect(res.passages).toHaveLength(2)
    expect(res.passages.map(p => p.n)).toEqual([1, 2])
    // Rows stay recognizable: doc name, passage text and chunk position ride along.
    expect(res.passages[0].document).toBe('Handbook.pdf')
    expect(res.passages[0].chunk).toBeGreaterThanOrEqual(1)
    expect(typeof res.passages[0].passage).toBe('string')
    expect(res.citation_note).toBe(CITE_INSTRUCTION)
  })

  it('keeps a rounded score on numbered rows (the strip shows match strength)', async () => {
    const res = await docSearchTool.execute({ query: 'notice period', top_k: 5 })
    for (const p of res.passages) {
      expect(typeof p.score).toBe('number')
      expect(Number.isFinite(p.score)).toBe(true)
      // Rounded to 2dp — matching searchLocalVault's convention.
      expect(p.score).toBe(Math.round(p.score * 100) / 100)
    }
  })

  it('bracketed numbers pair with buildSourcesStrip out of the box', async () => {
    const res = await docSearchTool.execute({ query: 'travel expenses receipts', top_k: 5 })
    const strip = buildSourcesStrip('Expenses need receipts within 30 days [1].', res.passages)
    expect(strip).not.toBeNull()
    expect(strip.items[0].docName).toBe('Handbook.pdf')
    expect(strip.items[0].n).toBe(1)
  })

  it('does not attach a citation note when nothing matched', async () => {
    const res = await docSearchTool.execute({ query: 'zzz qqq nothing here at all' })
    expect(res.passages).toEqual([])
    expect(res.citation_note).toBeUndefined()
  })
})
