/**
 * finance_analytics — valuation and risk maths, computed on-device.
 *
 * Pure arithmetic, so it works offline, with no key and no provider round-trip.
 * The model supplies the numbers; this does the sums exactly rather than the
 * model guessing them, which is where LLMs are least reliable.
 */

import {
  npv, irr, dcf, cagr, analyzeSeries, valueAtRisk, conditionalVaR,
  sharpe, sortino, volatility, maxDrawdown, returnsFromPrices,
} from '../finance'
import { blackScholes, greeks, impliedVolatility, binomial } from '../options'
import {
  covarianceMatrix, correlationMatrix, minVarianceWeights, tangencyWeights,
  riskParityWeights, riskContributions, efficientFrontier, beta,
  portfolioReturn, portfolioVolatility,
} from '../portfolio'

function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }
const pct = (x) => (x == null ? null : `${(x * 100).toFixed(2)}%`)

export const financeTool = {
  schema: {
    description:
      'Run financial valuation and risk maths exactly, on-device: DCF valuation, NPV, IRR, CAGR, ' +
      'and risk statistics for a price series (volatility, Sharpe, Sortino, max drawdown, ' +
      'Value at Risk, expected shortfall). Use this instead of doing the arithmetic yourself — ' +
      'it is exact, works offline and needs no API key. Provide the numbers you already have; ' +
      'this tool does not fetch market data.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'One of: dcf | npv | irr | cagr | analyze | var | option | implied_vol | portfolio | beta',
        },
        cashflows: {
          type: 'array',
          items: { type: 'number' },
          description: 'Cash flows. For npv/irr the first entry is t=0 (usually negative). For dcf these are the projected future flows.',
        },
        prices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Price series, oldest first — for operation "analyze" or "var".',
        },
        discount_rate: { type: 'number', description: 'Annual discount rate as a decimal, e.g. 0.1 for 10%.' },
        terminal_growth: { type: 'number', description: 'Perpetual growth rate for the DCF terminal value (must be below discount_rate).' },
        net_debt: { type: 'number', description: 'Net debt subtracted from enterprise value to reach equity value.' },
        shares_outstanding: { type: 'number', description: 'Share count, to produce a per-share value.' },
        begin: { type: 'number', description: 'Starting value for cagr.' },
        end: { type: 'number', description: 'Ending value for cagr.' },
        years: { type: 'number', description: 'Number of years for cagr.' },
        periods_per_year: { type: 'number', description: 'Observations per year for annualising: 252 daily (default), 52 weekly, 12 monthly.' },
        risk_free_rate: { type: 'number', description: 'Annual risk-free rate as a decimal (default 0).' },
        confidence: { type: 'number', description: 'VaR confidence between 0 and 1 (default 0.95).' },
        spot: { type: 'number', description: 'Underlying price — for option/implied_vol.' },
        strike: { type: 'number', description: 'Strike price — for option/implied_vol.' },
        time_years: { type: 'number', description: 'Time to expiry in years, e.g. 0.5 for six months.' },
        volatility: { type: 'number', description: 'Annual volatility as a decimal, e.g. 0.2 for 20%.' },
        dividend_yield: { type: 'number', description: 'Continuous dividend yield as a decimal (default 0).' },
        option_type: { type: 'string', description: '"call" or "put" (default call).' },
        american: { type: 'boolean', description: 'Price American (early-exercise) style using a binomial tree.' },
        market_price: { type: 'number', description: 'Observed option price — for implied_vol.' },
        returns_by_asset: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' } },
          description: 'For "portfolio": one return series per asset, all the same length.',
        },
        expected_returns: {
          type: 'array', items: { type: 'number' },
          description: 'For "portfolio": expected annual return per asset, used for the max-Sharpe portfolio.',
        },
        long_only: { type: 'boolean', description: 'For "portfolio": forbid short positions.' },
        benchmark: { type: 'array', items: { type: 'number' }, description: 'Benchmark returns — for "beta".' },
      },
      required: ['operation'],
    },
  },

  async execute(args = {}) {
    const op = String(args.operation || '').toLowerCase().trim()
    const ppy = args.periods_per_year ?? 252
    const rf = args.risk_free_rate ?? 0
    const conf = args.confidence ?? 0.95

    try {
      switch (op) {
        case 'dcf': {
          const r = dcf({
            cashflows: args.cashflows,
            discountRate: args.discount_rate,
            terminalGrowth: args.terminal_growth ?? 0,
            netDebt: args.net_debt ?? 0,
            sharesOutstanding: args.shares_outstanding ?? 0,
          })
          return {
            success: true, tool: 'finance_analytics', operation: 'dcf', ...r,
            terminal_share: pct(r.terminalSharePct),
            note: r.terminalSharePct > 0.75
              ? 'Over three quarters of this valuation comes from the terminal value, so it is highly sensitive to the growth and discount assumptions.'
              : undefined,
          }
        }
        case 'npv':
          return {
            success: true, tool: 'finance_analytics', operation: 'npv',
            npv: npv(args.discount_rate, args.cashflows),
          }
        case 'irr': {
          const r = irr(args.cashflows)
          return r == null
            ? { success: false, error: 'No IRR exists for these cash flows in the searched range.' }
            : { success: true, tool: 'finance_analytics', operation: 'irr', irr: r, irr_pct: pct(r) }
        }
        case 'cagr': {
          const r = cagr(args.begin, args.end, args.years)
          return { success: true, tool: 'finance_analytics', operation: 'cagr', cagr: r, cagr_pct: pct(r) }
        }
        case 'analyze': {
          const a = analyzeSeries(args.prices, { periodsPerYear: ppy, riskFreeRate: rf, confidence: conf })
          return {
            success: true, tool: 'finance_analytics', operation: 'analyze', ...a,
            formatted: {
              total_return: pct(a.totalReturn),
              annualized_return: pct(a.annualizedReturn),
              volatility: pct(a.volatility),
              max_drawdown: pct(a.maxDrawdown),
              value_at_risk: pct(a.valueAtRisk),
              expected_shortfall: pct(a.conditionalVaR),
              sharpe: a.sharpe == null ? null : a.sharpe.toFixed(2),
              sortino: a.sortino == null ? null : a.sortino.toFixed(2),
            },
          }
        }
        case 'var': {
          const rets = args.prices?.length ? returnsFromPrices(args.prices) : args.cashflows
          const v = valueAtRisk(rets, { confidence: conf })
          if (v == null) return fail('Provide prices or returns.')
          return {
            success: true, tool: 'finance_analytics', operation: 'var',
            confidence: conf,
            value_at_risk: v, value_at_risk_pct: pct(v),
            expected_shortfall: conditionalVaR(rets, { confidence: conf }),
            volatility: volatility(rets, ppy),
            sharpe: sharpe(rets, { riskFreeRate: rf, periodsPerYear: ppy }),
            sortino: sortino(rets, { riskFreeRate: rf, periodsPerYear: ppy }),
            max_drawdown: args.prices?.length ? maxDrawdown(args.prices).maxDrawdown : null,
          }
        }
        case 'option': {
          const o = {
            spot: args.spot, strike: args.strike, timeYears: args.time_years,
            volatility: args.volatility, rate: args.discount_rate ?? args.risk_free_rate ?? 0,
            dividendYield: args.dividend_yield ?? 0, type: args.option_type || 'call',
          }
          const european = blackScholes(o)
          const g = greeks(o)
          const american = args.american ? binomial(o, { steps: 300, american: true }) : null
          return {
            success: true, tool: 'finance_analytics', operation: 'option',
            price: american ?? european,
            europeanPrice: european,
            americanPrice: american,
            earlyExercisePremium: american == null ? null : american - european,
            greeks: {
              delta: g.delta, gamma: g.gamma,
              vega_per_1pct: g.vegaPer1Pct, theta_per_day: g.thetaPerDay, rho_per_1pct: g.rhoPer1Pct,
            },
          }
        }
        case 'implied_vol': {
          const iv = impliedVolatility({
            spot: args.spot, strike: args.strike, timeYears: args.time_years,
            rate: args.risk_free_rate ?? 0, dividendYield: args.dividend_yield ?? 0,
            type: args.option_type || 'call', marketPrice: args.market_price,
          })
          return iv == null
            ? fail('No volatility reproduces that price — the quote may violate arbitrage bounds or be stale.')
            : { success: true, tool: 'finance_analytics', operation: 'implied_vol', impliedVolatility: iv, implied_vol_pct: pct(iv) }
        }
        case 'portfolio': {
          const series = args.returns_by_asset
          const cov = covarianceMatrix(series)
          const longOnly = !!args.long_only
          const minVar = minVarianceWeights(cov, { longOnly })
          const parity = riskParityWeights(cov)
          const out = {
            success: true, tool: 'finance_analytics', operation: 'portfolio',
            assets: series.length,
            correlation: correlationMatrix(series),
            minVariance: {
              weights: minVar,
              volatility: portfolioVolatility(minVar, cov),
              riskContributions: riskContributions(minVar, cov),
            },
            riskParity: {
              weights: parity,
              volatility: portfolioVolatility(parity, cov),
              riskContributions: riskContributions(parity, cov),
            },
          }
          if (Array.isArray(args.expected_returns) && args.expected_returns.length === series.length) {
            const tan = tangencyWeights(cov, args.expected_returns, { riskFreeRate: rf, longOnly })
            out.maxSharpe = {
              weights: tan,
              expectedReturn: portfolioReturn(tan, args.expected_returns),
              volatility: portfolioVolatility(tan, cov),
            }
            out.efficientFrontier = efficientFrontier(cov, args.expected_returns, { points: 8, riskFreeRate: rf })
          }
          return out
        }
        case 'beta':
          return {
            success: true, tool: 'finance_analytics', operation: 'beta',
            beta: beta(args.prices?.length ? returnsFromPrices(args.prices) : args.cashflows, args.benchmark),
          }
        default:
          return fail(`Unknown operation "${args.operation}". Use dcf, npv, irr, cagr, analyze, var, option, implied_vol, portfolio or beta.`)
      }
    } catch (e) {
      return fail(e)
    }
  },
}
