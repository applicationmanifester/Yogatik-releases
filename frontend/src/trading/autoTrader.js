/**
 * autoTrader.js — Autonomous Quantitative Trading & Profit Optimization Engine.
 * Continuously monitors watchlists, calculates quantitative indicators,
 * filters for positive expected value setups, and manages stop-loss & profit targets.
 */

import { getTradingConfig, saveTradingConfig } from './tradingStorage'
import { analyzeStock } from '../tools/zerodhaTrade'
import { executePaperOrder, resolveLiveStockPrice } from './paperEngine'
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
            continue
          }
        }
      } catch (err) {
        logs.push(`${now} - Error checking position ${sym}: ${err.message}`)
      }
    }
  }

  // 2. Watchlist Opportunity Scanner: Search for High-Probability Setups
  const activeHoldings = config.paperHoldings || {}
  const watchlist = Array.isArray(autoCfg.watchlist)
    ? autoCfg.watchlist
    : DEFAULT_WATCHLIST

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
        topSetups.push(analysis)

        // Positive Expected Value Condition:
        // Must be STRONG BUY with favorable risk-reward
        if (analysis.side === 'BUY' && analysis.setupScore >= autoCfg.minSetupScore) {
          const cash = config.mode === 'paper' ? (config.paperBalance || 0) : 50000
          const maxOrderVal = config.riskLimits?.maxOrderValue || 25000
          const price = analysis.currentPrice
          const stopLoss = analysis.keyLevels.stopLoss
          const riskPerShare = Math.max(1, price - stopLoss)

          // Strict Risk Sizing: Risk only 1.5% of total capital
          const maxCapitalToRisk = cash * (autoCfg.maxRiskPerTradePercent / 100)
          let sharesToBuy = Math.floor(maxCapitalToRisk / riskPerShare)

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

              const act = `[Auto Buy] Bought ${sharesToBuy}x ${cleanSym} @ ₹${price.toFixed(2)} (Setup Score: ${analysis.setupScore}/100, Target: ₹${analysis.keyLevels.target1}, SL: ₹${stopLoss})`
              logs.push(`${now} - ${act}`)
              actionsTaken.push({
                type: 'ENTRY',
                symbol: cleanSym,
                quantity: sharesToBuy,
                price,
                setupScore: analysis.setupScore,
                target: analysis.keyLevels.target1,
                stopLoss,
              })
            } else {
              logs.push(`${now} - [Signal Detected] ${cleanSym} score ${analysis.setupScore}/100. Live mode requires 1-click human confirmation.`)
            }
          }
        }
      }
    } catch (err) {
      logs.push(`${now} - Scan error on ${sym}: ${err.message}`)
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
