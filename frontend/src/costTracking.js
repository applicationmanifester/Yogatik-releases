/**
 * Cost Tracking — calculates per-conversation and per-model costs from token usage.
 * Uses pricing data from llm.js PROVIDERS config.
 */

import { PROVIDERS, getProviderCapabilities } from './llm.js'

/**
 * Get pricing for a specific model from a provider
 */
export function getModelPricing(providerId, modelId) {
  const provider = PROVIDERS[providerId]
  if (!provider?.pricing) return null
  
  // Handle per-model pricing objects
  if (provider.pricing[modelId]) {
    return provider.pricing[modelId]
  }
  
  // Handle flat pricing (free providers)
  if (typeof provider.pricing.input === 'number') {
    return provider.pricing
  }
  
  // Fallback to default
  return provider.pricing.default || null
}

/**
 * Calculate cost for a conversation turn
 */
export function calculateTurnCost(providerId, modelId, inputTokens, outputTokens) {
  const pricing = getModelPricing(providerId, modelId)
  if (!pricing) return { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD', estimated: false }
  
  const inputCost = (inputTokens / 1_000_000) * (pricing.input || 0)
  const outputCost = (outputTokens / 1_000_000) * (pricing.output || 0)
  
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: pricing.currency || 'USD',
    estimated: true,
    modelPricing: { input: pricing.input, output: pricing.output },
  }
}

/**
 * Calculate total cost for a conversation
 */
export function calculateConversationCost(messages) {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCost = 0
  const currency = 'USD'
  const byModel = {}
  
  for (const msg of messages || []) {
    if (msg.role !== 'assistant') continue
    if (!msg.provider || !msg.model) continue
    
    const providerId = typeof msg.provider === 'string' ? msg.provider : msg.provider?.id || ''
    const modelId = typeof msg.model === 'string' ? msg.model : msg.model?.id || msg.model?.name || ''
    
    if (!providerId || !modelId) continue
    
    const inputTokens = msg.inputTokens || msg.promptTokens || 0
    const outputTokens = msg.outputTokens || msg.completionTokens || msg.tokens || 0
    
    if (!inputTokens && !outputTokens) continue
    
    const cost = calculateTurnCost(providerId, modelId, inputTokens, outputTokens)
    
    totalInputTokens += inputTokens
    totalOutputTokens += outputTokens
    totalCost += cost.totalCost
    
    const key = `${providerId}/${modelId}`
    if (!byModel[key]) {
      byModel[key] = { providerId, modelId, inputTokens: 0, outputTokens: 0, cost: 0, turns: 0 }
    }
    byModel[key].inputTokens += inputTokens
    byModel[key].outputTokens += outputTokens
    byModel[key].cost += cost.totalCost
    byModel[key].turns += 1
  }
  
  return {
    totalCost,
    currency,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    byModel: Object.values(byModel).sort((a, b) => b.cost - a.cost),
  }
}

/**
 * Format cost for display
 */
export function formatCost(cost, currency = 'USD') {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `<$0.01`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cost)
}

/**
 * Format tokens for display
 */
export function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toLocaleString()
}

/**
 * Hook for React components to get conversation cost
 */
export function useConversationCost(messages) {
  return calculateConversationCost(messages)
}

/**
 * Estimate cost before sending (for UI preview)
 */
export function estimateCost(providerId, modelId, estimatedInputTokens, estimatedOutputTokens) {
  return calculateTurnCost(providerId, modelId, estimatedInputTokens || 1000, estimatedOutputTokens || 500)
}

/**
 * Get all provider pricing for comparison table
 */
export function getAllPricing() {
  const result = {}
  for (const [providerId, provider] of Object.entries(PROVIDERS)) {
    if (!provider.pricing) continue
    if (provider.pricing.free) {
      result[providerId] = { free: true, ...provider.pricing }
    } else if (typeof provider.pricing.input === 'number') {
      result[providerId] = { free: false, flat: true, ...provider.pricing }
    } else {
      result[providerId] = { free: false, perModel: true, models: provider.pricing }
    }
  }
  return result
}