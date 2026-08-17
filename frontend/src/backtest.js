/**
 * Signal backtester.
 *
 * THE point of this file is the one-bar delay. A signal computed from bar i's
 * close cannot be traded at bar i's close — you only know it once that bar has
 * closed. Trading it on the same bar is lookahead bias, and it is the single
 * most common reason a backtest looks brilliant and loses money live. Here the
 * position from a signal at bar i applies to the return from i to i+1.
 *
 * PURE and deterministic: no clock, no network, no randomness.
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

/**
 * @param prices        price series, oldest first
 * @param signals       per-bar target position: +1 long, 0 flat, -1 short
 * @param costBps       round-trip cost per position CHANGE, in basis points
 * @param allowShort    when false, a -1 signal is treated as flat
 * @param initialEquity starting capital
 */
export function backtest(prices, signals, {
  costBps = 0, allowShort = true, initialEquity = 10000,
} = {}) {
  const p = (Array.isArray(prices) ? prices : []).filter(isNum)
  if (p.length < 2) throw new Error('Provide at least two prices.')
  const sig = Array.isArray(signals) ? signals : []
  if (sig.length !== p.length) throw new Error('signals must have one entry per price.')
  if (!isNum(initialEquity) || initialEquity <= 0) throw new Error('initialEquity must be greater than 0.')

  const cost = Math.max(0, Number(costBps) || 0) / 10000
  const clampPos = (s) => {
    const v = isNum(s) ? Math.sign(s) : 0
    return !allowShort && v < 0 ? 0 : v
  }

  let position = 0
  let equity = initialEquity
  const equityCurve = [equity]
  const positions = [0]
  const trades = []
  let entry = null
  let totalCost = 0

  for (let i = 1; i < p.length; i++) {
    // The signal from the PREVIOUS bar is what we could actually have acted on.
    const target = clampPos(sig[i - 1])

    if (target !== position) {
      const turnover = Math.abs(target - position)
      const fee = equity * cost * turnover
      equity -= fee
      totalCost += fee

      if (position !== 0 && entry) {
        trades.push({
          side: position > 0 ? 'long' : 'short',
          entryIndex: entry.index,
          exitIndex: i - 1,
          entryPrice: entry.price,
          exitPrice: p[i - 1],
          returnPct: position * (p[i - 1] / entry.price - 1),
        })
        entry = null
      }
      if (target !== 0) entry = { index: i - 1, price: p[i - 1] }
      position = target
    }

    const barReturn = p[i] / p[i - 1] - 1
    equity *= 1 + position * barReturn
    equityCurve.push(equity)
    positions.push(position)
  }

  // Close anything still open at the final price, so stats include it.
  if (position !== 0 && entry) {
    trades.push({
      side: position > 0 ? 'long' : 'short',
      entryIndex: entry.index,
      exitIndex: p.length - 1,
      entryPrice: entry.price,
      exitPrice: p[p.length - 1],
      returnPct: position * (p[p.length - 1] / entry.price - 1),
      open: true,
    })
  }

  const wins = trades.filter(t => t.returnPct > 0)
  const losses = trades.filter(t => t.returnPct < 0)
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0))

  return {
    equityCurve,
    positions,
    trades,
    finalEquity: equity,
    totalReturn: equity / initialEquity - 1,
    buyHoldReturn: p[p.length - 1] / p[0] - 1,
    tradeCount: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    // Infinity would be a lie when there were simply no losers.
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? null : null) : grossWin / grossLoss,
    totalCost,
    exposure: positions.filter(x => x !== 0).length / positions.length,
  }
}

/** Compare a strategy against buy-and-hold on the same series. */
export function versusBuyHold(result) {
  if (!result) return null
  const diff = result.totalReturn - result.buyHoldReturn
  return {
    strategyReturn: result.totalReturn,
    buyHoldReturn: result.buyHoldReturn,
    excessReturn: diff,
    beatBuyHold: diff > 0,
  }
}

/**
 * Turn a crossover signal (which fires only ON the cross) into a HELD position
 * that persists until the opposite cross. Backtesting the raw crossover instead
 * means being flat on every bar except the crossing ones.
 */
export function holdSignal(crossings) {
  const out = new Array(crossings.length).fill(0)
  let held = 0
  for (let i = 0; i < crossings.length; i++) {
    if (crossings[i] === 1) held = 1
    else if (crossings[i] === -1) held = -1
    out[i] = held
  }
  return out
}
