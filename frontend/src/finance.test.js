import { describe, it, expect } from 'vitest'
import {
  npv, irr, dcf, cagr, returnsFromPrices, mean, stdev, volatility,
  sharpe, sortino, maxDrawdown, valueAtRisk, conditionalVaR, analyzeSeries,
} from './finance'

const near = (a, b, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('npv', () => {
  it('leaves t=0 undiscounted', () => {
    near(npv(0.1, [100]), 100)
  })

  it('discounts later flows', () => {
    // -100 now, +110 in one year, at 10% => exactly break-even
    near(npv(0.1, [-100, 110]), 0)
  })

  it('is zero for no cash flows', () => {
    expect(npv(0.1, [])).toBe(0)
  })

  it('rejects a rate at or below -100%', () => {
    expect(() => npv(-1, [1, 2])).toThrow(/greater than -100/i)
  })
})

describe('irr', () => {
  it('finds the rate that zeroes NPV', () => {
    const r = irr([-100, 110])
    near(r, 0.1, 1e-5)
  })

  it('agrees with npv at the solution', () => {
    const cf = [-1000, 300, 420, 680]
    near(npv(irr(cf), cf), 0, 1e-4)
  })

  it('needs both a positive and a negative flow', () => {
    expect(() => irr([100, 200])).toThrow(/positive and.*negative/i)
    expect(() => irr([-100, -200])).toThrow(/positive and.*negative/i)
  })

  it('needs at least two flows', () => {
    expect(() => irr([100])).toThrow(/at least two/i)
  })
})

describe('dcf', () => {
  const base = { cashflows: [100, 110, 120], discountRate: 0.1, terminalGrowth: 0.02 }

  it('produces an enterprise value above the explicit-period PV', () => {
    const r = dcf(base)
    expect(r.enterpriseValue).toBeGreaterThan(r.pvExplicit)
  })

  it('subtracts net debt to reach equity value', () => {
    const r = dcf({ ...base, netDebt: 50 })
    near(r.equityValue, r.enterpriseValue - 50)
  })

  it('divides by shares for a per-share value', () => {
    const r = dcf({ ...base, sharesOutstanding: 10 })
    near(r.perShare, r.equityValue / 10)
  })

  it('leaves per-share null when shares are not given', () => {
    expect(dcf(base).perShare).toBeNull()
  })

  // Gordon growth diverges once g >= r; returning a confident Infinity would be
  // far worse than refusing.
  it('refuses when terminal growth meets or exceeds the discount rate', () => {
    expect(() => dcf({ ...base, terminalGrowth: 0.1 })).toThrow(/below the discount rate/i)
    expect(() => dcf({ ...base, terminalGrowth: 0.5 })).toThrow(/below the discount rate/i)
  })

  it('rejects a non-positive discount rate', () => {
    expect(() => dcf({ ...base, discountRate: 0 })).toThrow(/greater than 0/i)
  })

  it('requires cash flows', () => {
    expect(() => dcf({ ...base, cashflows: [] })).toThrow(/at least one/i)
  })

  it('reports how much of the value is terminal — the key DCF caveat', () => {
    const r = dcf(base)
    expect(r.terminalSharePct).toBeGreaterThan(0)
    expect(r.terminalSharePct).toBeLessThan(1)
  })
})

describe('cagr', () => {
  it('computes a doubling over 2 years', () => {
    near(cagr(100, 400, 2), 1) // 100% a year
  })

  it('is zero for no change', () => {
    near(cagr(100, 100, 5), 0)
  })

  it('rejects non-positive inputs', () => {
    expect(() => cagr(0, 100, 1)).toThrow()
    expect(() => cagr(100, 0, 1)).toThrow()
    expect(() => cagr(100, 200, 0)).toThrow()
  })
})

describe('returnsFromPrices', () => {
  it('computes period returns', () => {
    expect(returnsFromPrices([100, 110, 99])).toEqual([0.10000000000000009, -0.09999999999999998])
  })

  it('is empty for a single price', () => {
    expect(returnsFromPrices([100])).toEqual([])
  })

  it('skips a zero denominator instead of yielding Infinity', () => {
    expect(returnsFromPrices([0, 100]).length).toBe(0)
  })
})

describe('stdev / mean', () => {
  it('uses the sample (n-1) denominator', () => {
    near(stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2.13808993, 1e-6)
  })

  it('is zero for a single point', () => {
    expect(stdev([5])).toBe(0)
    near(mean([5]), 5)
  })
})

describe('sharpe', () => {
  it('is positive for a rising series', () => {
    expect(sharpe([0.01, 0.012, 0.008, 0.011])).toBeGreaterThan(0)
  })

  it('is null when there is no variation, not Infinity', () => {
    expect(sharpe([0.01, 0.01, 0.01])).toBeNull()
  })

  it('is null with too few observations', () => {
    expect(sharpe([0.01])).toBeNull()
  })

  it('falls when the risk-free rate rises', () => {
    const r = [0.01, 0.02, -0.005, 0.015]
    expect(sharpe(r, { riskFreeRate: 0.5 })).toBeLessThan(sharpe(r, { riskFreeRate: 0 }))
  })
})

describe('sortino', () => {
  it('exceeds Sharpe when downside is milder than total volatility', () => {
    const r = [0.05, 0.04, -0.005, 0.06]
    expect(sortino(r)).toBeGreaterThan(sharpe(r))
  })

  it('is null when nothing fell below the threshold', () => {
    expect(sortino([0.01, 0.02, 0.03])).toBeNull()
  })
})

describe('maxDrawdown', () => {
  it('finds the deepest peak-to-trough fall', () => {
    const r = maxDrawdown([100, 120, 60, 80])
    near(r.maxDrawdown, -0.5)
    expect(r.peakIndex).toBe(1)
    expect(r.troughIndex).toBe(2)
  })

  it('is zero for a series that only rises', () => {
    expect(maxDrawdown([1, 2, 3]).maxDrawdown).toBe(0)
  })

  it('is safe for a short series', () => {
    expect(maxDrawdown([1]).maxDrawdown).toBe(0)
  })
})

describe('valueAtRisk', () => {
  const r = [-0.10, -0.05, -0.02, 0.01, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08]

  it('returns a negative number for a loss', () => {
    expect(valueAtRisk(r, { confidence: 0.9 })).toBeLessThan(0)
  })

  it('gets worse as confidence rises', () => {
    expect(valueAtRisk(r, { confidence: 0.99 })).toBeLessThanOrEqual(valueAtRisk(r, { confidence: 0.8 }))
  })

  it('rejects an out-of-range confidence', () => {
    expect(() => valueAtRisk(r, { confidence: 1 })).toThrow(/between 0 and 1/i)
    expect(() => valueAtRisk(r, { confidence: 0 })).toThrow(/between 0 and 1/i)
  })

  it('is null for no data', () => {
    expect(valueAtRisk([])).toBeNull()
  })
})

describe('conditionalVaR', () => {
  it('is at least as severe as VaR', () => {
    const r = [-0.20, -0.10, -0.05, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07]
    expect(conditionalVaR(r, { confidence: 0.9 })).toBeLessThanOrEqual(valueAtRisk(r, { confidence: 0.9 }))
  })
})

describe('analyzeSeries', () => {
  const prices = [100, 102, 101, 105, 103, 108, 107, 110]

  it('summarises a price series', () => {
    const a = analyzeSeries(prices, { periodsPerYear: 252 })
    expect(a.observations).toBe(8)
    near(a.totalReturn, 0.10, 1e-9)
    expect(a.volatility).toBeGreaterThan(0)
    expect(a.maxDrawdown).toBeLessThan(0)
  })

  it('requires at least two prices', () => {
    expect(() => analyzeSeries([100])).toThrow(/at least two/i)
  })

  it('never returns Infinity for a flat series', () => {
    const a = analyzeSeries([100, 100, 100, 100])
    expect(a.sharpe).toBeNull()
    expect(Number.isFinite(a.volatility)).toBe(true)
  })
})
