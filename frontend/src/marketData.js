/**
 * Market data parsing — pure transforms from provider payloads into a common
 * price series, so the network half stays thin and this half stays testable.
 *
 * All sources here are KEYLESS, matching the app's "works with no API key"
 * stance: Stooq (equities/indices/FX, CSV), Coinbase (crypto candles, JSON)
 * and the World Bank (economic indicators, JSON).
 *
 * No third-party code — this is our own parsing over public HTTP endpoints.
 */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

/**
 * Some CSV endpoints answer 200 with an HTML anti-bot interstitial instead of
 * data — measured from a datacenter IP on 2026-08-17, Stooq returns a
 * JavaScript browser check. Parsing that yields an empty series, and blaming
 * the user's ticker for it is the wrong diagnosis.
 */
export function isBotChallenge(text) {
  const t = String(text || '').slice(0, 600).toLowerCase()
  if (!t) return false
  return t.includes('<!doctype html') || t.includes('<html') ||
    t.includes('requires javascript') || t.includes('verify your browser') ||
    t.includes('enable javascript') || t.includes('cf-browser-verification')
}

/** Common shape every source is normalised into. */
function series(symbol, source, rows) {
  const clean = rows
    .filter(r => r && r.date && isNum(r.close))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return {
    symbol,
    source,
    observations: clean.length,
    from: clean[0]?.date ?? null,
    to: clean[clean.length - 1]?.date ?? null,
    dates: clean.map(r => r.date),
    prices: clean.map(r => r.close),
    rows: clean,
  }
}

/**
 * Stooq daily CSV: Date,Open,High,Low,Close,Volume
 * Stooq answers 200 with the literal text "No data" for an unknown symbol, so
 * an empty parse is treated as "not found" by the caller rather than as an
 * empty-but-valid series.
 */
export function parseStooqCsv(csv, symbol = '') {
  const text = String(csv || '').trim()
  if (!text || /^no data/i.test(text)) return series(symbol, 'stooq', [])

  const lines = text.split(/\r?\n/).filter(Boolean)
  const header = lines[0].toLowerCase()
  if (!header.includes('date') || !header.includes('close')) return series(symbol, 'stooq', [])

  const cols = header.split(',')
  const iDate = cols.indexOf('date')
  const iOpen = cols.indexOf('open')
  const iHigh = cols.indexOf('high')
  const iLow = cols.indexOf('low')
  const iClose = cols.indexOf('close')
  const iVol = cols.indexOf('volume')

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',')
    const close = parseFloat(p[iClose])
    if (!isNum(close)) continue
    rows.push({
      date: p[iDate],
      open: parseFloat(p[iOpen]),
      high: parseFloat(p[iHigh]),
      low: parseFloat(p[iLow]),
      close,
      volume: iVol >= 0 ? parseFloat(p[iVol]) : null,
    })
  }
  return series(symbol, 'stooq', rows)
}

/**
 * Coinbase candles: [[time, low, high, open, close, volume], …], newest first.
 * The tuple order is NOT the intuitive OHLC — getting it wrong silently swaps
 * open and close, which quietly corrupts every downstream return.
 */
export function parseCoinbaseCandles(json, symbol = '') {
  const arr = Array.isArray(json) ? json : []
  const rows = []
  for (const c of arr) {
    if (!Array.isArray(c) || c.length < 5) continue
    const [time, low, high, open, close, volume] = c
    if (!isNum(time) || !isNum(close)) continue
    rows.push({
      date: new Date(time * 1000).toISOString().slice(0, 10),
      open, high, low, close,
      volume: isNum(volume) ? volume : null,
    })
  }
  return series(symbol, 'coinbase', rows)
}

/**
 * World Bank v2 returns [paging, data]. Values are null for years with no
 * observation, which must be dropped rather than read as zero.
 */
export function parseWorldBank(json) {
  const payload = Array.isArray(json) ? json : []
  const rows = Array.isArray(payload[1]) ? payload[1] : []
  const out = rows
    .filter(r => r && isNum(r.value))
    .map(r => ({
      year: Number(r.date),
      value: r.value,
      country: r.country?.value ?? null,
      indicator: r.indicator?.value ?? null,
    }))
    .sort((a, b) => a.year - b.year)

  return {
    observations: out.length,
    country: out[0]?.country ?? null,
    indicator: out[0]?.indicator ?? null,
    from: out[0]?.year ?? null,
    to: out[out.length - 1]?.year ?? null,
    years: out.map(r => r.year),
    values: out.map(r => r.value),
    rows: out,
  }
}

/**
 * Map a user-typed symbol to a Stooq ticker.
 * Stooq wants a market suffix; a bare US ticker needs `.us`, which is the single
 * most common reason a lookup silently returns nothing.
 */
export function toStooqSymbol(symbol) {
  const s = String(symbol || '').trim().toLowerCase()
  if (!s) return ''
  if (s.includes('.') || s.includes('^')) return s        // already qualified, or an index
  if (/^[a-z]{6}$/.test(s)) return s                       // FX pair like eurusd
  return `${s}.us`
}

/** Trim a series to the last N observations, keeping the newest. */
export function lastN(s, n) {
  const k = Math.max(1, Math.floor(Number(n) || 0))
  if (!s?.rows?.length || s.rows.length <= k) return s
  const rows = s.rows.slice(-k)
  return { ...s, observations: rows.length, from: rows[0].date, to: rows[rows.length - 1].date,
    dates: rows.map(r => r.date), prices: rows.map(r => r.close), rows }
}
