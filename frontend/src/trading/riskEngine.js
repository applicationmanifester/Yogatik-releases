/**
 * riskEngine.js — Enterprise Risk Management, Position Sizing, and Protective Circuit Breakers.
 *
 * Capabilities:
 * - Half-Kelly (Fractional Kelly Criterion) position sizing to avoid gambler's ruin.
 * - Dynamic ATR Chandelier Trailing Stop to lock in profits and minimize drawdown.
 * - Intraday Portfolio Circuit Breaker to prevent catastrophic tilt/drawdowns.
 * - Emergency Kill Switch for instantaneous portfolio square-off and order cancellation.
 */

/**
 * Calculates the Kelly Criterion fraction and returns the safe risk fraction.
 * Formula: f* = (p * b - q) / b
 * where:
 *   p = win rate (0.0 to 1.0)
 *   q = 1 - p
 *   b = payoff ratio (avgWin / avgLoss)
 *
 * @param {Object} params
 * @param {number} params.winRate - Historical or expected win rate (e.g., 0.55 for 55%)
 * @param {number} params.avgWin - Average winning trade amount or percentage
 * @param {number} params.avgLoss - Average losing trade amount or percentage (positive number)
 * @param {number} [params.fractionMultiplier=0.5] - Sizing fraction multiplier (default 0.5 for Half-Kelly)
 * @param {number} [params.maxCapitalPercent=0.05] - Hard cap on single position risk (default 5% of portfolio)
 * @param {number} [params.minCapitalPercent=0.005] - Minimum meaningful allocation if edge exists (default 0.5%)
 * @returns {Object} Kelly sizing recommendation and safe allocation metrics
 */
export function calculateKellyFraction({
  winRate,
  avgWin,
  avgLoss,
  fractionMultiplier = 0.5,
  maxCapitalPercent = 0.05,
  minCapitalPercent = 0.005,
}) {
  const p = Number(winRate) || 0
  const win = Number(avgWin) || 0
  const loss = Math.abs(Number(avgLoss) || 0)

  // Edge validation: requires positive win rate and loss > 0
  if (p <= 0 || p >= 1 || win <= 0 || loss <= 0) {
    return {
      fullKelly: 0,
      appliedFraction: 0,
      recommendedRiskPercent: 0,
      hasEdge: false,
      payoffRatio: 0,
      expectedValue: 0,
      calculateQuantity: () => 0,
    }
  }

  const b = win / loss // payoff ratio
  const q = 1 - p
  const fStar = (p * b - q) / b // Full Kelly fraction

  const expectedValue = p * win - q * loss

  if (fStar <= 0 || expectedValue <= 0) {
    return {
      fullKelly: 0,
      appliedFraction: 0,
      recommendedRiskPercent: 0,
      hasEdge: false,
      payoffRatio: Number(b.toFixed(2)),
      expectedValue: Number(expectedValue.toFixed(2)),
      calculateQuantity: () => 0,
    }
  }

  // Scale down to Fractional Kelly (default Half-Kelly: f* * 0.5)
  const fractional = fStar * Math.max(0.1, Math.min(1.0, fractionMultiplier))

  // Bound within safe operational guardrails [minCapitalPercent, maxCapitalPercent]
  const appliedFraction = Math.min(maxCapitalPercent, Math.max(minCapitalPercent, fractional))

  return {
    fullKelly: Number(fStar.toFixed(4)),
    appliedFraction: Number(appliedFraction.toFixed(4)),
    recommendedRiskPercent: Number((appliedFraction * 100).toFixed(2)),
    hasEdge: true,
    payoffRatio: Number(b.toFixed(2)),
    expectedValue: Number(expectedValue.toFixed(2)),
    calculateQuantity: (totalEquity, stockPrice, stopLossPrice) => {
      if (!totalEquity || !stockPrice || totalEquity <= 0 || stockPrice <= 0) return 0
      const riskPerShare = Math.abs(stockPrice - (stopLossPrice || stockPrice * 0.98))
      if (riskPerShare <= 0) return 0
      const maxRiskCash = totalEquity * appliedFraction
      const sharesByRisk = Math.floor(maxRiskCash / riskPerShare)
      const sharesByCash = Math.floor(totalEquity / stockPrice)
      return Math.max(0, Math.min(sharesByRisk, sharesByCash))
    },
  }
}

/**
 * Computes Average True Range (ATR) over a series of candles.
 * TR = max(High - Low, abs(High - Close_prev), abs(Low - Close_prev))
 *
 * @param {Array<{ high: number, low: number, close: number }>} candles
 * @param {number} [period=14]
 * @returns {number[]} Array of ATR values aligned with input candles
 */
export function calculateATRSeries(candles = [], period = 14) {
  if (!Array.isArray(candles) || candles.length === 0) return []

  const trs = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    if (i === 0) {
      trs.push(c.high - c.low)
    } else {
      const prevClose = candles[i - 1].close
      const tr = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      )
      trs.push(tr)
    }
  }

  // RMA (Wilder's Smoothing) for ATR
  const atrs = []
  let currentAtr = 0

  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) {
      atrs.push(0)
    } else if (i === period - 1) {
      const sum = trs.slice(0, period).reduce((acc, v) => acc + v, 0)
      currentAtr = sum / period
      atrs.push(Number(currentAtr.toFixed(2)))
    } else {
      currentAtr = (currentAtr * (period - 1) + trs[i]) / period
      atrs.push(Number(currentAtr.toFixed(2)))
    }
  }

  return atrs
}

/**
 * Computes the Chandelier Trailing Exit Stop.
 * Long Stop: Highest High(lookback) - (multiplier * ATR)
 * Short Stop: Lowest Low(lookback) + (multiplier * ATR)
 *
 * @param {Object} params
 * @param {Array<{ high: number, low: number, close: number }>} params.candles
 * @param {number} [params.period=22] - Lookback period (traditional Chandelier default is 22)
 * @param {number} [params.multiplier=3.0] - ATR multiplier (traditional 3.0)
 * @param {'LONG'|'SHORT'} [params.side='LONG']
 * @param {number} [params.previousStopPrice=0] - Ratchet constraint (stop cannot move against you)
 * @returns {Object} Chandelier stop price and status
 */
export function calculateChandelierStop({
  candles = [],
  period = 22,
  multiplier = 3.0,
  side = 'LONG',
  previousStopPrice = 0,
}) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { stopPrice: 0, atr: 0, highestHigh: 0, lowestLow: 0 }
  }

  const atrs = calculateATRSeries(candles, Math.min(period, candles.length))
  const latestAtr = atrs[atrs.length - 1] || (candles[candles.length - 1].high - candles[candles.length - 1].low)

  const lookbackCandles = candles.slice(-Math.min(period, candles.length))
  const highestHigh = Math.max(...lookbackCandles.map((c) => c.high))
  const lowestLow = Math.min(...lookbackCandles.map((c) => c.low))

  let rawStop = 0
  let ratchetedStop = 0

  if (side === 'LONG') {
    rawStop = highestHigh - multiplier * latestAtr
    // Ratchet rule: for long positions, trailing stop only moves upward
    ratchetedStop = previousStopPrice > 0 ? Math.max(previousStopPrice, rawStop) : rawStop
  } else {
    rawStop = lowestLow + multiplier * latestAtr
    // Ratchet rule: for short positions, trailing stop only moves downward
    ratchetedStop = previousStopPrice > 0 ? Math.min(previousStopPrice, rawStop) : rawStop
  }

  const currentPrice = candles[candles.length - 1].close

  return {
    stopPrice: Number(ratchetedStop.toFixed(2)),
    rawStop: Number(rawStop.toFixed(2)),
    atr: Number(latestAtr.toFixed(2)),
    highestHigh,
    lowestLow,
    isTriggered: side === 'LONG' ? currentPrice <= ratchetedStop : currentPrice >= ratchetedStop,
  }
}

/**
 * Checks if the daily portfolio drawdown has breached the safety circuit breaker.
 *
 * @param {Object} params
 * @param {number} params.startingDayEquity - Portfolio valuation at start of trading day (9:15 AM)
 * @param {number} params.currentEquity - Real-time valuation (cash + mark-to-market positions)
 * @param {number} [params.maxDailyDrawdownPercent=2.5] - Max tolerated drawdown percentage
 * @returns {Object} Circuit breaker status report
 */
export function checkDailyCircuitBreaker({
  startingDayEquity,
  currentEquity,
  maxDailyDrawdownPercent = 2.5,
}) {
  const start = Number(startingDayEquity) || 100000
  const current = Number(currentEquity) || start

  const drawdownCash = Math.max(0, start - current)
  const drawdownPct = start > 0 ? (drawdownCash / start) * 100 : 0
  const isTripped = drawdownPct >= maxDailyDrawdownPercent

  const maxLossAllowed = (start * maxDailyDrawdownPercent) / 100
  const remainingRiskBudget = Math.max(0, maxLossAllowed - drawdownCash)

  return {
    isTripped,
    drawdownPercent: Number(drawdownPct.toFixed(2)),
    drawdownCash: Number(drawdownCash.toFixed(2)),
    limitPercent: Number(maxDailyDrawdownPercent.toFixed(2)),
    remainingRiskBudget: Number(remainingRiskBudget.toFixed(2)),
    status: isTripped ? 'CIRCUIT_TRIPPED' : 'NORMAL',
    message: isTripped
      ? `Daily circuit breaker tripped! Drawdown is -${drawdownPct.toFixed(2)}% (limit: ${maxDailyDrawdownPercent}%). New BUY orders are locked.`
      : `Risk headroom healthy: -${drawdownPct.toFixed(2)}% drawdown of ${maxDailyDrawdownPercent}% limit. Remaining budget: ₹${remainingRiskBudget.toFixed(2)}`,
  }
}

/**
 * Emergency Kill Switch: Bulk-cancels all pending orders and squares off all open positions.
 *
 * @param {Object} params
 * @param {Function} params.cancelOrderFn - Function(orderId) => Promise<result>
 * @param {Function} params.squareOffPositionFn - Function(symbol, qty, price) => Promise<result>
 * @param {Array<Object>} [params.openOrders=[]] - List of open/pending orders
 * @param {Array<Object>} [params.activePositions=[]] - List of current open positions
 * @returns {Promise<Object>} Execution audit report
 */
export async function executeEmergencyKillSwitch({
  cancelOrderFn,
  squareOffPositionFn,
  openOrders = [],
  activePositions = [],
}) {
  const report = {
    timestamp: new Date().toISOString(),
    cancelledOrders: [],
    squaredOffPositions: [],
    failedCancellations: [],
    failedSquareOffs: [],
    success: true,
  }

  // 1. Cancel all open/pending orders
  for (const order of openOrders) {
    try {
      if (typeof cancelOrderFn === 'function') {
        const res = await cancelOrderFn(order.id || order.order_id)
        report.cancelledOrders.push({ id: order.id || order.order_id, res })
      }
    } catch (err) {
      report.failedCancellations.push({ id: order.id || order.order_id, error: err.message })
      report.success = false
    }
  }

  // 2. Square off all active positions
  for (const pos of activePositions) {
    const symbol = pos.symbol || pos.tradingsymbol
    const qty = Math.abs(pos.quantity || pos.qty || 0)
    if (qty > 0 && typeof squareOffPositionFn === 'function') {
      try {
        const res = await squareOffPositionFn(symbol, qty, pos.last_price || pos.avgPrice)
        report.squaredOffPositions.push({ symbol, qty, res })
      } catch (err) {
        report.failedSquareOffs.push({ symbol, qty, error: err.message })
        report.success = false
      }
    }
  }

  return report
}
