/**
 * paperEngine.js — Virtual Paper Trading Simulator for Indian Equities (NSE/BSE).
 * Allows realistic strategy testing and prompt executions with zero financial risk.
 */

import { getTradingConfig, saveTradingConfig } from './tradingStorage'
import { marketDataTool } from '../tools/marketData'

/**
 * Resolves live Indian stock price using market_data or fallback.
 */
export async function resolveLiveStockPrice(symbol) {
  const cleanSym = String(symbol || '').replace(/^(NSE|BSE):/i, '').trim().toUpperCase()
  // Try Stooq/Yahoo ticker format, e.g. RELIANCE.NS or INFY.NS
  const nsTicker = `${cleanSym}.NS`
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
    const res = await Promise.race([
      marketDataTool.execute({ kind: 'stock', symbol: nsTicker, range: '5d' }),
      timeoutPromise
    ])
    if (res?.success && Array.isArray(res.prices) && res.prices.length > 0) {
      const lastPrice = res.prices[res.prices.length - 1]
      return { price: lastPrice, currency: 'INR', symbol: cleanSym }
    }
  } catch { /* fallback */ }

  // Fallback if network fails or times out: simulated price
  return { price: 1000, currency: 'INR', symbol: cleanSym, simulated: true }
}

/**
 * Executes a simulated Buy or Sell order in the paper account.
 */
export async function executePaperOrder({
  symbol,
  side, // 'BUY' | 'SELL'
  quantity,
  exchange = 'NSE',
  orderType = 'MARKET',
  limitPrice = null,
}) {
  const cleanSym = `${exchange.toUpperCase()}:${String(symbol).replace(/^(NSE|BSE):/i, '').toUpperCase()}`
  const qty = parseInt(quantity, 10)
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive integer.')
  }

  const resolved = await resolveLiveStockPrice(symbol)
  const execPrice = (orderType === 'LIMIT' && limitPrice) ? parseFloat(limitPrice) : resolved.price
  const orderValue = execPrice * qty

  const config = getTradingConfig()
  const balance = config.paperBalance || 0
  const holdings = { ...(config.paperHoldings || {}) }
  const currentHolding = holdings[cleanSym] || { qty: 0, avgPrice: 0 }

  const orderId = `paper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  if (side.toUpperCase() === 'BUY') {
    if (balance < orderValue) {
      throw new Error(`Insufficient paper funds. Required: ₹${orderValue.toLocaleString('en-IN')}, Available: ₹${balance.toLocaleString('en-IN')}`)
    }

    const newQty = currentHolding.qty + qty
    const totalCost = (currentHolding.qty * currentHolding.avgPrice) + orderValue
    const newAvgPrice = totalCost / newQty

    holdings[cleanSym] = {
      symbol: cleanSym,
      qty: newQty,
      avgPrice: parseFloat(newAvgPrice.toFixed(2)),
      exchange,
    }

    const newBalance = balance - orderValue
    const orderRecord = {
      orderId,
      symbol: cleanSym,
      side: 'BUY',
      quantity: qty,
      price: execPrice,
      orderType,
      value: orderValue,
      status: 'COMPLETE',
      timestamp: now,
    }

    saveTradingConfig({
      paperBalance: parseFloat(newBalance.toFixed(2)),
      paperHoldings: holdings,
      paperOrders: [orderRecord, ...(config.paperOrders || []).slice(0, 49)],
    })

    return {
      success: true,
      paper: true,
      orderId,
      side: 'BUY',
      symbol: cleanSym,
      quantity: qty,
      executionPrice: execPrice,
      totalCost: orderValue,
      remainingBalance: newBalance,
      message: `[Paper Trade] Successfully bought ${qty} shares of ${cleanSym} at ₹${execPrice.toFixed(2)}. Remaining Cash: ₹${newBalance.toLocaleString('en-IN')}`,
    }
  }

  if (side.toUpperCase() === 'SELL') {
    if (currentHolding.qty < qty) {
      throw new Error(`Insufficient holdings to sell. You hold ${currentHolding.qty} shares of ${cleanSym}, attempted to sell ${qty}.`)
    }

    const realizedPnl = (execPrice - currentHolding.avgPrice) * qty
    const remainingQty = currentHolding.qty - qty

    if (remainingQty === 0) {
      delete holdings[cleanSym]
    } else {
      holdings[cleanSym] = {
        ...currentHolding,
        qty: remainingQty,
      }
    }

    const newBalance = balance + orderValue
    const orderRecord = {
      orderId,
      symbol: cleanSym,
      side: 'SELL',
      quantity: qty,
      price: execPrice,
      orderType,
      value: orderValue,
      realizedPnl: parseFloat(realizedPnl.toFixed(2)),
      status: 'COMPLETE',
      timestamp: now,
    }

    saveTradingConfig({
      paperBalance: parseFloat(newBalance.toFixed(2)),
      paperHoldings: holdings,
      paperOrders: [orderRecord, ...(config.paperOrders || []).slice(0, 49)],
    })

    return {
      success: true,
      paper: true,
      orderId,
      side: 'SELL',
      symbol: cleanSym,
      quantity: qty,
      executionPrice: execPrice,
      totalReceived: orderValue,
      realizedPnl,
      remainingBalance: newBalance,
      message: `[Paper Trade] Successfully sold ${qty} shares of ${cleanSym} at ₹${execPrice.toFixed(2)}. Realized P&L: ₹${realizedPnl.toFixed(2)}. Cash: ₹${newBalance.toLocaleString('en-IN')}`,
    }
  }

  throw new Error(`Invalid side: ${side}. Must be BUY or SELL.`)
}

/**
 * Returns current paper portfolio summary (cash, holdings, net worth, and P&L).
 */
export async function getPaperPortfolio() {
  const config = getTradingConfig()
  const cash = config.paperBalance || 0
  const holdingsRaw = config.paperHoldings || {}

  const holdingList = []
  let totalStockValue = 0
  let totalInvested = 0

  for (const [sym, h] of Object.entries(holdingsRaw)) {
    const resolved = await resolveLiveStockPrice(sym)
    const curPrice = resolved.price || h.avgPrice
    const curVal = curPrice * h.qty
    const invested = h.avgPrice * h.qty
    const unrealizedPnl = curVal - invested
    const pnlPct = invested > 0 ? (unrealizedPnl / invested) * 100 : 0

    totalStockValue += curVal
    totalInvested += invested

    holdingList.push({
      symbol: sym,
      quantity: h.qty,
      avgPrice: h.avgPrice,
      currentPrice: curPrice,
      investedValue: parseFloat(invested.toFixed(2)),
      currentValue: parseFloat(curVal.toFixed(2)),
      unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
      pnlPercentage: parseFloat(pnlPct.toFixed(2)),
    })
  }

  const netWorth = cash + totalStockValue
  const totalUnrealizedPnl = totalStockValue - totalInvested

  return {
    mode: 'paper',
    currency: 'INR',
    cashBalance: parseFloat(cash.toFixed(2)),
    stockValue: parseFloat(totalStockValue.toFixed(2)),
    netWorth: parseFloat(netWorth.toFixed(2)),
    totalInvested: parseFloat(totalInvested.toFixed(2)),
    totalUnrealizedPnl: parseFloat(totalUnrealizedPnl.toFixed(2)),
    holdings: holdingList,
    recentOrders: config.paperOrders || [],
  }
}

/**
 * Immediately exits (squares off) an existing paper holding at current market price.
 */
export async function squareOffPaperPosition(symbol) {
  const cleanSym = String(symbol || '').trim().toUpperCase()
  const config = getTradingConfig()
  const holdings = config.paperHoldings || {}

  let foundKey = null
  for (const k of Object.keys(holdings)) {
    if (k.toUpperCase() === cleanSym || k.replace(/^(NSE|BSE):/i, '').toUpperCase() === cleanSym.replace(/^(NSE|BSE):/i, '')) {
      foundKey = k
      break
    }
  }

  if (!foundKey || !holdings[foundKey]?.qty) {
    throw new Error(`No open paper position found for ${symbol}`)
  }

  const h = holdings[foundKey]
  return executePaperOrder({
    symbol: foundKey,
    side: 'SELL',
    quantity: h.qty,
    orderType: 'MARKET',
  })
}

/**
 * Cancels a pending paper order by ID.
 */
export function cancelPaperOrder(orderId) {
  const config = getTradingConfig()
  const orders = config.paperOrders || []
  let found = false
  const updatedOrders = orders.map(ord => {
    if (ord.orderId === orderId && ord.status === 'OPEN') {
      found = true
      return { ...ord, status: 'CANCELLED', cancelledAt: new Date().toISOString() }
    }
    return ord
  })
  if (found) {
    saveTradingConfig({ paperOrders: updatedOrders })
    return { success: true, orderId, status: 'CANCELLED' }
  }
  return { success: false, error: 'Order not found or not in OPEN state' }
}
