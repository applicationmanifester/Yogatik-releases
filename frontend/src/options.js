/**
 * Options pricing — Black-Scholes-Merton, Greeks, implied volatility, and a
 * binomial tree for American exercise.
 *
 * Written from the published equations (Black & Scholes 1973, Merton 1973).
 * No third-party code — see finance.js for why that matters here. Formulas are
 * not copyrightable; this implementation is ours.
 *
 * PURE and deterministic, so results are reproducible and testable against the
 * standard reference values.
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

/** Standard normal PDF. */
export function normPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/**
 * Standard normal CDF via Abramowitz & Stegun 7.1.26 on erf.
 * Accurate to ~1.5e-7, which is far tighter than any volatility input.
 */
export function normCdf(x) {
  if (!isNum(x)) return NaN
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x) / Math.SQRT2
  // A&S 7.1.26 coefficients, evaluated by Horner's method.
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429]
  const t = 1 / (1 + 0.3275911 * z)
  const poly = ((((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0]) * t
  const erf = 1 - poly * Math.exp(-z * z)
  return 0.5 * (1 + sign * erf)
}

function guard({ spot, strike, timeYears, volatility, rate, dividendYield }) {
  if (!isNum(spot) || spot <= 0) throw new Error('Spot price must be greater than 0.')
  if (!isNum(strike) || strike <= 0) throw new Error('Strike must be greater than 0.')
  if (!isNum(timeYears) || timeYears <= 0) throw new Error('Time to expiry must be greater than 0 years.')
  if (!isNum(volatility) || volatility <= 0) throw new Error('Volatility must be greater than 0.')
  if (!isNum(rate)) throw new Error('Rate must be a number.')
  if (dividendYield != null && !isNum(dividendYield)) throw new Error('Dividend yield must be a number.')
}

export function d1d2({ spot, strike, timeYears, volatility, rate, dividendYield = 0 }) {
  const vt = volatility * Math.sqrt(timeYears)
  const d1 = (Math.log(spot / strike) + (rate - dividendYield + (volatility * volatility) / 2) * timeYears) / vt
  return { d1, d2: d1 - vt, vt }
}

/** European option price. type: 'call' | 'put'. */
export function blackScholes(params) {
  const { spot, strike, timeYears, rate, dividendYield = 0, type = 'call' } = params
  guard(params)
  const kind = String(type).toLowerCase()
  if (kind !== 'call' && kind !== 'put') throw new Error('Type must be "call" or "put".')

  const { d1, d2 } = d1d2({ ...params, dividendYield })
  const dfQ = Math.exp(-dividendYield * timeYears)
  const dfR = Math.exp(-rate * timeYears)

  return kind === 'call'
    ? spot * dfQ * normCdf(d1) - strike * dfR * normCdf(d2)
    : strike * dfR * normCdf(-d2) - spot * dfQ * normCdf(-d1)
}

/**
 * The Greeks. vega/theta/rho are returned BOTH raw (per unit) and in the units
 * traders actually quote — per 1% vol, per day, per 1% rate — because the raw
 * numbers are routinely misread by a factor of 100.
 */
export function greeks(params) {
  const { spot, strike, timeYears, volatility, rate, dividendYield = 0, type = 'call' } = params
  guard(params)
  const kind = String(type).toLowerCase()
  const { d1, d2 } = d1d2({ ...params, dividendYield })
  const dfQ = Math.exp(-dividendYield * timeYears)
  const dfR = Math.exp(-rate * timeYears)
  const sqrtT = Math.sqrt(timeYears)
  const pdf = normPdf(d1)

  const delta = kind === 'call' ? dfQ * normCdf(d1) : dfQ * (normCdf(d1) - 1)
  const gamma = (dfQ * pdf) / (spot * volatility * sqrtT)
  const vega = spot * dfQ * pdf * sqrtT
  const theta = kind === 'call'
    ? -(spot * dfQ * pdf * volatility) / (2 * sqrtT) - rate * strike * dfR * normCdf(d2) + dividendYield * spot * dfQ * normCdf(d1)
    : -(spot * dfQ * pdf * volatility) / (2 * sqrtT) + rate * strike * dfR * normCdf(-d2) - dividendYield * spot * dfQ * normCdf(-d1)
  const rho = kind === 'call'
    ? strike * timeYears * dfR * normCdf(d2)
    : -strike * timeYears * dfR * normCdf(-d2)

  return {
    delta, gamma, vega, theta, rho,
    vegaPer1Pct: vega / 100,
    thetaPerDay: theta / 365,
    rhoPer1Pct: rho / 100,
  }
}

/**
 * Implied volatility by bisection on price.
 * Bisection, not Newton: vega collapses for deep in/out-of-the-money options
 * and Newton then diverges to a confident nonsense number.
 */
export function impliedVolatility(params, { lo = 1e-4, hi = 5, tol = 1e-8, maxIter = 200 } = {}) {
  const { marketPrice } = params
  if (!isNum(marketPrice) || marketPrice <= 0) throw new Error('Market price must be greater than 0.')

  const priceAt = (v) => blackScholes({ ...params, volatility: v })
  let a = lo, b = hi
  let fa = priceAt(a) - marketPrice
  let fb = priceAt(b) - marketPrice
  // No bracket means the quote sits outside what this model can produce —
  // usually an arbitrage violation or a stale price. Say so.
  if (fa * fb > 0) return null

  for (let i = 0; i < maxIter; i++) {
    const mid = (a + b) / 2
    const fm = priceAt(mid) - marketPrice
    if (Math.abs(fm) < tol || (b - a) / 2 < 1e-12) return mid
    if (fa * fm < 0) { b = mid; fb = fm } else { a = mid; fa = fm }
  }
  return (a + b) / 2
}

/**
 * Cox-Ross-Rubinstein binomial tree. Handles AMERICAN exercise, which
 * Black-Scholes cannot — an American put is worth more than its European twin
 * and pricing it with BSM understates it.
 */
export function binomial(params, { steps = 200, american = true } = {}) {
  const { spot, strike, timeYears, volatility, rate, dividendYield = 0, type = 'call' } = params
  guard(params)
  const kind = String(type).toLowerCase()
  const n = Math.max(1, Math.min(2000, Math.floor(steps)))

  const dt = timeYears / n
  const u = Math.exp(volatility * Math.sqrt(dt))
  const d = 1 / u
  const disc = Math.exp(-rate * dt)
  const p = (Math.exp((rate - dividendYield) * dt) - d) / (u - d)
  if (!(p > 0 && p < 1)) throw new Error('Tree parameters are unstable; try more steps or a smaller time step.')

  const payoff = (s) => (kind === 'call' ? Math.max(0, s - strike) : Math.max(0, strike - s))

  let values = new Array(n + 1)
  for (let i = 0; i <= n; i++) values[i] = payoff(spot * Math.pow(u, n - i) * Math.pow(d, i))

  for (let step = n - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const cont = disc * (p * values[i] + (1 - p) * values[i + 1])
      if (american) {
        const s = spot * Math.pow(u, step - i) * Math.pow(d, i)
        values[i] = Math.max(cont, payoff(s))
      } else {
        values[i] = cont
      }
    }
  }
  return values[0]
}

/** C - P = S·e^(-qT) - K·e^(-rT). Useful as a self-check on any quote pair. */
export function putCallParityGap({ callPrice, putPrice, spot, strike, timeYears, rate, dividendYield = 0 }) {
  const lhs = callPrice - putPrice
  const rhs = spot * Math.exp(-dividendYield * timeYears) - strike * Math.exp(-rate * timeYears)
  return lhs - rhs
}
