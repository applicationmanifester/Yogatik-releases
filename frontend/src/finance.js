/**
 * Financial analytics — valuation and risk maths.
 *
 * Written from standard textbook definitions (NPV/IRR, CAPM-style Sharpe,
 * historical VaR). No third-party code: FinceptTerminal, which covers similar
 * ground, is AGPL-3.0 and copying from it would force this app to become AGPL
 * too. Formulas themselves are not copyrightable; this implementation is ours.
 *
 * PURE — no network, no DOM, no dates from the clock — so every result is
 * reproducible and unit-testable, matching timeline.js / retrieval.js.
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const nums = (a) => (Array.isArray(a) ? a.filter(isNum) : [])

/** Net present value. cashflows[0] is t=0 and is NOT discounted. */
export function npv(rate, cashflows) {
  const cf = nums(cashflows)
  if (!cf.length) return 0
  if (!isNum(rate) || rate <= -1) throw new Error('Discount rate must be greater than -100%.')
  return cf.reduce((acc, c, t) => acc + c / Math.pow(1 + rate, t), 0)
}

/**
 * Internal rate of return — the rate where NPV crosses zero.
 * Bisection rather than Newton: slower but it cannot diverge, and a wrong IRR
 * that looks plausible is worse than an honest "no solution".
 */
export function irr(cashflows, { lo = -0.9999, hi = 10, tol = 1e-10, xtol = 1e-14, maxIter = 300 } = {}) {
  const cf = nums(cashflows)
  if (cf.length < 2) throw new Error('IRR needs at least two cash flows.')
  const hasPos = cf.some(c => c > 0)
  const hasNeg = cf.some(c => c < 0)
  if (!hasPos || !hasNeg) throw new Error('IRR needs at least one positive and one negative cash flow.')

  let a = lo, b = hi
  let fa = npv(a, cf), fb = npv(b, cf)
  if (fa * fb > 0) return null // no sign change in range: no real IRR here
  for (let i = 0; i < maxIter; i++) {
    const mid = (a + b) / 2
    const fm = npv(mid, cf)
    // Converge on the NPV VALUE first; the interval check is only a floor.
    // Stopping on a loose interval left a visible NPV residual for large flows.
    if (Math.abs(fm) < tol || (b - a) / 2 < xtol) return mid
    if (fa * fm < 0) { b = mid; fb = fm } else { a = mid; fa = fm }
  }
  return (a + b) / 2
}

/**
 * Discounted cash flow with a Gordon-growth terminal value.
 * Returns enterprise value, equity value and per-share value when the inputs
 * for them are supplied.
 */
export function dcf({
  cashflows = [], discountRate, terminalGrowth = 0, netDebt = 0, sharesOutstanding = 0,
} = {}) {
  const cf = nums(cashflows)
  if (!cf.length) throw new Error('Provide at least one projected cash flow.')
  if (!isNum(discountRate) || discountRate <= 0) throw new Error('Discount rate must be greater than 0.')
  if (!isNum(terminalGrowth)) throw new Error('Terminal growth must be a number.')
  if (terminalGrowth >= discountRate) {
    // Gordon growth explodes (or goes negative) once g >= r. Saying so beats
    // returning a confident infinity.
    throw new Error('Terminal growth must be below the discount rate, or the terminal value is undefined.')
  }

  const pvExplicit = cf.reduce((acc, c, i) => acc + c / Math.pow(1 + discountRate, i + 1), 0)
  const lastCf = cf[cf.length - 1]
  const terminalValue = (lastCf * (1 + terminalGrowth)) / (discountRate - terminalGrowth)
  const pvTerminal = terminalValue / Math.pow(1 + discountRate, cf.length)

  const enterpriseValue = pvExplicit + pvTerminal
  const equityValue = enterpriseValue - (isNum(netDebt) ? netDebt : 0)
  const perShare = isNum(sharesOutstanding) && sharesOutstanding > 0
    ? equityValue / sharesOutstanding
    : null

  return {
    pvExplicit, terminalValue, pvTerminal, enterpriseValue, equityValue, perShare,
    terminalSharePct: enterpriseValue ? pvTerminal / enterpriseValue : 0,
  }
}

/** Compound annual growth rate. */
export function cagr(begin, end, years) {
  if (!isNum(begin) || begin <= 0) throw new Error('Beginning value must be greater than 0.')
  if (!isNum(end) || end <= 0) throw new Error('Ending value must be greater than 0.')
  if (!isNum(years) || years <= 0) throw new Error('Years must be greater than 0.')
  return Math.pow(end / begin, 1 / years) - 1
}

/** Simple period-over-period returns from a price series. */
export function returnsFromPrices(prices) {
  const p = nums(prices)
  const out = []
  for (let i = 1; i < p.length; i++) {
    if (p[i - 1] === 0) continue
    out.push(p[i] / p[i - 1] - 1)
  }
  return out
}

export function mean(xs) {
  const a = nums(xs)
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
}

/** Sample standard deviation (n-1): these are samples, not a whole population. */
export function stdev(xs) {
  const a = nums(xs)
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}

export function volatility(returns, periodsPerYear = 252) {
  return stdev(returns) * Math.sqrt(Math.max(1, periodsPerYear))
}

/** Annualised Sharpe ratio. riskFreeRate is annual. */
export function sharpe(returns, { riskFreeRate = 0, periodsPerYear = 252 } = {}) {
  const r = nums(returns)
  if (r.length < 2) return null
  const sd = stdev(r)
  if (sd === 0) return null // undefined, not infinite
  const perPeriodRf = riskFreeRate / Math.max(1, periodsPerYear)
  return ((mean(r) - perPeriodRf) / sd) * Math.sqrt(Math.max(1, periodsPerYear))
}

/** Sortino: like Sharpe but only downside deviation is treated as risk. */
export function sortino(returns, { riskFreeRate = 0, periodsPerYear = 252 } = {}) {
  const r = nums(returns)
  if (r.length < 2) return null
  const perPeriodRf = riskFreeRate / Math.max(1, periodsPerYear)
  const downside = r.filter(x => x < perPeriodRf).map(x => (x - perPeriodRf) ** 2)
  if (!downside.length) return null // no downside observed: ratio is undefined
  const dd = Math.sqrt(downside.reduce((s, x) => s + x, 0) / downside.length)
  if (dd === 0) return null
  return ((mean(r) - perPeriodRf) / dd) * Math.sqrt(Math.max(1, periodsPerYear))
}

/** Largest peak-to-trough decline in a price series, as a negative fraction. */
export function maxDrawdown(prices) {
  const p = nums(prices)
  if (p.length < 2) return { maxDrawdown: 0, peakIndex: 0, troughIndex: 0 }
  let peak = p[0], peakIdx = 0, worst = 0, wPeak = 0, wTrough = 0
  for (let i = 1; i < p.length; i++) {
    if (p[i] > peak) { peak = p[i]; peakIdx = i; continue }
    if (peak === 0) continue
    const dd = p[i] / peak - 1
    if (dd < worst) { worst = dd; wPeak = peakIdx; wTrough = i }
  }
  return { maxDrawdown: worst, peakIndex: wPeak, troughIndex: wTrough }
}

/**
 * Historical Value at Risk — the loss not exceeded at `confidence`.
 * Returned as a NEGATIVE fraction, so -0.05 means "a 5% loss".
 */
export function valueAtRisk(returns, { confidence = 0.95 } = {}) {
  const r = nums(returns).slice().sort((a, b) => a - b)
  if (!r.length) return null
  if (!isNum(confidence) || confidence <= 0 || confidence >= 1) {
    throw new Error('Confidence must be between 0 and 1.')
  }
  const idx = Math.max(0, Math.min(r.length - 1, Math.floor((1 - confidence) * r.length)))
  return r[idx]
}

/** Mean loss BEYOND the VaR threshold (expected shortfall). */
export function conditionalVaR(returns, { confidence = 0.95 } = {}) {
  const v = valueAtRisk(returns, { confidence })
  if (v == null) return null
  const tail = nums(returns).filter(x => x <= v)
  return tail.length ? mean(tail) : v
}

/** One call that produces the usual risk summary for a price series. */
export function analyzeSeries(prices, { periodsPerYear = 252, riskFreeRate = 0, confidence = 0.95 } = {}) {
  const p = nums(prices)
  if (p.length < 2) throw new Error('Provide at least two prices.')
  const r = returnsFromPrices(p)
  const dd = maxDrawdown(p)
  const totalReturn = p[p.length - 1] / p[0] - 1
  const years = (p.length - 1) / Math.max(1, periodsPerYear)
  return {
    observations: p.length,
    totalReturn,
    annualizedReturn: years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : null,
    volatility: volatility(r, periodsPerYear),
    sharpe: sharpe(r, { riskFreeRate, periodsPerYear }),
    sortino: sortino(r, { riskFreeRate, periodsPerYear }),
    maxDrawdown: dd.maxDrawdown,
    valueAtRisk: valueAtRisk(r, { confidence }),
    conditionalVaR: conditionalVaR(r, { confidence }),
  }
}
