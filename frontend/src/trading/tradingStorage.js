/**
 * tradingStorage.js — Secure local storage and state management for Zerodha & Paper Trading.
 * Persists user credentials, access tokens, paper portfolio, and risk limits locally in IndexedDB / localStorage.
 */

const STORAGE_KEY = 'yogatik_trading_config_v1'

const DEFAULT_CONFIG = {
  mode: 'paper', // 'paper' | 'live'
  paperBalance: 100000, // ₹1,00,000 virtual cash
  paperHoldings: {}, // { 'NSE:RELIANCE': { qty: 5, avgPrice: 2950, exchange: 'NSE' } }
  paperOrders: [], // [ { id, symbol, qty, price, side, type, status, timestamp } ]
  zerodhaApiKey: '',
  zerodhaApiSecret: '',
  zerodhaAccessToken: '',
  zerodhaPublicToken: '',
  zerodhaTokenExpiry: null,
  zerodhaUserId: '',
  riskLimits: {
    maxOrderValue: 25000, // Max ₹25,000 per trade limit
    maxDailyOrders: 10,
    enforceLimitOrders: true,
    requireConfirmation: true,
  },
}

let inMemoryConfig = null

export function getTradingConfig() {
  if (inMemoryConfig) return { ...inMemoryConfig }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (raw) {
      inMemoryConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      return { ...inMemoryConfig }
    }
  } catch { /* ignore */ }
  inMemoryConfig = { ...DEFAULT_CONFIG }
  return { ...inMemoryConfig }
}

export function saveTradingConfig(updates = {}) {
  const current = getTradingConfig()
  const next = {
    ...current,
    ...updates,
    riskLimits: {
      ...current.riskLimits,
      ...(updates.riskLimits || {}),
    },
  }
  inMemoryConfig = next
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }
  } catch { /* best effort */ }
  return next
}

export function resetPaperPortfolio(startingCash = 100000) {
  return saveTradingConfig({
    paperBalance: startingCash,
    paperHoldings: {},
    paperOrders: [],
  })
}
