import { describe, it, expect } from 'vitest'
import {
  parseStooqCsv, parseCoinbaseCandles, parseWorldBank, toStooqSymbol, lastN,
} from './marketData'

describe('parseStooqCsv', () => {
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2026-01-02,100.0,102.0,99.5,101.5,1200',
    '2026-01-03,101.5,103.0,101.0,102.75,1500',
    '2026-01-04,102.75,103.5,100.0,100.25,900',
  ].join('\n')

  it('parses rows into a common series', () => {
    const s = parseStooqCsv(csv, 'AAPL')
    expect(s.observations).toBe(3)
    expect(s.prices).toEqual([101.5, 102.75, 100.25])
    expect(s.from).toBe('2026-01-02')
    expect(s.to).toBe('2026-01-04')
    expect(s.source).toBe('stooq')
  })

  it('keeps OHLC on each row', () => {
    const r = parseStooqCsv(csv, 'X').rows[0]
    expect(r.open).toBe(100)
    expect(r.high).toBe(102)
    expect(r.low).toBe(99.5)
    expect(r.volume).toBe(1200)
  })

  // Stooq answers 200 with "No data" for an unknown ticker — treating that as a
  // valid empty series would hide the real problem.
  it('returns an empty series for the "No data" body', () => {
    expect(parseStooqCsv('No data', 'ZZZZ').observations).toBe(0)
  })

  it('returns empty for junk or a missing header', () => {
    expect(parseStooqCsv('', 'X').observations).toBe(0)
    expect(parseStooqCsv('total nonsense', 'X').observations).toBe(0)
    expect(parseStooqCsv('A,B,C\n1,2,3', 'X').observations).toBe(0)
  })

  it('skips rows whose close is not a number', () => {
    const bad = 'Date,Open,High,Low,Close,Volume\n2026-01-02,1,2,3,N/A,10\n2026-01-03,1,2,3,4,10'
    expect(parseStooqCsv(bad, 'X').observations).toBe(1)
  })

  it('sorts oldest first even when the source is reversed', () => {
    const rev = 'Date,Open,High,Low,Close,Volume\n2026-01-04,1,2,3,100.25,1\n2026-01-02,1,2,3,101.5,1'
    expect(parseStooqCsv(rev, 'X').dates).toEqual(['2026-01-02', '2026-01-04'])
  })
})

describe('parseCoinbaseCandles', () => {
  // [time, low, high, open, close, volume] — deliberately NOT intuitive OHLC.
  const candles = [
    [1767225600, 90, 110, 95, 105, 12],
    [1767139200, 88, 101, 90, 99, 8],
  ]

  it('reads the tuple in Coinbase order, not OHLC order', () => {
    const s = parseCoinbaseCandles(candles, 'BTC-USD')
    const newest = s.rows[s.rows.length - 1]
    expect(newest.open).toBe(95)
    expect(newest.close).toBe(105)
    expect(newest.low).toBe(90)
    expect(newest.high).toBe(110)
  })

  it('sorts oldest first (Coinbase returns newest first)', () => {
    const s = parseCoinbaseCandles(candles, 'BTC-USD')
    expect(s.prices).toEqual([99, 105])
  })

  it('converts epoch seconds to an ISO date', () => {
    expect(parseCoinbaseCandles(candles, 'X').rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is empty for junk', () => {
    expect(parseCoinbaseCandles(null, 'X').observations).toBe(0)
    expect(parseCoinbaseCandles([[1, 2]], 'X').observations).toBe(0)
    expect(parseCoinbaseCandles({ error: 'nope' }, 'X').observations).toBe(0)
  })
})

describe('parseWorldBank', () => {
  const payload = [
    { page: 1, total: 3 },
    [
      { date: '2024', value: 3.4, country: { value: 'India' }, indicator: { value: 'GDP growth' } },
      { date: '2023', value: null, country: { value: 'India' }, indicator: { value: 'GDP growth' } },
      { date: '2022', value: 7.0, country: { value: 'India' }, indicator: { value: 'GDP growth' } },
    ],
  ]

  it('extracts the data half of the [paging, data] envelope', () => {
    const r = parseWorldBank(payload)
    expect(r.observations).toBe(2)
    expect(r.country).toBe('India')
    expect(r.indicator).toBe('GDP growth')
  })

  // A null year means "no observation", not zero — averaging zeros in would be
  // quietly wrong.
  it('drops null values rather than reading them as zero', () => {
    expect(parseWorldBank(payload).values).toEqual([7.0, 3.4])
  })

  it('sorts by year ascending', () => {
    expect(parseWorldBank(payload).years).toEqual([2022, 2024])
  })

  it('is empty for junk', () => {
    expect(parseWorldBank(null).observations).toBe(0)
    expect(parseWorldBank([{ message: 'error' }]).observations).toBe(0)
  })
})

describe('toStooqSymbol', () => {
  // The single most common reason a Stooq lookup silently returns nothing.
  it('adds the .us suffix to a bare US ticker', () => {
    expect(toStooqSymbol('AAPL')).toBe('aapl.us')
  })

  it('leaves an already-qualified symbol alone', () => {
    expect(toStooqSymbol('bmw.de')).toBe('bmw.de')
  })

  it('leaves an index alone', () => {
    expect(toStooqSymbol('^spx')).toBe('^spx')
  })

  it('treats a six-letter code as an FX pair', () => {
    expect(toStooqSymbol('EURUSD')).toBe('eurusd')
  })

  it('is empty for empty input', () => {
    expect(toStooqSymbol('')).toBe('')
    expect(toStooqSymbol(null)).toBe('')
  })
})

describe('lastN', () => {
  const s = parseStooqCsv([
    'Date,Open,High,Low,Close,Volume',
    '2026-01-02,1,1,1,10,1',
    '2026-01-03,1,1,1,20,1',
    '2026-01-04,1,1,1,30,1',
  ].join('\n'), 'X')

  it('keeps the newest N observations', () => {
    const t = lastN(s, 2)
    expect(t.prices).toEqual([20, 30])
    expect(t.from).toBe('2026-01-03')
  })

  it('returns the series unchanged when N exceeds its length', () => {
    expect(lastN(s, 99).observations).toBe(3)
  })

  it('is safe for an empty series', () => {
    expect(lastN(parseStooqCsv('', 'X'), 5).observations).toBe(0)
  })
})

import { isBotChallenge } from './marketData'

describe('isBotChallenge', () => {
  // Measured 2026-08-17: Stooq answers 200 with a JS browser check from a
  // datacenter IP. Parsing that gives an empty series, and reporting it as
  // "unknown ticker" sends the user chasing the wrong problem.
  it('detects the JavaScript browser check served instead of CSV', () => {
    const html = '<!DOCTYPE html><html><head></head><body><noscript>This site requires ' +
      'JavaScript to verify your browser. Please enable JavaScript</noscript></body></html>'
    expect(isBotChallenge(html)).toBe(true)
  })

  it('detects a bare HTML body', () => {
    expect(isBotChallenge('<html><body>nope</body></html>')).toBe(true)
  })

  it('does NOT flag real CSV', () => {
    expect(isBotChallenge('Date,Open,High,Low,Close,Volume\n2026-01-02,1,2,3,4,5')).toBe(false)
  })

  it('does NOT flag real JSON', () => {
    expect(isBotChallenge('[[1767225600,90,110,95,105,12]]')).toBe(false)
  })

  it('is false for empty input', () => {
    expect(isBotChallenge('')).toBe(false)
    expect(isBotChallenge(null)).toBe(false)
  })
})

import { parseYahooChart, YAHOO_RANGES } from './marketData'

describe('parseYahooChart', () => {
  // Real shape, taken from a live AAPL response.
  const payload = {
    chart: { result: [{
      meta: { symbol: 'AAPL', currency: 'USD', fullExchangeName: 'NasdaqGS' },
      timestamp: [1767225600, 1767312000, 1767398400],
      indicators: { quote: [{
        open: [300, 305, 303], high: [310, 308, 306], low: [298, 300, 299],
        close: [308.26, 304.91, 302.25], volume: [1000, 1100, 900],
      }] },
    }] },
  }

  it('parses into the common series shape', () => {
    const s = parseYahooChart(payload, 'AAPL')
    expect(s.source).toBe('yahoo')
    expect(s.observations).toBe(3)
    expect(s.prices).toEqual([308.26, 304.91, 302.25])
  })

  it('keeps OHLCV and carries currency/exchange metadata', () => {
    const s = parseYahooChart(payload, 'AAPL')
    expect(s.rows[0].open).toBe(300)
    expect(s.rows[0].volume).toBe(1000)
    expect(s.currency).toBe('USD')
    expect(s.exchange).toBe('NasdaqGS')
  })

  // Yahoo emits null for holidays and halts. Carrying the previous price
  // forward would invent flat days and understate volatility.
  it('drops null closes rather than carrying a price forward', () => {
    const gappy = JSON.parse(JSON.stringify(payload))
    gappy.chart.result[0].indicators.quote[0].close[1] = null
    const s = parseYahooChart(gappy, 'AAPL')
    expect(s.observations).toBe(2)
    expect(s.prices).toEqual([308.26, 302.25])
  })

  it('is empty for an error payload or junk', () => {
    expect(parseYahooChart({ chart: { result: null, error: 'Not Found' } }, 'X').observations).toBe(0)
    expect(parseYahooChart(null, 'X').observations).toBe(0)
    expect(parseYahooChart({}, 'X').observations).toBe(0)
  })

  it('falls back to the symbol in meta when none is passed', () => {
    expect(parseYahooChart(payload).symbol).toBe('AAPL')
  })

  it('offers the ranges Yahoo actually accepts', () => {
    for (const r of ['1d', '1mo', '1y', 'max']) expect(YAHOO_RANGES).toContain(r)
  })
})
