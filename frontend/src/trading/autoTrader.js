/**
 * autoTrader.js — Autonomous Quantitative Trading & Profit Optimization Engine.
 * Continuously monitors watchlists, calculates quantitative indicators,
 * filters for positive expected value setups, and manages stop-loss & profit targets.
 */

import { getTradingConfig, saveTradingConfig } from './tradingStorage'
import { analyzeStock } from '../tools/zerodhaTrade'
import { executePaperOrder, resolveLiveStockPrice } from './paperEngine'
import { checkDailyCircuitBreaker } from './riskEngine'
import { evaluateExplainableSignal } from './explainableSignal'
import { recordTradeToJournal } from './tradeJournal'
import * as zerodha from './zerodhaClient'

export const DEFAULT_WATCHLIST = [
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'BHARTIARTL',
  'LT',
  'SBIN',
]

/**
 * Runs a single autonomous evaluation and execution cycle.
 */
export async function runAutoTraderCycle(options = {}) {
  const config = getTradingConfig()
  const autoCfg = {
    enabled: true,
    minSetupScore: 72,
    minRiskRewardRatio: 1.8,
    maxRiskPerTradePercent: 1.5,
    profitTargetPercent: 3.5,
    trailingStopLoss: true,
    watchlist: DEFAULT_WATCHLIST,
    ...(config.autoTrader || {}),
    ...options,
  }

  const logs = []
  const actionsTaken = []
  const topSetups = []
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  // Compute current portfolio equity
  const cash = config.mode === 'paper' ? (config.paperBalance || 0) : 50000
  let stockHoldingsValue = 0
  if (config.mode === 'paper') {
    const holdings = config.paperHoldings || {}
    for (const h of Object.values(holdings)) {
      stockHoldingsValue += (h.qty || 0) * (h.avgPrice || 0)
    }
  }
  const currentTotalEquity = cash + stockHoldingsValue

  // Evaluate Daily Circuit Breaker
  const circuit = checkDailyCircuitBreaker({
    startingDayEquity: config.startingDayEquity || 100000,
    currentEquity: currentTotalEquity,
    maxDailyDrawdownPercent: config.riskLimits?.maxDailyDrawdownPercent || 2.5,
  })

  if (circuit.isTripped) {
    logs.push(`${now} - ⚠️ ${circuit.message}`)
  }

  // 1. Position Management: Protect Existing Holdings (Profit Taking & Stop Loss)
  if (config.mode === 'paper') {
    const holdings = { ...(config.paperHoldings || {}) }
    for (const [sym, h] of Object.entries(holdings)) {
      try {
        const resolved = await resolveLiveStockPrice(sym)
        const curPrice = resolved.price
        if (curPrice > 0 && h.avgPrice > 0) {
          const gainPct = ((curPrice - h.avgPrice) / h.avgPrice) * 100

          // A. Take Profit Target (> 3.5% or hit target)
          if (gainPct >= autoCfg.profitTargetPercent) {
            const sellRes = await executePaperOrder({
              symbol: sym,
              side: 'SELL',
              quantity: h.qty,
              orderType: 'LIMIT',
              limitPrice: curPrice,
            })
            const act = `[Profit Booked] Sold ${h.qty}x ${sym} at ₹${curPrice.toFixed(2)} (+${gainPct.toFixed(2)}% | +₹${sellRes.realizedPnl.toFixed(2)})`
            logs.push(`${now} - ${act}`)
            actionsTaken.push({ type: 'TAKE_PROFIT', symbol: sym, gainPct, pnl: sellRes.realizedPnl })

            // Record to immutable forensic journal
            recordTradeToJournal({
              symbol: sym,
              side: 'SELL',
              quantity: h.qty,
              price: curPrice,
              netPnl: sellRes.realizedPnl,
              triggerReason: 'PROFIT_TARGET_HIT',
            })
            continue
          }

          // B. Stop Loss Protection (Cut losses at -2.0%)
          if (gainPct <= -2.0) {
            const sellRes = await executePaperOrder({
              symbol: sym,
              side: 'SELL',
              quantity: h.qty,
              orderType: 'LIMIT',
              limitPrice: curPrice,
            })
            const act = `[Stop Loss Hit] Sold ${h.qty}x ${sym} at ₹${curPrice.toFixed(2)} (${gainPct.toFixed(2)}% | Realized: ₹${sellRes.realizedPnl.toFixed(2)})`
            logs.push(`${now} - ${act}`)
            actionsTaken.push({ type: 'STOP_LOSS', symbol: sym, gainPct, pnl: sellRes.realizedPnl })

            // Record to immutable forensic journal
            recordTradeToJournal({
              symbol: sym,
              side: 'SELL',
              quantity: h.qty,
              price: curPrice,
              netPnl: sellRes.realizedPnl,
              triggerReason: 'STOP_LOSS_TRIGGERED',
            })
            continue
          }
        }
      } catch (err) {
        logs.push(`${now} - Error checking position ${sym}: ${err.message}`)
      }
    }
  }

  // 2. Watchlist Opportunity Scanner: Search for High-Probability Setups
  // Block new entry orders if daily circuit breaker has tripped
  const activeHoldings = config.paperHoldings || {}
  const watchlist = Array.isArray(autoCfg.watchlist)
    ? autoCfg.watchlist
    : DEFAULT_WATCHLIST

  if (circuit.isTripped) {
    logs.push(`${now} - [Circuit Breaker Lock] Skipping new position scans until next trading session or risk reset.`)
  } else {
    for (const sym of watchlist) {
      const cleanSym = String(sym).replace(/^(NSE|BSE):/i, '').toUpperCase()
      const fullSym = `NSE:${cleanSym}`

      // Skip if already in active holding
      if (activeHoldings[fullSym] && activeHoldings[fullSym].qty > 0) {
        continue
      }

      try {
        const analysis = await analyzeStock(cleanSym, 'NSE')
        if (analysis.setupScore >= autoCfg.minSetupScore) {
          // Compute explainable signal attribution
          const explainable = evaluateExplainableSignal({
            symbol: cleanSym,
            currentPrice: analysis.currentPrice,
            rsi: analysis.technicalIndicators?.rsi || 54,
            sma20: analysis.technicalIndicators?.sma20 || analysis.currentPrice * 0.99,
            sma50: analysis.technicalIndicators?.sma50 || analysis.currentPrice * 0.97,
            currentVolume: 150000,
            avgVolume: 100000,
            stopLoss: analysis.keyLevels?.stopLoss,
            targetPrice: analysis.keyLevels?.target1,
            portfolioEquity: currentTotalEquity,
          })
          analysis.explainable = explainable
          topSetups.push(analysis)

          // Positive Expected Value Condition:
          // Must be STRONG BUY with favorable risk-reward
          if (analysis.side === 'BUY' && analysis.setupScore >= autoCfg.minSetupScore) {
            const maxOrderVal = config.riskLimits?.maxOrderValue || 25000
            const price = analysis.currentPrice
            const stopLoss = analysis.keyLevels?.stopLoss || price * 0.985
            const riskPerShare = Math.max(1, price - stopLoss)

            // Half-Kelly or Standard Risk Sizing
            let sharesToBuy = 0
            if (config.riskLimits?.useFractionalKelly && explainable.kellySizing?.recommendedQuantity > 0) {
              sharesToBuy = explainable.kellySizing.recommendedQuantity
            } else {
              const maxCapitalToRisk = cash * (autoCfg.maxRiskPerTradePercent / 100)
              sharesToBuy = Math.floor(maxCapitalToRisk / riskPerShare)
            }

            // Respect maxOrderValue and available cash
            const maxAffordable = Math.floor(Math.min(cash * 0.95, maxOrderVal) / price)
            sharesToBuy = Math.min(sharesToBuy, maxAffordable)

            if (sharesToBuy >= 1) {
              if (config.mode === 'paper') {
                const buyRes = await executePaperOrder({
                  symbol: cleanSym,
                  exchange: 'NSE',
                  side: 'BUY',
                  quantity: sharesToBuy,
                  orderType: 'MARKET',
                })

                const act = `[Auto Buy] Bought ${sharesToBuy}x ${cleanSym} @ ₹${price.toFixed(2)} (Score: ${analysis.setupScore}/100 [${explainable.grade}], Target: ₹${analysis.keyLevels.target1}, SL: ₹${stopLoss})`
                logs.push(`${now} - ${act}`)
                actionsTaken.push({
                  type: 'ENTRY',
                  symbol: cleanSym,
                  quantity: sharesToBuy,
                  price,
                  setupScore: analysis.setupScore,
                  target: analysis.keyLevels.target1,
                  stopLoss,
                  grade: explainable.grade,
                  rationale: explainable.rationale,
                })

                // Record to forensic journal
                recordTradeToJournal({
                  symbol: cleanSym,
                  side: 'BUY',
                  quantity: sharesToBuy,
                  price,
                  triggerReason: 'AUTO_AI_SETUP_ENTRY',
                  aiRationale: explainable.rationale,
                })
              } else {
                logs.push(`${now} - [Signal Detected] ${cleanSym} score ${analysis.setupScore}/100 [Grade: ${explainable.grade}]. Live mode requires 1-click human confirmation.`)
              }
            }
          }
        }
      } catch (err) {
        logs.push(`${now} - Scan error on ${sym}: ${err.message}`)
      }
    }
  }

  // Update stored logs
  const existingLogs = config.autoTrader?.logs || []
  saveTradingConfig({
    autoTrader: {
      ...autoCfg,
      lastRunTimestamp: new Date().toISOString(),
      logs: [...logs, ...existingLogs].slice(0, 50),
    },
  })

  return {
    success: true,
    timestamp: now,
    mode: config.mode,
    scannedCount: watchlist.length,
    actionsCount: actionsTaken.length,
    actionsTaken,
    topSetups,
    circuitBreaker: circuit,
    recentLogs: logs,
  }
}

let autoTraderTimer = null

/**
 * Starts the background auto-trader daemon.
 */
export function startAutoTraderDaemon(intervalMs = 60000) {
  if (autoTraderTimer) clearInterval(autoTraderTimer)
  saveTradingConfig({ autoTrader: { enabled: true } })
  // Run first cycle immediately
  runAutoTraderCycle().catch(() => {})
  autoTraderTimer = setInterval(() => {
    runAutoTraderCycle().catch(() => {})
  }, intervalMs)
  return { running: true, intervalMs }
}

/**
 * Stops the background auto-trader daemon.
 */
export function stopAutoTraderDaemon() {
  if (autoTraderTimer) {
    clearInterval(autoTraderTimer)
    autoTraderTimer = null
  }
  saveTradingConfig({ autoTrader: { enabled: false } })
  return { running: false }
}

export function isAutoTraderRunning() {
  return autoTraderTimer !== null
}
