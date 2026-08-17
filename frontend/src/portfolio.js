/**
 * Portfolio construction — covariance, optimisation and risk contribution.
 *
 * Standard mean-variance results (Markowitz 1952) implemented from the
 * published equations. No third-party code; see finance.js on why.
 *
 * PURE and deterministic. Weights are UNCONSTRAINED (they may be negative,
 * i.e. short) unless longOnly is requested — silently clipping shorts would
 * change the answer without saying so.
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)

function validateSeries(series) {
  if (!Array.isArray(series) || series.length < 2) {
    throw new Error('Provide return series for at least two assets.')
  }
  const n = series[0]?.length ?? 0
  if (n < 2) throw new Error('Each asset needs at least two return observations.')
  if (!series.every(s => Array.isArray(s) && s.length === n)) {
    throw new Error('All assets must have the same number of observations.')
  }
  return n
}

/** Sample covariance matrix (n-1 denominator). */
export function covarianceMatrix(series) {
  const obs = validateSeries(series)
  const k = series.length
  const mu = series.map(mean)
  const cov = Array.from({ length: k }, () => new Array(k).fill(0))
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0
      for (let t = 0; t < obs; t++) s += (series[i][t] - mu[i]) * (series[j][t] - mu[j])
      const v = s / (obs - 1)
      cov[i][j] = v
      cov[j][i] = v
    }
  }
  return cov
}

export function correlationMatrix(series) {
  const cov = covarianceMatrix(series)
  const k = cov.length
  const sd = cov.map((row, i) => Math.sqrt(row[i]))
  return cov.map((row, i) => row.map((v, j) => {
    const d = sd[i] * sd[j]
    return d === 0 ? 0 : v / d
  }))
}

/** Gauss-Jordan inverse with partial pivoting. Throws when singular. */
export function invertMatrix(m) {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    if (Math.abs(a[piv][col]) < 1e-12) {
      throw new Error('Covariance matrix is singular — assets are perfectly correlated or duplicated.')
    }
    if (piv !== col) { const t = a[piv]; a[piv] = a[col]; a[col] = t }
    const d = a[col][col]
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]
    }
  }
  return a.map(row => row.slice(n))
}

const matVec = (m, v) => m.map(row => row.reduce((s, x, j) => s + x * v[j], 0))
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

function normalize(w) {
  const s = w.reduce((acc, x) => acc + x, 0)
  if (Math.abs(s) < 1e-15) throw new Error('Weights sum to zero; no valid portfolio.')
  return w.map(x => x / s)
}

/** Clip shorts and renormalise. Only applied when explicitly requested. */
function applyLongOnly(w) {
  const clipped = w.map(x => Math.max(0, x))
  const s = clipped.reduce((a, x) => a + x, 0)
  if (s <= 0) return w.map(() => 1 / w.length) // degenerate: fall back to equal weight
  return clipped.map(x => x / s)
}

export function portfolioReturn(weights, expectedReturns) {
  return dot(weights, expectedReturns)
}

export function portfolioVolatility(weights, cov) {
  const v = dot(weights, matVec(cov, weights))
  return Math.sqrt(Math.max(0, v))
}

/** Global minimum-variance portfolio: w ∝ Σ⁻¹·1 */
export function minVarianceWeights(cov, { longOnly = false } = {}) {
  const inv = invertMatrix(cov)
  const ones = new Array(cov.length).fill(1)
  const w = normalize(matVec(inv, ones))
  return longOnly ? applyLongOnly(w) : w
}

/** Tangency (max-Sharpe) portfolio: w ∝ Σ⁻¹·(μ − rf) */
export function tangencyWeights(cov, expectedReturns, { riskFreeRate = 0, longOnly = false } = {}) {
  if (!Array.isArray(expectedReturns) || expectedReturns.length !== cov.length) {
    throw new Error('expectedReturns must have one entry per asset.')
  }
  const excess = expectedReturns.map(r => r - riskFreeRate)
  if (excess.every(x => x <= 0)) {
    throw new Error('No asset beats the risk-free rate, so no tangency portfolio exists.')
  }
  const inv = invertMatrix(cov)
  const w = normalize(matVec(inv, excess))
  return longOnly ? applyLongOnly(w) : w
}

/** Each asset's share of total portfolio variance. */
export function riskContributions(weights, cov) {
  const vol = portfolioVolatility(weights, cov)
  if (vol === 0) return weights.map(() => 0)
  const mrc = matVec(cov, weights).map(x => x / vol)      // marginal contribution
  const rc = weights.map((w, i) => w * mrc[i])            // absolute contribution
  const total = rc.reduce((s, x) => s + x, 0)
  return rc.map(x => (total === 0 ? 0 : x / total))
}

/**
 * Risk parity: every asset contributes the same share of risk. Solved by
 * fixed-point iteration — no closed form exists for the general case.
 */
export function riskParityWeights(cov, { iterations = 500, tol = 1e-10 } = {}) {
  const n = cov.length
  let w = new Array(n).fill(1 / n)
  for (let it = 0; it < iterations; it++) {
    const vol = portfolioVolatility(w, cov)
    if (vol === 0) break
    const mrc = matVec(cov, w).map(x => x / vol)
    const target = vol / n
    const next = w.map((wi, i) => (mrc[i] === 0 ? wi : (wi * target) / (wi * mrc[i] || 1e-12)))
    const norm = normalize(next.map(x => Math.max(1e-12, x)))
    const delta = norm.reduce((s, x, i) => s + Math.abs(x - w[i]), 0)
    w = norm
    if (delta < tol) break
  }
  return w
}

/** Sample the efficient frontier between the min-variance and tangency portfolios. */
export function efficientFrontier(cov, expectedReturns, { points = 10, riskFreeRate = 0 } = {}) {
  const mv = minVarianceWeights(cov)
  const tan = tangencyWeights(cov, expectedReturns, { riskFreeRate })
  const n = Math.max(2, Math.min(100, Math.floor(points)))
  const out = []
  for (let i = 0; i < n; i++) {
    const a = i / (n - 1)
    const w = mv.map((x, j) => x * (1 - a) + tan[j] * a)
    out.push({
      alpha: a,
      weights: w,
      expectedReturn: portfolioReturn(w, expectedReturns),
      volatility: portfolioVolatility(w, cov),
    })
  }
  return out
}

/** Beta of an asset against a benchmark return series. */
export function beta(assetReturns, benchmarkReturns) {
  const a = (assetReturns || []).filter(isNum)
  const b = (benchmarkReturns || []).filter(isNum)
  const n = Math.min(a.length, b.length)
  if (n < 2) throw new Error('Need at least two paired observations.')
  const cov = covarianceMatrix([a.slice(0, n), b.slice(0, n)])
  const varB = cov[1][1]
  if (varB === 0) throw new Error('Benchmark has zero variance; beta is undefined.')
  return cov[0][1] / varB
}
