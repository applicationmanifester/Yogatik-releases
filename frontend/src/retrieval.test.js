import { describe, it, expect } from 'vitest'
import { chunkText, buildIndex, buildIndexAsync, appendToIndex, search, tokenize } from './retrieval'

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


/**
 * Chat search used to rebuild its BM25 index over EVERY message ever stored,
 * synchronously, on the thread that paints the UI — and every reply invalidated
 * it, so searching an active conversation paid for the whole history again.
 *
 * MEASURED before: 20,000 messages -> 1089ms build, 1151ms per reply.
 * MEASURED after:  append 0ms; longest uninterrupted block during a first
 * build 25ms instead of 1089ms.
 */
describe('incremental indexing', () => {
  const docs = ['the cat sat on the mat', 'a dog barked loudly', 'cats and dogs together']

  it('appending produces the same index as building from scratch', async () => {
    const whole = buildIndex([...docs, 'a new note about cats'])
    const grown = buildIndex(docs)
    appendToIndex(grown, 'a new note about cats')

    expect(grown.n).toBe(whole.n)
    expect(grown.len).toEqual(whole.len)
    expect(grown.avgLen).toBeCloseTo(whole.avgLen, 10)
    for (const [term, df] of whole.df) expect(grown.df.get(term), term).toBe(df)
  })

  it('a document appended is findable, and ranks', () => {
    const index = buildIndex(docs)
    appendToIndex(index, 'quantum entanglement explained')
    const hits = search(index, 'quantum entanglement', 3)
    expect(hits[0].i).toBe(3)
    expect(hits[0].score).toBeGreaterThan(0)
  })

  it('keeps avgLen a true mean rather than drifting', () => {
    const index = buildIndex([])
    const all = ['one two three', 'four', 'five six']
    for (const d of all) appendToIndex(index, d)
    expect(index.avgLen).toBeCloseTo(buildIndex(all).avgLen, 10)
  })

  it('the async build matches the sync one', async () => {
    const sync = buildIndex(docs)
    const async_ = await buildIndexAsync(docs, { chunkSize: 1 })
    expect(async_.n).toBe(sync.n)
    expect(async_.avgLen).toBeCloseTo(sync.avgLen, 10)
    expect(search(async_, 'dog', 2)).toEqual(search(sync, 'dog', 2))
  })

  it('the async build yields, so the UI is never blocked for the whole pass', async () => {
    // The property that matters is not total time — it is that control comes
    // back between chunks. A one-second synchronous freeze on Ctrl+K is
    // indistinguishable from the app hanging.
    const many = Array.from({ length: 1000 }, (_, i) => `message number ${i} about latency`)
    let yields = 0
    await buildIndexAsync(many, { chunkSize: 100, onProgress: () => { yields++ } })
    expect(yields).toBeGreaterThan(5)
  })
})
