/**
 * Technical indicators — SMA, EMA, RSI, MACD, Bollinger, ATR, stochastic.
 *
 * Every series is returned ALIGNED to the input length, with `null` during the
 * warm-up period. Shifting arrays instead (the common shortcut) silently
 * misaligns an indicator against its own prices, which is how backtests end up
 * quietly trading on tomorrow's data.
 *
 * Written from the standard published definitions (Wilder 1978 for RSI/ATR,
 * Appel for MACD, Bollinger for the bands). No third-party code.
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)
const clean = (a) => (Array.isArray(a) ? a : []).map(x => (isNum(x) ? x : null))

function need(period, name = 'period') {
  const p = Math.floor(Number(period))
  if (!Number.isFinite(p) || p < 1) throw new Error(`${name} must be a positive whole number.`)
  return p
}

/** Simple moving average. */
export function sma(values, period = 20) {
  const p = need(period)
  const v = clean(values)
  const out = new Array(v.length).fill(null)
  let sum = 0
  let count = 0
  for (let i = 0; i < v.length; i++) {
    if (v[i] == null) { sum = 0; count = 0; continue } // a gap restarts the window
    sum += v[i]
    count++
    if (count > p) { sum -= v[i - p]; count = p }
    if (count === p) out[i] = sum / p
  }
  return out
}

/** Exponential moving average, seeded with the first full SMA. */
export function ema(values, period = 20) {
  const p = need(period)
  const v = clean(values)
  const out = new Array(v.length).fill(null)
  const k = 2 / (p + 1)
  let prev = null
  let seed = []
  for (let i = 0; i < v.length; i++) {
    if (v[i] == null) continue
    if (prev == null) {
      seed.push(v[i])
      if (seed.length === p) {
        prev = seed.reduce((s, x) => s + x, 0) / p
        out[i] = prev
      }
      continue
    }
    prev = v[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/**
 * Relative Strength Index using Wilder's smoothing (not a simple average —
 * that is the most common way RSI is implemented wrongly).
 */
export function rsi(values, period = 14) {
  const p = need(period)
  const v = clean(values)
  const out = new Array(v.length).fill(null)
  if (v.length <= p) return out

  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1]
    if (d >= 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= p
  avgLoss /= p
  out[p] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (p - 1) + gain) / p
    avgLoss = (avgLoss * (p - 1) + loss) / p
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

/** MACD line, signal line and histogram. */
export function macd(values, { fast = 12, slow = 26, signal = 9 } = {}) {
  const f = ema(values, fast)
  const s = ema(values, slow)
  const line = f.map((x, i) => (x == null || s[i] == null ? null : x - s[i]))
  // The signal EMA must run over the MACD line only where it exists, then be
  // written back at the right offset — otherwise it drifts by the warm-up gap.
  const firstIdx = line.findIndex(x => x != null)
  const sig = new Array(line.length).fill(null)
  if (firstIdx >= 0) {
    const packed = line.slice(firstIdx)
    const packedSig = ema(packed, signal)
    for (let i = 0; i < packedSig.length; i++) sig[firstIdx + i] = packedSig[i]
  }
  const hist = line.map((x, i) => (x == null || sig[i] == null ? null : x - sig[i]))
  return { macd: line, signal: sig, histogram: hist }
}

/** Bollinger Bands: SMA ± k population standard deviations. */
export function bollinger(values, { period = 20, stdDevs = 2 } = {}) {
  const p = need(period)
  const v = clean(values)
  const mid = sma(v, p)
  const upper = new Array(v.length).fill(null)
  const lower = new Array(v.length).fill(null)
  const width = new Array(v.length).fill(null)

  for (let i = p - 1; i < v.length; i++) {
    if (mid[i] == null) continue
    const win = v.slice(i - p + 1, i + 1)
    if (win.some(x => x == null)) continue
    const m = mid[i]
    const sd = Math.sqrt(win.reduce((s, x) => s + (x - m) ** 2, 0) / p)
    upper[i] = m + stdDevs * sd
    lower[i] = m - stdDevs * sd
    width[i] = m === 0 ? null : (upper[i] - lower[i]) / m
  }
  return { middle: mid, upper, lower, width }
}

/** Average True Range (Wilder). Needs high/low/close. */
export function atr(highs, lows, closes, period = 14) {
  const p = need(period)
  const h = clean(highs)
  const l = clean(lows)
  const c = clean(closes)
  const n = Math.min(h.length, l.length, c.length)
  const out = new Array(n).fill(null)
  if (n <= p) return out

  const tr = new Array(n).fill(null)
  for (let i = 1; i < n; i++) {
    if (h[i] == null || l[i] == null || c[i - 1] == null) continue
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))
  }

  let sum = 0
  for (let i = 1; i <= p; i++) sum += tr[i] ?? 0
  let prev = sum / p
  out[p] = prev
  for (let i = p + 1; i < n; i++) {
    if (tr[i] == null) continue
    prev = (prev * (p - 1) + tr[i]) / p
    out[i] = prev
  }
  return out
}

/** Stochastic oscillator %K and %D. */
export function stochastic(highs, lows, closes, { period = 14, smooth = 3 } = {}) {
  const p = need(period)
  const h = clean(highs)
  const l = clean(lows)
  const c = clean(closes)
  const n = Math.min(h.length, l.length, c.length)
  const k = new Array(n).fill(null)

  for (let i = p - 1; i < n; i++) {
    const hh = Math.max(...h.slice(i - p + 1, i + 1))
    const ll = Math.min(...l.slice(i - p + 1, i + 1))
    if (!isNum(hh) || !isNum(ll) || c[i] == null) continue
    k[i] = hh === ll ? 50 : ((c[i] - ll) / (hh - ll)) * 100  // flat range: neutral, not divide-by-zero
  }
  return { k, d: sma(k, smooth) }
}

/** Crossover signal: +1 where fast crosses above slow, -1 below, else 0. */
export function crossoverSignal(fast, slow) {
  const out = new Array(fast.length).fill(0)
  for (let i = 1; i < fast.length; i++) {
    const a = fast[i], b = slow[i], pa = fast[i - 1], pb = slow[i - 1]
    if (a == null || b == null || pa == null || pb == null) continue
    if (pa <= pb && a > b) out[i] = 1
    else if (pa >= pb && a < b) out[i] = -1
  }
  return out
}
