/**
 * market_data — keyless historical prices and economic indicators.
 *
 * Closes the loop with finance_analytics, which does the maths but deliberately
 * fetches nothing: this fetches, that analyses. Every source is keyless, in
 * keeping with the app's "works with no API key" stance.
 *
 * Network goes through tools/http.js — never a private relay list. That rule
 * exists because youtube.js once kept its own copy and missed the ordering,
 * cooldown and jina-is-markdown rules.
 */

import { proxyText, proxyJson } from './http'
import {
  parseStooqCsv, parseCoinbaseCandles, parseWorldBank, toStooqSymbol, lastN,
  isBotChallenge,
} from '../marketData'
import { analyzeSeries } from '../finance'

function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }

const GRANULARITY = { daily: 86400, hourly: 3600, minute: 60 }

export const marketDataTool = {
  schema: {
    description:
      'Fetch historical market prices or economic indicators without an API key. ' +
      'Sources: Stooq (stocks, indices, FX), Coinbase (crypto) and the World Bank (economic data). ' +
      'Returns a price series you can pass straight to finance_analytics for volatility, Sharpe, ' +
      'drawdown or portfolio work. Use this when you need real numbers rather than recalled ones.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: '"stock" (also indices/FX via Stooq), "crypto" (Coinbase) or "indicator" (World Bank).',
        },
        symbol: {
          type: 'string',
          description: 'Ticker: AAPL, MSFT, ^spx, eurusd for stock; BTC-USD, ETH-USD for crypto.',
        },
        indicator: {
          type: 'string',
          description: 'World Bank indicator code, e.g. NY.GDP.MKTP.KD.ZG (GDP growth), FP.CPI.TOTL.ZG (inflation), SL.UEM.TOTL.ZS (unemployment).',
        },
        country: { type: 'string', description: 'ISO country code for an indicator, e.g. IN, US, GB. Default US.' },
        limit: { type: 'number', description: 'Keep only the most recent N observations.' },
        granularity: { type: 'string', description: 'Crypto candle size: daily (default), hourly or minute.' },
        analyze: { type: 'boolean', description: 'Also return volatility, Sharpe, drawdown and VaR for the fetched series.' },
      },
      required: ['kind'],
    },
  },

  async execute(args = {}) {
    const kind = String(args.kind || '').toLowerCase().trim()

    try {
      if (kind === 'stock') {
        if (!args.symbol) return fail('Provide a symbol, e.g. AAPL or ^spx.')
        const sym = toStooqSymbol(args.symbol)
        const csv = await proxyText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`)
        // Distinguish "bad ticker" from "we were served a bot check" — they
        // need completely different actions from the user.
        if (isBotChallenge(csv)) {
          return fail('Stooq served a browser check instead of data, so no prices came back. ' +
            'This usually happens from a datacenter or VPN connection. Try again on a normal ' +
            'home connection, or use kind:"crypto" (Coinbase), which needs no such check.')
        }
        let s = parseStooqCsv(csv, args.symbol)
        if (!s.observations) {
          return fail(`No data for "${args.symbol}" (tried Stooq symbol "${sym}"). ` +
            'US tickers need no suffix here, but other markets do — try e.g. bmw.de, or ^spx for an index.')
        }
        if (args.limit) s = lastN(s, args.limit)
        return {
          success: true, tool: 'market_data', ...s,
          analysis: args.analyze && s.observations > 1 ? analyzeSeries(s.prices) : undefined,
        }
      }

      if (kind === 'crypto') {
        if (!args.symbol) return fail('Provide a pair, e.g. BTC-USD.')
        const pair = String(args.symbol).toUpperCase().replace('/', '-')
        const gran = GRANULARITY[String(args.granularity || 'daily').toLowerCase()] || GRANULARITY.daily
        const json = await proxyJson(
          `https://api.exchange.coinbase.com/products/${encodeURIComponent(pair)}/candles?granularity=${gran}`)
        let s = parseCoinbaseCandles(json, pair)
        if (!s.observations) return fail(`No candles for "${pair}". Coinbase pairs look like BTC-USD or ETH-EUR.`)
        if (args.limit) s = lastN(s, args.limit)
        return {
          success: true, tool: 'market_data', ...s,
          analysis: args.analyze && s.observations > 1 ? analyzeSeries(s.prices) : undefined,
        }
      }

      if (kind === 'indicator') {
        if (!args.indicator) return fail('Provide a World Bank indicator code, e.g. NY.GDP.MKTP.KD.ZG.')
        const country = String(args.country || 'US').toUpperCase()
        const json = await proxyJson(
          `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}` +
          `/indicator/${encodeURIComponent(args.indicator)}?format=json&per_page=200`)
        const r = parseWorldBank(json)
        if (!r.observations) {
          return fail(`No data for indicator "${args.indicator}" in "${country}". ` +
            'Check the indicator code and the ISO country code.')
        }
        return { success: true, tool: 'market_data', kind: 'indicator', ...r }
      }

      return fail(`Unknown kind "${args.kind}". Use "stock", "crypto" or "indicator".`)
    } catch (e) {
      return fail(e)
    }
  },
}
