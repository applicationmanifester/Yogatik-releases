import { describe, it, expect } from 'vitest'
import {
  normCdf, normPdf, blackScholes, greeks, impliedVolatility, binomial, putCallParityGap,
} from './options'

const near = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThan(tol)

// The textbook case: S=100, K=100, r=5%, sigma=20%, T=1y.
const REF = { spot: 100, strike: 100, timeYears: 1, volatility: 0.2, rate: 0.05 }

describe('normCdf', () => {
  it('is 0.5 at zero', () => near(normCdf(0), 0.5, 1e-7))
  it('matches known quantiles', () => {
    near(normCdf(1), 0.8413447, 1e-6)
    near(normCdf(-1), 0.1586553, 1e-6)
    near(normCdf(1.96), 0.9750021, 1e-6)
  })
  it('is symmetric', () => near(normCdf(-0.7) + normCdf(0.7), 1, 1e-7))
  it('saturates in the tails', () => {
    expect(normCdf(10)).toBeGreaterThan(0.999999)
    expect(normCdf(-10)).toBeLessThan(1e-6)
  })
})

describe('normPdf', () => {
  it('peaks at zero with the right height', () => near(normPdf(0), 0.3989423, 1e-7))
  it('is symmetric', () => near(normPdf(-1.3), normPdf(1.3), 1e-12))
})

describe('blackScholes', () => {
  // These are the canonical published values for the reference case.
  it('prices the reference call at ~10.4506', () => {
    near(blackScholes({ ...REF, type: 'call' }), 10.4506, 1e-3)
  })

  it('prices the reference put at ~5.5735', () => {
    near(blackScholes({ ...REF, type: 'put' }), 5.5735, 1e-3)
  })

  it('satisfies put-call parity', () => {
    const c = blackScholes({ ...REF, type: 'call' })
    const p = blackScholes({ ...REF, type: 'put' })
    near(putCallParityGap({ callPrice: c, putPrice: p, ...REF }), 0, 1e-6)
  })

  it('rises with volatility', () => {
    expect(blackScholes({ ...REF, volatility: 0.4 })).toBeGreaterThan(blackScholes({ ...REF, volatility: 0.2 }))
  })

  it('a call rises with spot, a put falls', () => {
    expect(blackScholes({ ...REF, spot: 110, type: 'call' })).toBeGreaterThan(blackScholes({ ...REF, type: 'call' }))
    expect(blackScholes({ ...REF, spot: 110, type: 'put' })).toBeLessThan(blackScholes({ ...REF, type: 'put' }))
  })

  it('a dividend yield lowers a call', () => {
    expect(blackScholes({ ...REF, dividendYield: 0.03 })).toBeLessThan(blackScholes({ ...REF, type: 'call' }))
  })

  it('never prices below intrinsic value', () => {
    const deepITM = blackScholes({ ...REF, spot: 200, type: 'call' })
    expect(deepITM).toBeGreaterThanOrEqual(200 - 100 * Math.exp(-0.05) - 1e-6)
  })

  it('rejects impossible inputs instead of returning NaN', () => {
    expect(() => blackScholes({ ...REF, spot: 0 })).toThrow(/spot/i)
    expect(() => blackScholes({ ...REF, timeYears: 0 })).toThrow(/expiry/i)
    expect(() => blackScholes({ ...REF, volatility: 0 })).toThrow(/volatility/i)
    expect(() => blackScholes({ ...REF, type: 'straddle' })).toThrow(/call.*put/i)
  })
})

describe('greeks', () => {
  it('call delta sits between 0 and 1; put delta between -1 and 0', () => {
    expect(greeks({ ...REF, type: 'call' }).delta).toBeGreaterThan(0)
    expect(greeks({ ...REF, type: 'call' }).delta).toBeLessThan(1)
    expect(greeks({ ...REF, type: 'put' }).delta).toBeLessThan(0)
    expect(greeks({ ...REF, type: 'put' }).delta).toBeGreaterThan(-1)
  })

  it('at-the-money call delta is near 0.6 for this case', () => {
    near(greeks({ ...REF, type: 'call' }).delta, 0.6368, 1e-3)
  })

  it('gamma and vega are identical for a call and a put', () => {
    const c = greeks({ ...REF, type: 'call' })
    const p = greeks({ ...REF, type: 'put' })
    near(c.gamma, p.gamma, 1e-12)
    near(c.vega, p.vega, 1e-12)
  })

  it('call delta minus put delta is 1 (no dividend)', () => {
    near(greeks({ ...REF, type: 'call' }).delta - greeks({ ...REF, type: 'put' }).delta, 1, 1e-6)
  })

  it('theta is negative for a long at-the-money call', () => {
    expect(greeks({ ...REF, type: 'call' }).theta).toBeLessThan(0)
  })

  // Raw vega/theta/rho are routinely misread by a factor of 100 or 365.
  it('also reports trader units', () => {
    const g = greeks({ ...REF, type: 'call' })
    near(g.vegaPer1Pct, g.vega / 100, 1e-12)
    near(g.thetaPerDay, g.theta / 365, 1e-12)
    near(g.rhoPer1Pct, g.rho / 100, 1e-12)
  })

  it('gamma is highest at the money', () => {
    const atm = greeks({ ...REF }).gamma
    expect(atm).toBeGreaterThan(greeks({ ...REF, spot: 150 }).gamma)
    expect(atm).toBeGreaterThan(greeks({ ...REF, spot: 60 }).gamma)
  })
})

describe('impliedVolatility', () => {
  it('recovers the volatility used to price the option', () => {
    const price = blackScholes({ ...REF, type: 'call' })
    near(impliedVolatility({ ...REF, type: 'call', marketPrice: price }), 0.2, 1e-4)
  })

  it('works for a put too', () => {
    const price = blackScholes({ ...REF, type: 'put', volatility: 0.35 })
    near(impliedVolatility({ ...REF, type: 'put', marketPrice: price }), 0.35, 1e-4)
  })

  // A quote no volatility can produce means an arbitrage violation or stale
  // data — returning null beats inventing a number.
  it('returns null for an unreachable price', () => {
    expect(impliedVolatility({ ...REF, type: 'call', marketPrice: 500 })).toBeNull()
  })

  it('rejects a non-positive market price', () => {
    expect(() => impliedVolatility({ ...REF, marketPrice: 0 })).toThrow(/greater than 0/i)
  })
})

describe('binomial', () => {
  it('converges to Black-Scholes for a European call', () => {
    const bs = blackScholes({ ...REF, type: 'call' })
    const tree = binomial({ ...REF, type: 'call' }, { steps: 500, american: false })
    near(tree, bs, 0.05)
  })

  // The whole reason a tree exists: BSM cannot price early exercise.
  it('prices an American put at or above its European twin', () => {
    const euro = binomial({ ...REF, type: 'put' }, { steps: 300, american: false })
    const amer = binomial({ ...REF, type: 'put' }, { steps: 300, american: true })
    expect(amer).toBeGreaterThanOrEqual(euro - 1e-9)
  })

  it('an American call on a non-dividend payer matches the European one', () => {
    const euro = binomial({ ...REF, type: 'call' }, { steps: 300, american: false })
    const amer = binomial({ ...REF, type: 'call' }, { steps: 300, american: true })
    near(amer, euro, 1e-6)
  })

  it('clamps an absurd step count rather than hanging', () => {
    expect(binomial({ ...REF }, { steps: 1e9 })).toBeGreaterThan(0)
  })
})
