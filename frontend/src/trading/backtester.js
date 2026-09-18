/**
 * backtester.js — High-Performance Vector Backtester with Indian Market Friction.
 *
 * Implements:
 * - Exact Indian Regulatory & Brokerage costs (STT, GST, Exchange charges, SEBI turnover fees, stamp duty, ₹20 brokerage).
 * - Dynamic spread & volatility slippage model.
 * - Quantitative performance attribution: Sharpe, Sortino, Max Drawdown, Profit Factor, Win Rate, and Expectancy.
 * - Deterministic synthetic candle generator for offline simulation.
 */

/**
 * Computes exact Indian equity trading charges.
 *
 * @param {Object} params
 * @param {'BUY'|'SELL'} params.side
 * @param {number} params.price
 * @param {number} params.quantity
 * @param {'equity_intraday'|'equity_delivery'} [params.segment='equity_intraday']
 * @returns {Object} Comprehensive statutory fee breakdown
 */
export function calculateIndianMarketFees({
  side,
  price,
  quantity,
  segment = 'equity_intraday',
}) {
  const qty = Math.abs(Number(quantity) || 0)
  const p = Number(price) || 0
  const turnover = qty * p

  if (turnover <= 0) {
    return {
      turnover: 0,
      brokerage: 0,
      stt: 0,
      exchangeCharges: 0,
      gst: 0,
      sebiCharges: 0,
      stampDuty: 0,
      totalFees: 0,
    }
  }

  // 1. Brokerage: ₹20 flat or 0.03% (whichever is lower) for intraday; ₹0 for equity delivery in discount brokers
  let brokerage = 0
  if (segment === 'equity_intraday') {
    brokerage = Math.min(20, turnover * 0.0003)
  }

  // 2. STT (Securities Transaction Tax)
  // Intraday: 0.025% on SELL turnover only
  // Delivery: 0.1% on both BUY & SELL
  let stt = 0
  if (segment === 'equity_intraday') {
    stt = side === 'SELL' ? turnover * 0.00025 : 0
  } else {
    stt = turnover * 0.001
  }

  // 3. Exchange Transaction Charges (NSE standard: 0.00345%)
  const exchangeCharges = turnover * 0.0000345

  // 4. GST: 18% on (Brokerage + Exchange Charges)
  const gst = (brokerage + exchangeCharges) * 0.18

  // 5. SEBI Turnover Charges: ₹10 per crore (0.0001%)
  const sebiCharges = turnover * 0.000001

  // 6. Stamp Duty: 0.003% on BUY turnover only for intraday (0.015% for delivery buy)
  let stampDuty = 0
  if (side === 'BUY') {
    stampDuty = segment === 'equity_intraday' ? turnover * 0.00003 : turnover * 0.00015
  }

  const totalFees = brokerage + stt + exchangeCharges + gst + sebiCharges + stampDuty

  return {
    turnover: Number(turnover.toFixed(2)),
    brokerage: Number(brokerage.toFixed(2)),
    stt: Number(stt.toFixed(2)),
    exchangeCharges: Number(exchangeCharges.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    sebiCharges: Number(sebiCharges.toFixed(4)),
    stampDuty: Number(stampDuty.toFixed(2)),
    totalFees: Number(totalFees.toFixed(2)),
  }
}

/**
 * Calculates dynamic slippage based on price volatility and candle range.
 */
export function calculateDynamicSlippage({
  candle,
  side,
  price,
  slippageBps = 3,
}) {
  const p = Number(price) || 0
  const candleRange = candle ? Math.abs((candle.high || p) - (candle.low || p)) : 0
  // Spread slippage: at least slippageBps basis points, adjusted for candle volatility
  const slippagePerShare = Math.max(p * (slippageBps / 10000), candleRange * 0.04)

  const effectivePrice = side === 'BUY' ? p + slippagePerShare : Math.max(0.05, p - slippagePerShare)

  return {
    originalPrice: p,
    effectivePrice: Number(effectivePrice.toFixed(2)),
    slippagePerShare: Number(slippagePerShare.toFixed(2)),
  }
}

/**
 * Generates synthetic candle series for deterministic backtesting and offline simulation.
 */
export function generateSyntheticCandles({
  basePrice = 2500,
  count = 120,
  trend = 'bullish', // 'bullish' | 'bearish' | 'sideways'
  volatility = 0.008,
} = {}) {
  const candles = []
  let currentPrice = basePrice
  const now = Date.now() - count * 15 * 60 * 1000 // 15-minute intervals

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now + i * 15 * 60 * 1000).toISOString()
    const drift = trend === 'bullish' ? 0.001 : trend === 'bearish' ? -0.001 : 0
    const shock = (Math.sin(i * 0.2) * 0.004) + (Math.cos(i * 0.5) * volatility)
    const pctChange = drift + shock

    const open = currentPrice
    const close = Math.max(10, open * (1 + pctChange))
    const high = Math.max(open, close) * (1 + Math.abs(shock * 0.5))
    const low = Math.min(open, close) * (1 - Math.abs(shock * 0.5))
    const volume = Math.floor(25000 + Math.abs(Math.sin(i)) * 75000)

    candles.push({
      date: timestamp,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    })

    currentPrice = close
  }

  return candles
}

/**
 * Simple Moving Average helper
 */
function calculateSMA(series, period) {
  const res = []
  for (let i = 0; i < series.length; i++) {
    if (i < period - 1) {
      res.push(series[i])
    } else {
      const slice = series.slice(i - period + 1, i + 1)
      const avg = slice.reduce((a, b) => a + b, 0) / period
      res.push(avg)
    }
  }
  return res
}

/**
 * Exponential Moving Average helper
 */
function calculateEMA(series, period) {
  const k = 2 / (period + 1)
  const res = []
  let prevEma = series[0] || 0
  for (let i = 0; i < series.length; i++) {
    if (i === 0) {
      res.push(series[0])
    } else {
      prevEma = series[i] * k + prevEma * (1 - k)
      res.push(prevEma)
    }
  }
  return res
}

/**
 * Relative Strength Index (RSI) helper
 */
function calculateRSI(closes, period = 14) {
  const rsi = []
  let gains = 0
  let losses = 0

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(50)
      continue
    }
    const diff = closes[i] - closes[i - 1]
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0

    if (i <= period) {
      gains += gain
      losses += loss
      if (i === period) {
        const avgGain = gains / period
        const avgLoss = losses / period
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
        rsi.push(Number((100 - 100 / (1 + rs)).toFixed(2)))
      } else {
        rsi.push(50)
      }
    } else {
      const prevRsi = rsi[rsi.length - 1]
      const avgGain = ((gains * (period - 1)) + gain) / period
      const avgLoss = ((losses * (period - 1)) + loss) / period
      gains = avgGain
      losses = avgLoss
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      rsi.push(Number((100 - 100 / (1 + rs)).toFixed(2)))
    }
  }

  return rsi
}

/**
 * Runs a vectorized backtest over a candle sequence with full market friction.
 *
 * @param {Array<Object>} candles - Historical price bars
 * @param {Object} [config={}] - Strategy parameters
 * @returns {Object} Comprehensive backtest report and performance statistics
 */
export function runVectorBacktest(candles = [], config = {}) {
  const {
    initialCapital = 100000,
    maxRiskPerTrade = 0.02, // 2% portfolio risk per trade
    profitTargetPct = 2.5,
    stopLossPct = 1.2,
    trailingStop = true,
    slippageBps = 3,
    segment = 'equity_intraday',
    fastPeriod = 9,
    slowPeriod = 21,
    rsiPeriod = 14,
  } = config

  if (!Array.isArray(candles) || candles.length < 30) {
    return {
      success: false,
      error: 'Insufficient candle data (minimum 30 bars required for vector analysis)',
      metrics: null,
      trades: [],
      equityCurve: [],
    }
  }

  const closes = candles.map((c) => c.close)
  const emaFast = calculateEMA(closes, fastPeriod)
  const emaSlow = calculateEMA(closes, slowPeriod)
  const rsi = calculateRSI(closes, rsiPeriod)

  let cash = initialCapital
  let currentPosition = null
  const trades = []
  const equityCurve = []
  let peakEquity = initialCapital
  let maxDrawdownPct = 0

  for (let i = slowPeriod; i < candles.length; i++) {
    const candle = candles[i]
    const currentPrice = candle.close

    // Mark-to-market equity
    const positionValuation = currentPosition ? currentPosition.quantity * currentPrice : 0
    const totalEquity = cash + positionValuation
    if (totalEquity > peakEquity) peakEquity = totalEquity
    const currentDrawdownPct = peakEquity > 0 ? ((peakEquity - totalEquity) / peakEquity) * 100 : 0
    if (currentDrawdownPct > maxDrawdownPct) maxDrawdownPct = currentDrawdownPct

    equityCurve.push({
      date: candle.date,
      equity: Number(totalEquity.toFixed(2)),
      drawdownPct: Number(currentDrawdownPct.toFixed(2)),
    })

    // 1. Manage Active Position (Exits)
    if (currentPosition) {
      const { entryPrice, quantity, stopLoss, takeProfit, highestPriceSinceEntry, entryIndex } = currentPosition
      let exitReason = null
      let exitPrice = currentPrice

      // Trailing stop update
      if (trailingStop && currentPrice > highestPriceSinceEntry) {
        currentPosition.highestPriceSinceEntry = currentPrice
        const newStop = currentPrice * (1 - stopLossPct / 100)
        if (newStop > currentPosition.stopLoss) {
          currentPosition.stopLoss = newStop
        }
      }

      // Check exit triggers
      if (candle.low <= currentPosition.stopLoss) {
        exitReason = 'STOP_LOSS'
        exitPrice = Math.min(currentPrice, currentPosition.stopLoss)
      } else if (candle.high >= takeProfit) {
        exitReason = 'PROFIT_TARGET'
        exitPrice = Math.max(currentPrice, takeProfit)
      } else if (i === candles.length - 1) {
        exitReason = 'MARKET_CLOSE'
        exitPrice = currentPrice
      }

      if (exitReason) {
        const slippage = calculateDynamicSlippage({ candle, side: 'SELL', price: exitPrice, slippageBps })
        const effectiveExitPrice = slippage.effectivePrice

        const grossExitVal = quantity * effectiveExitPrice
        const fees = calculateIndianMarketFees({ side: 'SELL', price: effectiveExitPrice, quantity, segment })
        const netExitVal = grossExitVal - fees.totalFees

        const grossEntryVal = quantity * entryPrice
        const grossPnl = grossExitVal - grossEntryVal
        const netPnl = netExitVal - (grossEntryVal + currentPosition.entryFees)
        const returnPct = grossEntryVal > 0 ? (netPnl / grossEntryVal) * 100 : 0

        cash += netExitVal

        trades.push({
          tradeId: trades.length + 1,
          entryIndex,
          exitIndex: i,
          entryDate: candles[entryIndex].date,
          exitDate: candle.date,
          entryPrice,
          exitPrice: effectiveExitPrice,
          quantity,
          grossPnl: Number(grossPnl.toFixed(2)),
          netPnl: Number(netPnl.toFixed(2)),
          totalFees: Number((currentPosition.entryFees + fees.totalFees).toFixed(2)),
          returnPct: Number(returnPct.toFixed(2)),
          exitReason,
          durationBars: i - entryIndex,
        })

        currentPosition = null
        continue
      }
    }

    // 2. Evaluate Entry Signal (EMA crossover + RSI confirmation)
    if (!currentPosition) {
      const prevCross = emaFast[i - 1] <= emaSlow[i - 1]
      const curCross = emaFast[i] > emaSlow[i]
      const rsiOk = rsi[i] >= 45 && rsi[i] <= 68

      if (prevCross && curCross && rsiOk) {
        const slippage = calculateDynamicSlippage({ candle, side: 'BUY', price: currentPrice, slippageBps })
        const effectiveEntryPrice = slippage.effectivePrice

        const stopLossPrice = effectiveEntryPrice * (1 - stopLossPct / 100)
        const riskPerShare = effectiveEntryPrice - stopLossPrice
        const maxRiskCash = totalEquity * maxRiskPerTrade
        const sharesByRisk = riskPerShare > 0 ? Math.floor(maxRiskCash / riskPerShare) : 0
        const sharesByCash = Math.floor(cash / (effectiveEntryPrice * 1.002)) // leave buffer for fees
        const quantity = Math.min(sharesByRisk, sharesByCash)

        if (quantity > 0) {
          const fees = calculateIndianMarketFees({ side: 'BUY', price: effectiveEntryPrice, quantity, segment })
          const totalCost = quantity * effectiveEntryPrice + fees.totalFees

          if (cash >= totalCost) {
            cash -= totalCost
            currentPosition = {
              entryIndex: i,
              entryPrice: effectiveEntryPrice,
              quantity,
              entryFees: fees.totalFees,
              stopLoss: stopLossPrice,
              takeProfit: effectiveEntryPrice * (1 + profitTargetPct / 100),
              highestPriceSinceEntry: effectiveEntryPrice,
            }
          }
        }
      }
    }
  }

  // 3. Compute Institutional Metrics
  const winningTrades = trades.filter((t) => t.netPnl > 0)
  const losingTrades = trades.filter((t) => t.netPnl <= 0)
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.netPnl, 0)
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.netPnl, 0))
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss

  const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCapital
  const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100
  const totalNetPnl = finalEquity - initialCapital
  const totalFeesPaid = trades.reduce((acc, t) => acc + t.totalFees, 0)

  // Returns for Sharpe & Sortino calculation
  const returns = trades.map((t) => t.returnPct / 100)
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const riskFreePerTrade = 0.065 / 252 // 6.5% annual RBI repo rate scaled to daily

  const variance = returns.length > 1
    ? returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
    : 0
  const stdDev = Math.sqrt(variance)
  const annualizedSharpe = stdDev > 0 ? ((avgReturn - riskFreePerTrade) / stdDev) * Math.sqrt(252) : 0

  const downsideVariance = returns.length > 1
    ? returns.filter((r) => r < 0).reduce((acc, r) => acc + Math.pow(r, 2), 0) / (returns.length - 1)
    : 0
  const downsideStdDev = Math.sqrt(downsideVariance)
  const annualizedSortino = downsideStdDev > 0 ? ((avgReturn - riskFreePerTrade) / downsideStdDev) * Math.sqrt(252) : 0

  const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0
  const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0
  const expectancy = trades.length > 0
    ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
    : 0

  return {
    success: true,
    metrics: {
      initialCapital,
      finalEquity: Number(finalEquity.toFixed(2)),
      netPnl: Number(totalNetPnl.toFixed(2)),
      totalReturnPercent: Number(totalReturnPct.toFixed(2)),
      totalFeesPaid: Number(totalFeesPaid.toFixed(2)),
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRatePercent: Number(winRate.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDrawdownPercent: Number(maxDrawdownPct.toFixed(2)),
      sharpeRatio: Number(annualizedSharpe.toFixed(2)),
      sortinoRatio: Number(annualizedSortino.toFixed(2)),
      expectancyPerTrade: Number(expectancy.toFixed(2)),
      averageWin: Number(avgWin.toFixed(2)),
      averageLoss: Number(avgLoss.toFixed(2)),
    },
    trades,
    equityCurve,
  }
}
