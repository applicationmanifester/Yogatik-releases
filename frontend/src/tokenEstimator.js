/**
 * Unified Token Estimator — Single Source of Truth
 *
 * Both compaction.js (budget engine) and ContextMeter.jsx (UI meter) were using
 * different ratios (~3.8 vs ~4 chars/token). This module centralizes the
 * estimation logic so the UI meter and the compaction budget always agree.
 *
 * ~3.8 chars/token is the empirically validated average for mixed English + code.
 * We expose the ratio as a constant so it can be tuned in one place if needed.
 */

// Empirically validated: mixed English + code averages ~3.8 chars per token
// (GPT tokenizers average 3.5–4.0; 3.8 is the sweet spot for budget accuracy)
export const CHARS_PER_TOKEN = 3.8

/**
 * Estimate tokens from a string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokensFromText(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate tokens from a message object (handles string content, array content, toolResults).
 * @param {object} msg
 * @returns {number}
 */
export function estimateTokensFromMessage(msg) {
  if (!msg) return 0
  let chars = 0
  
  if (msg.text && typeof msg.text === 'string') {
    chars += msg.text.length
  }
  
  if (msg.content) {
    if (typeof msg.content === 'string') {
      chars += msg.content.length
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          chars += part.text.length
        }
      }
    }
  }
  
  if (Array.isArray(msg.toolResults)) {
    try {
      chars += JSON.stringify(msg.toolResults).length
    } catch {}
  }
  
  // Add small overhead per message (role markers, formatting)
  return Math.ceil(chars / CHARS_PER_TOKEN) + 4
}

/**
 * Estimate tokens from a conversation history array.
 * @param {Array} messages
 * @returns {number}
 */
export function estimateTokensFromHistory(messages) {
  if (!Array.isArray(messages)) return 0
  let total = 0
  for (const msg of messages) {
    total += estimateTokensFromMessage(msg)
  }
  return total
}

/**
 * Estimate total tokens for a full conversation context (system + history + input).
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {Array} opts.messages
 * @param {string} opts.input
 * @returns {number}
 */
export function estimateConversationTokens({ systemPrompt = '', messages = [], input = '' }) {
  const systemTokens = estimateTokensFromText(systemPrompt)
  const historyTokens = estimateTokensFromHistory(messages)
  const inputTokens = estimateTokensFromText(input)
  return systemTokens + historyTokens + inputTokens
}

/**
 * Format token count for display (1.2k, 3.4M, etc.)
 * @param {number} num
 * @returns {string}
 */
export function formatTokenCount(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

/**
 * Calculate percentage used with clamping.
 * @param {number} used
 * @param {number} limit
 * @returns {number} 0-100
 */
export function calculateUsagePercent(used, limit) {
  if (!limit || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

/**
 * Get color for usage percentage.
 * @param {number} percent
 * @returns {string} CSS color
 */
export function getUsageColor(percent) {
  if (percent > 85) return '#f87171' // red
  if (percent >= 60) return '#fbbf24' // yellow (60% inclusive)
  return '#34d399' // green
}

// Re-export CHARS_PER_TOKEN as default for convenience
export default {
  CHARS_PER_TOKEN,
  estimateTokensFromText,
  estimateTokensFromMessage,
  estimateTokensFromHistory,
  estimateConversationTokens,
  formatTokenCount,
  calculateUsagePercent,
  getUsageColor,
}
