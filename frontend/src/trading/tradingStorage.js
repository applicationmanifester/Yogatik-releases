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
  startingDayEquity: 100000,
  riskLimits: {
    maxOrderValue: 25000, // Max ₹25,000 per trade limit
    maxDailyOrders: 10,
    maxDailyDrawdownPercent: 2.5, // Daily circuit breaker threshold
    useFractionalKelly: true,
    kellyMultiplier: 0.5, // Half-Kelly
    useChandelierStop: true,
    enforceLimitOrders: true,
    requireConfirmation: true,
  },
}

let inMemoryConfig = null

const STAGING_KEY = STORAGE_KEY + '_staging'

export function getTradingConfig() {
  if (inMemoryConfig) return { ...inMemoryConfig }

  if (typeof localStorage === 'undefined') {
    inMemoryConfig = { ...DEFAULT_CONFIG }
    return { ...inMemoryConfig }
  }

  // Try primary key first; fall back to staging key if primary is corrupt
  for (const key of [STORAGE_KEY, STAGING_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      inMemoryConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      // If we recovered from staging, re-promote to primary
      if (key === STAGING_KEY) {
        try { localStorage.setItem(STORAGE_KEY, raw) } catch { /* ignore */ }
      }
      return { ...inMemoryConfig }
    } catch {
      inMemoryConfig = null
      // Corrupt key — remove it and try the next
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }
  }

  inMemoryConfig = { ...DEFAULT_CONFIG }
  return { ...inMemoryConfig }
}

/**
 * Atomically persist config updates.
 *
 * Browser localStorage has no native atomic rename, so we approximate it:
 *   1. Serialize the next config to a staging key.
 *   2. Copy the staging value to the primary key.
 *   3. Remove the staging key.
 *
 * If the process is interrupted between steps 1 and 2, the staging key
 * holds a complete, valid copy that getTradingConfig will recover on the
 * next load.  This eliminates the torn-write window where a partial string
 * in the primary key would cause a JSON parse failure on startup.
 */
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

  if (typeof localStorage === 'undefined') return next

  try {
    const serialized = JSON.stringify(next)
    // Step 1 — write to staging (safe even if tab is closed mid-write)
    localStorage.setItem(STAGING_KEY, serialized)
    // Step 2 — promote staging → primary
    localStorage.setItem(STORAGE_KEY, serialized)
    // Step 3 — clean up staging key
    localStorage.removeItem(STAGING_KEY)
  } catch {
    // Storage quota exceeded or private-browsing restriction — best effort
  }
  return next
}

export function resetPaperPortfolio(startingCash = 100000) {
  return saveTradingConfig({
    paperBalance: startingCash,
    paperHoldings: {},
    paperOrders: [],
  })
}
