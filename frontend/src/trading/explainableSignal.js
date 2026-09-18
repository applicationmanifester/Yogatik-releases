/**
 * explainableSignal.js — Explainable AI Signal Breakdown & Natural Language Trade Rationale.
 *
 * Deconstructs algorithmic trading setups into transparent, interpretable factors:
 * 1. Momentum & Trend Vector (0–40 points)
 * 2. Microstructure & Volume Surge (0–35 points)
 * 3. Payoff Structure & Risk-to-Reward (0–25 points)
 *
 * Produces institutional setup grading (A+, A, B, C) and clear natural language trade justifications.
 */

import { calculateKellyFraction } from './riskEngine'

/**
 * Analyzes market telemetry and produces an explainable quantitative signal report.
 *
 * @param {Object} input
 * @param {string} input.symbol - Tradingsymbol (e.g. 'RELIANCE', 'INFY')
 * @param {number} input.currentPrice - Live execution price
 * @param {number} [input.rsi=55] - 14-period RSI
 * @param {number} [input.sma20=0] - 20-period Simple Moving Average
 * @param {number} [input.sma50=0] - 50-period Simple Moving Average
 * @param {number} [input.currentVolume=0] - Current volume
 * @param {number} [input.avgVolume=0] - 20-period average volume
 * @param {number} [input.stopLoss=0] - Proposed stop-loss price
 * @param {number} [input.targetPrice=0] - Proposed profit target price
 * @param {number} [input.portfolioEquity=100000] - Total equity for sizing
 * @returns {Object} Transparent signal breakdown with factor scoring and natural language rationale
 */
export function evaluateExplainableSignal({
  symbol,
  currentPrice,
  rsi = 55,
  sma20 = 0,
  sma50 = 0,
  currentVolume = 100000,
  avgVolume = 100000,
  stopLoss = 0,
  targetPrice = 0,
  portfolioEquity = 100000,
}) {
  const price = Number(currentPrice) || 0
  const rsiVal = Number(rsi) || 50
  const curVol = Number(currentVolume) || 0
  const avgVol = Number(avgVolume) || curVol || 1
  const volMultiplier = avgVol > 0 ? Number((curVol / avgVol).toFixed(2)) : 1.0

  // 1. Momentum Factor (Max 40 pts)
  let momentumScore = 0
  const momentumNotes = []

  // RSI subscore (max 18 pts)
  if (rsiVal >= 48 && rsiVal <= 64) {
    momentumScore += 18
    momentumNotes.push(`RSI (${rsiVal.toFixed(1)}) is in optimal bull-accumulation zone`)
  } else if ((rsiVal >= 40 && rsiVal < 48) || (rsiVal > 64 && rsiVal <= 72)) {
    momentumScore += 12
    momentumNotes.push(`RSI (${rsiVal.toFixed(1)}) indicates moderate momentum`)
  } else if (rsiVal < 35) {
    momentumScore += 8
    momentumNotes.push(`RSI (${rsiVal.toFixed(1)}) oversold pullback opportunity`)
  } else {
    momentumScore += 4
    momentumNotes.push(`RSI (${rsiVal.toFixed(1)}) is near overbought territory`)
  }

  // Moving average alignment (max 22 pts)
  const refSma20 = sma20 > 0 ? sma20 : price * 0.99
  const refSma50 = sma50 > 0 ? sma50 : price * 0.97

  if (price > refSma20 && refSma20 > refSma50) {
    momentumScore += 22
    momentumNotes.push('Golden trend alignment: Price > SMA20 > SMA50')
  } else if (price > refSma20) {
    momentumScore += 14
    momentumNotes.push('Price holding above short-term 20-period moving average')
  } else {
    momentumScore += 6
    momentumNotes.push('Price consolidating near moving average support')
  }

  // 2. Volume & Microstructure Surge Factor (Max 35 pts)
  let volumeScore = 0
  const volumeNotes = []

  if (volMultiplier >= 2.2) {
    volumeScore += 35
    volumeNotes.push(`Exceptional institutional volume surge (${volMultiplier}x vs 20-MA)`)
  } else if (volMultiplier >= 1.5) {
    volumeScore += 28
    volumeNotes.push(`Strong relative volume expansion (${volMultiplier}x vs 20-MA)`)
  } else if (volMultiplier >= 1.1) {
    volumeScore += 20
    volumeNotes.push(`Healthy participation volume (${volMultiplier}x vs 20-MA)`)
  } else if (volMultiplier >= 0.8) {
    volumeScore += 12
    volumeNotes.push(`Average daily participation (${volMultiplier}x)`)
  } else {
    volumeScore += 6
    volumeNotes.push(`Low liquidity session (${volMultiplier}x vs 20-MA)`)
  }

  // 3. Payoff Structure & Risk/Reward Factor (Max 25 pts)
  let payoffScore = 0
  const payoffNotes = []

  const sl = stopLoss > 0 ? stopLoss : price * 0.985
  const tp = targetPrice > 0 ? targetPrice : price * 1.035
  const risk = Math.max(0.01, price - sl)
  const reward = Math.max(0.01, tp - price)
  const riskRewardRatio = Number((reward / risk).toFixed(2))

  if (riskRewardRatio >= 2.5) {
    payoffScore += 25
    payoffNotes.push(`Asymmetric positive payoff: 1:${riskRewardRatio} Risk/Reward`)
  } else if (riskRewardRatio >= 2.0) {
    payoffScore += 21
    payoffNotes.push(`Solid institutional risk/reward: 1:${riskRewardRatio}`)
  } else if (riskRewardRatio >= 1.8) {
    payoffScore += 16
    payoffNotes.push(`Favorable payoff ratio: 1:${riskRewardRatio}`)
  } else if (riskRewardRatio >= 1.5) {
    payoffScore += 10
    payoffNotes.push(`Acceptable payoff: 1:${riskRewardRatio}`)
  } else {
    payoffScore += 4
    payoffNotes.push(`Sub-optimal payoff ratio: 1:${riskRewardRatio} (below 1:1.5 threshold)`)
  }

  // Total Setup Score (0-100)
  const totalScore = momentumScore + volumeScore + payoffScore

  let grade = 'C'
  let recommendation = 'AVOID'

  if (totalScore >= 85) {
    grade = 'A+'
    recommendation = 'STRONG_BUY'
  } else if (totalScore >= 75) {
    grade = 'A'
    recommendation = 'BUY'
  } else if (totalScore >= 65) {
    grade = 'B'
    recommendation = 'WATCH'
  } else {
    grade = 'C'
    recommendation = 'AVOID'
  }

  // Half-Kelly Position Sizing recommendation
  // Estimate expected win probability based on composite score (e.g. 85 score -> ~62% win prob)
  const estimatedWinProb = Math.min(0.75, Math.max(0.42, 0.40 + (totalScore / 100) * 0.28))
  const kelly = calculateKellyFraction({
    winRate: estimatedWinProb,
    avgWin: reward,
    avgLoss: risk,
    fractionMultiplier: 0.5, // Half-Kelly
    maxCapitalPercent: 0.05,
  })
  const recommendedQty = kelly.calculateQuantity(portfolioEquity, price, sl)

  // Assemble natural language rationale
  const rationale = [
    `Setup Grade [${grade} - Score ${totalScore}/100]: ${symbol || 'Instrument'} trading at ₹${price.toFixed(2)}.`,
    `Momentum (${momentumScore}/40): ${momentumNotes.join('; ')}.`,
    `Microstructure (${volumeScore}/35): ${volumeNotes.join('; ')}.`,
    `Payoff (${payoffScore}/25): ${payoffNotes.join('; ')} (Target: ₹${tp.toFixed(2)}, Stop: ₹${sl.toFixed(2)}).`,
    `Execution Guidance: Half-Kelly recommends ${recommendedQty} shares (Risk budget: ${kelly.recommendedRiskPercent}% = ₹${((portfolioEquity * kelly.appliedFraction) || 0).toFixed(0)}).`,
  ].join(' ')

  return {
    symbol,
    currentPrice: price,
    totalScore,
    grade,
    recommendation,
    factors: {
      momentum: {
        score: momentumScore,
        maxScore: 40,
        notes: momentumNotes,
      },
      volume: {
        score: volumeScore,
        maxScore: 35,
        multiplier: volMultiplier,
        notes: volumeNotes,
      },
      payoff: {
        score: payoffScore,
        maxScore: 25,
        riskRewardRatio,
        stopLoss: sl,
        targetPrice: tp,
        notes: payoffNotes,
      },
    },
    kellySizing: {
      appliedFraction: kelly.appliedFraction,
      recommendedRiskPercent: kelly.recommendedRiskPercent,
      recommendedQuantity: recommendedQty,
      hasEdge: kelly.hasEdge,
    },
    rationale,
  }
}
