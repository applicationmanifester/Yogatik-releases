import { describe, it, expect } from 'vitest'
import { chunkText, buildIndex, search, tokenize } from './retrieval'

const HANDBOOK = `
Employee Handbook

Section 1: Leave Policy
Full-time employees accrue 18 days of paid annual leave per year. Leave requests must be
submitted at least 14 days in advance through the HR portal. Unused leave carries over up
to a maximum of 10 days into the following calendar year.

Section 2: Remote Work
Employees may work remotely up to 3 days per week with manager approval. Fully remote
arrangements require director sign-off and are reviewed every 6 months. Home office
stipend is 25000 rupees, claimable once every two years.

Section 3: Expenses
Travel expenses must be filed within 30 days of the trip. Meals are reimbursed up to 1200
rupees per day domestically and 4000 rupees internationally. Receipts are mandatory for
any claim above 500 rupees.

Section 4: Health Insurance
Coverage begins on the first day of employment. The company covers the employee premium
in full and 50 percent of dependent premiums. Annual health checkups are free at network
hospitals.

Section 5: Notice Period
The notice period is 60 days for senior roles and 30 days otherwise. Garden leave may be
invoked at the company's discretion. Final settlement is processed within 45 days of exit.
`

describe('tokenize', () => {
  it('drops stopwords and short tokens', () => {
    // Output is stemmed: shipping → ship. "express" keeps its ss.
    expect(tokenize('The cost of the express shipping is 15')).toEqual(['cost', 'express', 'ship', '15'])
  })

  it('matches singular and plural forms to the same stem', () => {
    expect(tokenize('expenses')).toEqual(tokenize('expense'))
    expect(tokenize('shipping')).toEqual(tokenize('shipped'))
  })

  it('does not strip the ss in words like express or address', () => {
    expect(tokenize('express address')).toEqual(['express', 'address'])
  })

  it('stems so queries match inflected text', () => {
    // "meal reimbursement" must reach "Meals are reimbursed"
    const q = tokenize('meal reimbursement')
    const d = tokenize('Meals are reimbursed')
    expect(q.some(t => d.includes(t))).toBe(true)
  })

  it('handles empty and punctuation-only input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('!!! ... ???')).toEqual([])
  })
})

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('splits long text into overlapping chunks', () => {
    const chunks = chunkText(HANDBOOK, { size: 350, overlap: 60 })
    expect(chunks.length).toBeGreaterThan(3)
    expect(Math.max(...chunks.map(c => c.length))).toBeLessThan(700)
  })

  it('never starts a chunk mid-word', () => {
    // Regression: blind slice(-overlap) produced chunks like "ays and costs..."
    const chunks = chunkText(HANDBOOK, { size: 350, overlap: 60 })
    const words = new Set(tokenize(HANDBOOK))
    for (const c of chunks.slice(1)) {
      const first = tokenize(c.split(/\s+/)[0])[0]
      if (first) expect(words.has(first)).toBe(true)
    }
  })
})

describe('BM25 search', () => {
  const chunks = chunkText(HANDBOOK, { size: 350, overlap: 60 })
  const index = buildIndex(chunks)

  const cases = [
    ['how many leave days do I get', 'annual leave'],
    ['remote work stipend amount', 'stipend'],
    ['meal reimbursement international', '4000'],
    ['what is the notice period', 'notice period'],
    ['dependent insurance premium', 'dependent'],
  ]

  it.each(cases)('retrieves the right passage for %s', (query, expected) => {
    const [hit] = search(index, query, 1)
    expect(hit).toBeDefined()
    expect(chunks[hit.i].toLowerCase()).toContain(expected.toLowerCase())
  })

  it('returns nothing for stopword-only queries', () => {
    expect(search(index, 'the of and', 3)).toEqual([])
  })

  it('returns nothing for an empty corpus', () => {
    expect(search(buildIndex([]), 'anything', 3)).toEqual([])
  })

  it('respects topK', () => {
    expect(search(index, 'days', 2).length).toBeLessThanOrEqual(2)
  })

  it('ranks by score descending', () => {
    const hits = search(index, 'leave days rupees', 4)
    const scores = hits.map(h => h.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})
