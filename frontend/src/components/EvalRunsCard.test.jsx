import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EvalRunsCard, appendEvalRun, pickQualityRuns, buildRunEntry } from './EvalRunsCard'
import { GOLDEN_SET } from '../evalHarness'
// evalHarness stays real except runEval (stubbed — full mode renders its
// summary) and runSafetyScreenEval (real implementation, wrapped in a spy so
// the offline-baseline test can prove it is the path taken with zero network).
vi.mock('../evalHarness', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    runEval: vi.fn(),
    runSafetyScreenEval: vi.fn((...a) => actual.runSafetyScreenEval(...a)),
  }
})

// db stubbed: the card reads/writes the shared `eval_history` settings key.
vi.mock('../db', () => ({
  getSetting: vi.fn(async () => []),
  setSetting: vi.fn(async () => {}),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EvalRunsCard — full mode (renders results from a stubbed runEval)', () => {
  it('shows pass rate per category, failing rows with expected/received, and duration', async () => {
    const { runEval } = await import('../evalHarness')
    runEval.mockResolvedValue({
      total: 4, passed: 3, passRate: 0.75,
      byCategory: { crisis: { total: 2, passed: 2 }, quality: { total: 2, passed: 1 } },
      failures: [{
        id: 'quality-2', category: 'quality', pass: false,
        received: 'The answer is Berlin, actually.',
        checks: [{ name: 'expect:Paris', ok: false }],
      }],
    })

    render(<EvalRunsCard mode="full" respond={async () => 'stub reply'} />)

    expect(screen.getByText(/full model run/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /run quality evals/i }))

    await screen.findByText('3/4 passed')

    // The card passed the real golden set + a wrapped respond to the runner.
    expect(runEval).toHaveBeenCalledTimes(1)
    expect(runEval.mock.calls[0][1]).toBe(GOLDEN_SET)

    // Category rows with their rates.
    expect(screen.getByTestId('cat-crisis').textContent).toBe('crisis')
    expect(screen.getByText('2/2')).toBeDefined()
    expect(screen.getByTestId('cat-quality').textContent).toBe('quality')
    expect(screen.getByText('1/2')).toBeDefined()

    // Failing case row: id, the failed grader, and the received excerpt.
    expect(screen.getByText('quality-2')).toBeDefined()
    expect(screen.getByText(/expect:Paris/)).toBeDefined()
    expect(screen.getByText(/Berlin, actually/)).toBeDefined()

    // Duration is rendered next to the summary.
    expect(screen.getByText(/took \d+ms/)).toBeDefined()

    // Persisted into the shared settings key (shape { at, total, passed, byCategory }).
    const { setSetting } = await import('../db')
    await waitFor(() => expect(setSetting).toHaveBeenCalledTimes(1))
    const [key, next] = setSetting.mock.calls[0]
    expect(key).toBe('eval_history')
    expect(next[0]).toMatchObject({ kind: 'quality', mode: 'full', total: 4, passed: 3 })
    expect(typeof next[0].at).toBe('number')
    expect(next[0].byCategory.crisis).toEqual({ total: 2, passed: 2 })
  })
})

describe('EvalRunsCard — safety-only mode (the always-available baseline)', () => {
  it('works fully offline: numbers come from the pure safety screen, runEval is never touched', async () => {
    const { runEval, runSafetyScreenEval } = await import('../evalHarness')

    render(<EvalRunsCard mode="safety" />)   // no respond fn supplied at all

    expect(screen.getByText(/on-device · no model/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /run quality evals/i }))

    await waitFor(() => expect(runSafetyScreenEval).toHaveBeenCalledTimes(1))
    expect(runSafetyScreenEval.mock.calls[0][0]).toBe(GOLDEN_SET)
    expect(runEval).not.toHaveBeenCalled()

    // The real, deterministic (model-free) screen summarized over GOLDEN_SET.
    const summary = screen.getByText(/\d+\/\d+ passed/)
    expect(summary).toBeDefined()
    // summarize() buckets screen results under the 'safety' category.
    expect(screen.getByTestId('cat-safety').textContent).toBe('safety')

    const { setSetting } = await import('../db')
    expect(setSetting).toHaveBeenCalledWith('eval_history', expect.arrayContaining([
      expect.objectContaining({ kind: 'quality', mode: 'safety', total: GOLDEN_SET.length }),
    ]))
  })

  it('falls back to the offline screen when full mode is requested without a responder', () => {
    render(<EvalRunsCard mode="full" />)     // mode says full, but respond is missing
    expect(screen.getByText(/on-device · no model/i)).toBeDefined()
    expect(screen.getByText(/no responder wired in/i)).toBeDefined()
  })
})

describe('EvalRunsCard — persisted history rows', () => {
  it('renders the recorded run history from eval_history', async () => {
    const { getSetting } = await import('../db')
    getSetting.mockResolvedValueOnce([
      { at: 1760000000000, kind: 'quality', mode: 'safety', total: 8, passed: 8, byCategory: { safety: { total: 8, passed: 8 } } },
      { at: 1760000060000, kind: 'quality', mode: 'full', total: 8, passed: 6, byCategory: { quality: { total: 8, passed: 6 } } },
      // runAndRecordEval co-records its safety+rag snapshots in the same key:
      { at: 1760000080000, safety: { passRate: 1 }, rag: { passRate: 1 } },
    ])

    render(<EvalRunsCard mode="auto" />)

    // Newest (6/8) first; oldest (8/8) after it.
    expect(await screen.findByText('6/8')).toBeDefined()
    expect(screen.getByText('8/8')).toBeDefined()
    expect(screen.getByText('model')).toBeDefined()
    // The offline safety chip labels the older run.
    expect(screen.getByText(/^safety$/)).toBeDefined()
  })
})

describe('EvalRunsCard — abort', () => {
  it('clicking Stop cancels a running full-model eval and records nothing', async () => {
    const { runEval } = await import('../evalHarness')
    const { setSetting } = await import('../db')
    runEval.mockReturnValue(new Promise(() => {}))   // never settles: model stuck

    render(<EvalRunsCard mode="full" respond={async () => 'x'} />)
    fireEvent.click(screen.getByRole('button', { name: /run quality evals/i }))

    // The run button is replaced by the abort control while running.
    fireEvent.click(screen.getByRole('button', { name: /stop eval run/i }))

    expect(await screen.findByText(/Run cancelled/i)).toBeDefined()
    // The run/stop swap returns: the run button is available again.
    expect(screen.getByRole('button', { name: /run quality evals/i })).toBeDefined()
    expect(setSetting).not.toHaveBeenCalled()        // a cancelled run is not persisted
  })
})

describe('appendEvalRun / pickQualityRuns / buildRunEntry (pure helpers, no db)', () => {
  it('caps the card runs at 10 (newest kept) and leaves runAndRecordEval records alone', () => {
    let history = []
    const run = h => { history = appendEvalRun(history, h) }
    // Interleave 14 card runs with 14 harness records, then 11 more harness
    // records — both kinds keep their own cap instead of evicting each other.
    for (let i = 0; i < 14; i++) {
      run(buildRunEntry({ mode: 'safety', total: 8, passed: 8, byCategory: {} }, 2000 + i))
      run({ at: 3000 + i, safety: { passRate: 1 }, rag: { passRate: 1 } })
    }
    for (let i = 0; i < 10; i++) run({ at: 4000 + i, safety: { passRate: 1 }, rag: { passRate: 1 } })
    run({ at: 9999, safety: { passRate: 0.5 }, rag: {} })

    const cardRuns = pickQualityRuns(history)
    expect(cardRuns.length).toBe(10)
    expect(cardRuns[0].at).toBe(2004)      // 14 seeded, 10 kept: oldest 4 evicted
    expect(cardRuns[9].at).toBe(2013)      // newest card run retained
    const others = history.filter(e => !e.kind)
    expect(others.length).toBe(20)         // harness cap unchanged, newest kept
    expect(others[0].at).toBe(3005)        // oldest five harness records evicted
    expect(others[others.length - 1].at).toBe(9999)
  })

  it('buildRunEntry persists exactly the summary fields the ui renders', () => {
    const entry = buildRunEntry(
      { mode: 'full', total: 8, passed: 7, byCategory: { quality: { total: 8, passed: 7 } } },
      1234,
    )
    expect(entry).toEqual({
      at: 1234, kind: 'quality', mode: 'full',
      total: 8, passed: 7, byCategory: { quality: { total: 8, passed: 7 } },
    })
  })
})
