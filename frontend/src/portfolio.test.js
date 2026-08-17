import { describe, it, expect } from 'vitest'
import {
  covarianceMatrix, correlationMatrix, invertMatrix, portfolioReturn, portfolioVolatility,
  minVarianceWeights, tangencyWeights, riskContributions, riskParityWeights,
  efficientFrontier, beta,
} from './portfolio'

const near = (a, b, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)
const sum = (a) => a.reduce((s, x) => s + x, 0)

// Asset B is deliberately calmer than A, and C moves against A.
const A = [0.02, -0.01, 0.03, 0.005, -0.02, 0.015]
const B = [0.005, 0.004, 0.006, 0.005, 0.003, 0.005]
const C = [-0.018, 0.012, -0.025, -0.004, 0.021, -0.012]

describe('covarianceMatrix', () => {
  it('is square and symmetric', () => {
    const cov = covarianceMatrix([A, B, C])
    expect(cov).toHaveLength(3)
    near(cov[0][1], cov[1][0], 1e-15)
    near(cov[0][2], cov[2][0], 1e-15)
  })

  it('has variances on the diagonal', () => {
    const cov = covarianceMatrix([A, B])
    expect(cov[0][0]).toBeGreaterThan(0)
    expect(cov[0][0]).toBeGreaterThan(cov[1][1]) // A is more volatile than B
  })

  it('rejects ragged or too-short input', () => {
    expect(() => covarianceMatrix([A, [0.1]])).toThrow(/same number/i)
    expect(() => covarianceMatrix([A])).toThrow(/at least two assets/i)
    expect(() => covarianceMatrix([[0.1], [0.2]])).toThrow(/at least two return/i)
  })
})

describe('correlationMatrix', () => {
  it('has ones on the diagonal', () => {
    const c = correlationMatrix([A, B, C])
    near(c[0][0], 1)
    near(c[2][2], 1)
  })

  it('stays within [-1, 1]', () => {
    for (const row of correlationMatrix([A, B, C])) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(-1.000001)
        expect(v).toBeLessThanOrEqual(1.000001)
      }
    }
  })

  it('detects the negatively correlated pair', () => {
    expect(correlationMatrix([A, C])[0][1]).toBeLessThan(0)
  })
})

describe('invertMatrix', () => {
  it('inverts a known 2x2', () => {
    const inv = invertMatrix([[4, 7], [2, 6]])
    near(inv[0][0], 0.6, 1e-9)
    near(inv[0][1], -0.7, 1e-9)
    near(inv[1][0], -0.2, 1e-9)
    near(inv[1][1], 0.4, 1e-9)
  })

  it('M · M⁻¹ is the identity', () => {
    const m = [[2, 1, 1], [1, 3, 2], [1, 0, 0]]
    const inv = invertMatrix(m)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const v = m[i].reduce((s, x, k) => s + x * inv[k][j], 0)
        near(v, i === j ? 1 : 0, 1e-9)
      }
    }
  })

  // Duplicated assets are the classic way to make this blow up; saying so beats
  // returning silent nonsense.
  it('refuses a singular matrix with a useful message', () => {
    expect(() => invertMatrix([[1, 2], [2, 4]])).toThrow(/singular|correlated|duplicated/i)
  })
})

describe('portfolio return and volatility', () => {
  const cov = covarianceMatrix([A, B])

  it('return is the weighted average', () => {
    near(portfolioReturn([0.5, 0.5], [0.10, 0.04]), 0.07)
  })

  it('volatility is positive and below the riskier asset alone', () => {
    const mixed = portfolioVolatility([0.5, 0.5], cov)
    const allA = portfolioVolatility([1, 0], cov)
    expect(mixed).toBeGreaterThan(0)
    expect(mixed).toBeLessThan(allA)
  })

  it('diversification beats either leg when assets move oppositely', () => {
    const c2 = covarianceMatrix([A, C])
    expect(portfolioVolatility([0.5, 0.5], c2)).toBeLessThan(portfolioVolatility([1, 0], c2))
  })
})

describe('minVarianceWeights', () => {
  const cov = covarianceMatrix([A, B, C])

  it('weights sum to 1', () => near(sum(minVarianceWeights(cov)), 1, 1e-9))

  it('is genuinely the lowest-variance mix', () => {
    const w = minVarianceWeights(cov)
    const best = portfolioVolatility(w, cov)
    // Nothing nearby should beat it.
    for (const trial of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.25, 0.25]]) {
      expect(best).toBeLessThanOrEqual(portfolioVolatility(trial, cov) + 1e-9)
    }
  })

  it('longOnly removes short positions and still sums to 1', () => {
    const w = minVarianceWeights(cov, { longOnly: true })
    expect(w.every(x => x >= 0)).toBe(true)
    near(sum(w), 1, 1e-9)
  })
})

describe('tangencyWeights', () => {
  const cov = covarianceMatrix([A, B, C])

  it('weights sum to 1', () => {
    near(sum(tangencyWeights(cov, [0.10, 0.03, 0.08])), 1, 1e-9)
  })

  it('beats the min-variance portfolio on Sharpe', () => {
    const mu = [0.10, 0.03, 0.08]
    const rf = 0.01
    const sharpeOf = (w) => (portfolioReturn(w, mu) - rf) / portfolioVolatility(w, cov)
    expect(sharpeOf(tangencyWeights(cov, mu, { riskFreeRate: rf })))
      .toBeGreaterThan(sharpeOf(minVarianceWeights(cov)) - 1e-9)
  })

  it('refuses when nothing beats the risk-free rate', () => {
    expect(() => tangencyWeights(cov, [0.01, 0.01, 0.01], { riskFreeRate: 0.05 }))
      .toThrow(/risk-free/i)
  })

  it('requires one expected return per asset', () => {
    expect(() => tangencyWeights(cov, [0.1, 0.2])).toThrow(/one entry per asset/i)
  })
})

describe('riskContributions', () => {
  it('shares sum to 1', () => {
    const cov = covarianceMatrix([A, B, C])
    near(sum(riskContributions([1 / 3, 1 / 3, 1 / 3], cov)), 1, 1e-9)
  })

  it('the volatile asset contributes more than the calm one at equal weight', () => {
    const cov = covarianceMatrix([A, B])
    const rc = riskContributions([0.5, 0.5], cov)
    expect(rc[0]).toBeGreaterThan(rc[1])
  })
})

describe('riskParityWeights', () => {
  it('equalises risk contributions', () => {
    const cov = covarianceMatrix([A, B])
    const w = riskParityWeights(cov)
    const rc = riskContributions(w, cov)
    near(rc[0], rc[1], 1e-3)
  })

  it('weights sum to 1 and are positive', () => {
    const w = riskParityWeights(covarianceMatrix([A, B, C]))
    near(sum(w), 1, 1e-6)
    expect(w.every(x => x > 0)).toBe(true)
  })

  it('gives the calmer asset the larger weight', () => {
    const w = riskParityWeights(covarianceMatrix([A, B]))
    expect(w[1]).toBeGreaterThan(w[0]) // B is calmer than A
  })
})

describe('efficientFrontier', () => {
  it('returns the requested number of points', () => {
    expect(efficientFrontier(covarianceMatrix([A, B, C]), [0.1, 0.03, 0.08], { points: 6 })).toHaveLength(6)
  })

  it('every point has weights summing to 1', () => {
    for (const p of efficientFrontier(covarianceMatrix([A, B]), [0.1, 0.04], { points: 5 })) {
      near(sum(p.weights), 1, 1e-9)
    }
  })

  it('starts at minimum variance', () => {
    const cov = covarianceMatrix([A, B, C])
    const f = efficientFrontier(cov, [0.1, 0.03, 0.08], { points: 5 })
    const mv = portfolioVolatility(minVarianceWeights(cov), cov)
    near(f[0].volatility, mv, 1e-9)
  })
})

describe('beta', () => {
  it('is 1 against itself', () => near(beta(A, A), 1, 1e-9))

  it('is 2 for a series that moves twice as much', () => {
    near(beta(A.map(x => x * 2), A), 2, 1e-9)
  })

  it('is negative for an inversely related series', () => {
    expect(beta(C, A)).toBeLessThan(0)
  })

  it('refuses a zero-variance benchmark', () => {
    expect(() => beta(A, [0.01, 0.01, 0.01, 0.01, 0.01, 0.01])).toThrow(/undefined|zero variance/i)
  })
})
