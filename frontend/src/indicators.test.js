import { describe, it, expect } from 'vitest'
import { sma, ema, rsi, macd, bollinger, atr, stochastic, crossoverSignal } from './indicators'
import { backtest, versusBuyHold, holdSignal } from './backtest'

const near = (a, b, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('sma', () => {
  it('is null during warm-up and correct after', () => {
    const r = sma([1, 2, 3, 4, 5], 3)
    expect(r[0]).toBeNull()
    expect(r[1]).toBeNull()
    near(r[2], 2)
    near(r[3], 3)
    near(r[4], 4)
  })

  // Alignment is the whole point: index i of the output must correspond to
  // index i of the input, or a backtest silently trades on the wrong bar.
  it('returns an array the same length as the input', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toHaveLength(5)
  })

  it('is all null when the series is shorter than the period', () => {
    expect(sma([1, 2], 5).every(x => x === null)).toBe(true)
  })

  it('rejects a nonsense period', () => {
    expect(() => sma([1, 2, 3], 0)).toThrow(/positive whole number/i)
    expect(() => sma([1, 2, 3], -2)).toThrow()
  })
})

describe('ema', () => {
  it('is seeded with the first full SMA', () => {
    const r = ema([1, 2, 3, 4, 5], 3)
    near(r[2], 2) // SMA of 1,2,3
  })

  it('then applies the smoothing factor', () => {
    const r = ema([1, 2, 3, 4, 5], 3)
    near(r[3], 4 * 0.5 + 2 * 0.5) // k = 2/(3+1) = 0.5
  })

  it('stays aligned to the input', () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toHaveLength(5)
  })

  it('reacts faster than SMA to a jump', () => {
    const v = [10, 10, 10, 10, 10, 20]
    expect(ema(v, 5)[5]).toBeGreaterThan(sma(v, 5)[5])
  })
})

describe('rsi', () => {
  it('is 100 when every move is a gain', () => {
    const r = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14)
    near(r[14], 100, 1e-9)
  })

  it('is 0 when every move is a loss', () => {
    const down = Array.from({ length: 16 }, (_, i) => 100 - i)
    near(rsi(down, 14)[14], 0, 1e-9)
  })

  it('sits between 0 and 100 for mixed moves', () => {
    const v = [44, 44.3, 44.1, 44.6, 43.4, 44.3, 44.6, 43.8, 44.7, 45.1, 45.4, 45.4, 45.7, 46.2, 46.0, 46.0]
    const r = rsi(v, 14)[14]
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(100)
  })

  it('is null before the period completes', () => {
    expect(rsi([1, 2, 3], 14).every(x => x === null)).toBe(true)
  })
})

describe('macd', () => {
  const v = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.2)

  it('returns three aligned series', () => {
    const m = macd(v)
    expect(m.macd).toHaveLength(v.length)
    expect(m.signal).toHaveLength(v.length)
    expect(m.histogram).toHaveLength(v.length)
  })

  it('histogram is macd minus signal wherever both exist', () => {
    const m = macd(v)
    const i = m.histogram.findIndex(x => x != null)
    near(m.histogram[i], m.macd[i] - m.signal[i])
  })

  // The signal EMA must be written back at the right offset, or it drifts by
  // the whole warm-up gap and every crossover lands on the wrong bar.
  it('signal never starts before the macd line does', () => {
    const m = macd(v)
    const firstMacd = m.macd.findIndex(x => x != null)
    const firstSig = m.signal.findIndex(x => x != null)
    expect(firstSig).toBeGreaterThanOrEqual(firstMacd)
  })
})

describe('bollinger', () => {
  const v = [20, 21, 22, 21, 20, 19, 20, 21, 22, 23, 24, 23, 22, 21, 20, 21, 22, 23, 24, 25, 26]

  it('upper is above middle is above lower', () => {
    const b = bollinger(v, { period: 20, stdDevs: 2 })
    const i = b.middle.findIndex(x => x != null)
    expect(b.upper[i]).toBeGreaterThan(b.middle[i])
    expect(b.middle[i]).toBeGreaterThan(b.lower[i])
  })

  it('bands widen with more standard deviations', () => {
    const two = bollinger(v, { period: 20, stdDevs: 2 })
    const three = bollinger(v, { period: 20, stdDevs: 3 })
    const i = two.upper.findIndex(x => x != null)
    expect(three.upper[i]).toBeGreaterThan(two.upper[i])
  })

  it('collapses to the mean for a flat series', () => {
    const flat = new Array(25).fill(50)
    const b = bollinger(flat, { period: 20 })
    near(b.upper[24], 50)
    near(b.lower[24], 50)
  })
})

describe('atr', () => {
  const h = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20, 21]
  const l = [9, 10, 10, 9, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 19]
  const c = [9.5, 10.5, 11, 10, 12, 13, 12, 14, 15, 14, 16, 17, 16, 18, 19, 20]

  it('is positive once warmed up', () => {
    expect(atr(h, l, c, 14)[14]).toBeGreaterThan(0)
  })

  it('is null during warm-up and aligned to the input', () => {
    const a = atr(h, l, c, 14)
    expect(a[13]).toBeNull()
    expect(a).toHaveLength(16)
  })

  it('is all null when the series is too short', () => {
    expect(atr([1, 2], [1, 1], [1, 2], 14).every(x => x === null)).toBe(true)
  })
})

describe('stochastic', () => {
  const h = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
  const l = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
  const c = [9, 10, 12, 12, 13, 15, 15, 17, 17, 19, 19, 21, 21, 23, 24]

  it('%K stays within 0..100', () => {
    for (const k of stochastic(h, l, c, { period: 14 }).k) {
      if (k == null) continue
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThanOrEqual(100)
    }
  })

  it('returns neutral 50 for a flat range rather than dividing by zero', () => {
    const flat = new Array(15).fill(10)
    const s = stochastic(flat, flat, flat, { period: 14 })
    expect(s.k[14]).toBe(50)
  })
})

describe('crossoverSignal', () => {
  it('fires +1 when fast crosses above slow', () => {
    expect(crossoverSignal([1, 3], [2, 2])[1]).toBe(1)
  })

  it('fires -1 when fast crosses below slow', () => {
    expect(crossoverSignal([3, 1], [2, 2])[1]).toBe(-1)
  })

  it('is 0 when there is no cross', () => {
    expect(crossoverSignal([3, 4], [2, 2])[1]).toBe(0)
  })

  it('ignores nulls during warm-up', () => {
    expect(crossoverSignal([null, 3], [null, 2])[1]).toBe(0)
  })
})

describe('holdSignal', () => {
  // A raw crossover fires only ON the cross; backtesting it directly leaves you
  // flat on every other bar.
  it('holds the position until the opposite cross', () => {
    expect(holdSignal([0, 1, 0, 0, -1, 0])).toEqual([0, 1, 1, 1, -1, -1])
  })

  it('stays flat until the first signal', () => {
    expect(holdSignal([0, 0, 0])).toEqual([0, 0, 0])
  })
})

describe('backtest', () => {
  const up = [100, 110, 121, 133.1]

  // The core guarantee of this file.
  it('applies a signal on the NEXT bar, never the same one (no lookahead)', () => {
    // Signal only on the final bar: there is no later bar to trade it on,
    // so the strategy must end flat with zero return.
    const r = backtest(up, [0, 0, 0, 1])
    near(r.totalReturn, 0)
  })

  it('a held long captures the move', () => {
    const r = backtest(up, [1, 1, 1, 1])
    near(r.totalReturn, 0.331, 1e-9)
    near(r.buyHoldReturn, 0.331, 1e-9)
  })

  it('being flat earns nothing', () => {
    near(backtest(up, [0, 0, 0, 0]).totalReturn, 0)
  })

  it('a short loses in a rising market', () => {
    expect(backtest(up, [-1, -1, -1, -1]).totalReturn).toBeLessThan(0)
  })

  it('allowShort:false turns a short signal into flat', () => {
    near(backtest(up, [-1, -1, -1, -1], { allowShort: false }).totalReturn, 0)
  })

  it('costs reduce the return and are reported', () => {
    const free = backtest(up, [1, 1, 1, 1], { costBps: 0 })
    const paid = backtest(up, [1, 1, 1, 1], { costBps: 50 })
    expect(paid.totalReturn).toBeLessThan(free.totalReturn)
    expect(paid.totalCost).toBeGreaterThan(0)
  })

  it('records trades with entry and exit', () => {
    const r = backtest([100, 110, 100, 110], [1, 1, 0, 0])
    expect(r.tradeCount).toBeGreaterThanOrEqual(1)
    expect(r.trades[0].side).toBe('long')
    expect(r.trades[0].entryPrice).toBeGreaterThan(0)
  })

  it('reports exposure as the fraction of bars in the market', () => {
    expect(backtest(up, [0, 0, 0, 0]).exposure).toBe(0)
    expect(backtest(up, [1, 1, 1, 1]).exposure).toBeGreaterThan(0)
  })

  it('equity curve is aligned to the prices', () => {
    expect(backtest(up, [1, 1, 1, 1]).equityCurve).toHaveLength(up.length)
  })

  it('rejects mismatched inputs instead of guessing', () => {
    expect(() => backtest(up, [1, 1])).toThrow(/one entry per price/i)
    expect(() => backtest([100], [1])).toThrow(/at least two/i)
    expect(() => backtest(up, [1, 1, 1, 1], { initialEquity: 0 })).toThrow(/greater than 0/i)
  })

  it('profitFactor is null rather than Infinity when there were no losses', () => {
    const r = backtest(up, [1, 1, 1, 1])
    expect(r.profitFactor).toBeNull()
  })
})

describe('versusBuyHold', () => {
  it('reports the excess over buy-and-hold', () => {
    const r = backtest([100, 90, 120], [0, 0, 0])
    const v = versusBuyHold(r)
    expect(v.strategyReturn).toBe(r.totalReturn)
    near(v.excessReturn, r.totalReturn - r.buyHoldReturn)
  })

  it('is null for no result', () => {
    expect(versusBuyHold(null)).toBeNull()
  })
})
