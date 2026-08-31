import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  RAG_EVAL_SET, gradeRagCase, runRagEval,
  buildEvalHistoryEntry, compareToLast,
  runAndRecordEval, getEvalHistory,
} from './evalHarness'

// db.js is real Dexie elsewhere in the suite (fake-indexeddb); stubbed here
// because these tests care about the PURE eval logic and the wiring around
// getSetting/setSetting, not Dexie itself.
vi.mock('./db', () => ({
  getSetting: vi.fn(async () => []),
  setSetting: vi.fn(async () => {}),
}))

describe('RAG regression golden set (model-free, same BM25 the app uses)', () => {
  it('the real doc_search/local_vault_search algorithm resolves every case to its expected document', () => {
    // Not a tautology: this is the SAME buildIndex/search retrieval.js exports,
    // so a regression in the app's own BM25 ranking (a bad tokenizer change, a
    // stemming rule that starts merging unrelated words) fails this too.
    for (const c of RAG_EVAL_SET) {
      const res = gradeRagCase(c)
      expect(res.pass, `${c.id}: expected top result "${c.expectTopId}"`).toBe(true)
    }
  })

  it('runRagEval summarizes to a 100% pass rate on the untouched golden set', () => {
    const res = runRagEval()
    expect(res.total).toBe(RAG_EVAL_SET.length)
    expect(res.passRate).toBe(1)
    expect(res.byCategory.rag.total).toBe(RAG_EVAL_SET.length)
  })

  it('reports both top-1 and top-3 so a near-miss is distinguishable from a total miss', () => {
    const res = gradeRagCase({ id: 'x', query: 'zzz no such term anywhere', expectTopId: 'doc-returns' })
    expect(res.pass).toBe(false)
    expect(res.top3).toBe(false)
  })
})

describe('eval-history regression tracking (buildEvalHistoryEntry / compareToLast)', () => {
  it('caps history at 20 entries, evicting the oldest first', () => {
    let history = []
    for (let i = 0; i < 25; i++) {
      history = buildEvalHistoryEntry({ safety: { passRate: 1 }, rag: { passRate: 1 } }, history, 1000 + i)
    }
    expect(history.length).toBe(20)
    expect(history[0].at).toBe(1005)
    expect(history[history.length - 1].at).toBe(1024)
  })

  it('returns null when there is no prior run to compare against', () => {
    expect(compareToLast({ safety: { passRate: 1 } }, [])).toBeNull()
  })

  it('computes a negative delta when quality drops since the last run', () => {
    const history = [{ at: 500, safety: { passRate: 1 }, rag: { passRate: 1 } }]
    const cmp = compareToLast({ safety: { passRate: 0.75 }, rag: { passRate: 1 } }, history)
    expect(cmp.safetyDelta).toBeCloseTo(-0.25)
    expect(cmp.ragDelta).toBe(0)
  })

  it('computes a positive delta when quality improves', () => {
    const history = [{ at: 500, safety: { passRate: 0.5 }, rag: { passRate: 0.8 } }]
    const cmp = compareToLast({ safety: { passRate: 1 }, rag: { passRate: 1 } }, history)
    expect(cmp.safetyDelta).toBeCloseTo(0.5)
    expect(cmp.ragDelta).toBeCloseTo(0.2)
  })
})

describe('runAndRecordEval / getEvalHistory (db wiring)', () => {
  beforeEach(async () => {
    const { getSetting, setSetting } = await import('./db')
    getSetting.mockReset().mockResolvedValue([])
    setSetting.mockReset().mockResolvedValue()
  })

  it('records a run and returns safety + rag + a null comparison on the first run', async () => {
    const result = await runAndRecordEval()
    expect(result.safety.total).toBeGreaterThan(0)
    expect(result.rag.total).toBe(RAG_EVAL_SET.length)
    expect(result.comparison).toBeNull()
    const { setSetting } = await import('./db')
    expect(setSetting).toHaveBeenCalledWith('eval_history', expect.any(Array))
  })

  it('a second recorded run compares against the first', async () => {
    const { getSetting } = await import('./db')
    getSetting.mockResolvedValue([{ at: 1, safety: { passRate: 0.5 }, rag: { passRate: 0.5 } }])
    const result = await runAndRecordEval()
    expect(result.comparison).not.toBeNull()
    expect(typeof result.comparison.safetyDelta).toBe('number')
  })

  it('getEvalHistory never throws and returns an array even if getSetting rejects', async () => {
    const { getSetting } = await import('./db')
    getSetting.mockRejectedValue(new Error('db unavailable'))
    const history = await getEvalHistory()
    expect(Array.isArray(history)).toBe(true)
    expect(history).toEqual([])
  })

  it('runAndRecordEval never throws even if setSetting fails', async () => {
    const { setSetting } = await import('./db')
    setSetting.mockRejectedValue(new Error('quota exceeded'))
    await expect(runAndRecordEval()).resolves.toBeDefined()
  })
})
