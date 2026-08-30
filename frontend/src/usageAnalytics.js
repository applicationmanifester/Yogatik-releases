/**
 * Usage & Cost Analytics Engine.
 * Tracks prompt and completion tokens, estimated API cost, and request latency
 * across providers with local, privacy-safe storage in localStorage.
 */

const STORAGE_KEY = 'yogatik.usage_records'
const MAX_RECORDS = 500

/**
 * Standard public API pricing per 1M tokens (USD)
 * [input $/M, output $/M]
 */
export const PRICING_TABLE = {
  // OpenAI
  'gpt-4o': [2.50, 10.00],
  'gpt-4o-mini': [0.15, 0.60],
  'gpt-4-turbo': [10.00, 30.00],
  'o1': [15.00, 60.00],
  'o1-mini': [3.00, 12.00],
  'o3-mini': [1.10, 4.40],
  // Anthropic
  'claude-3-7-sonnet': [3.00, 15.00],
  'claude-3-5-sonnet': [3.00, 15.00],
  'claude-3-5-haiku': [0.80, 4.00],
  'claude-3-opus': [15.00, 75.00],
  // Google Gemini
  'gemini-2.0-flash': [0.10, 0.40],
  'gemini-1.5-pro': [1.25, 5.00],
  'gemini-1.5-flash': [0.075, 0.30],
  // DeepSeek
  'deepseek-chat': [0.14, 0.28],
  'deepseek-reasoner': [0.55, 2.19],
  'deepseek-r1': [0.55, 2.19],
  // Groq / Llama
  'llama-3.3-70b-versatile': [0.59, 0.79],
  'llama-3.1-8b-instant': [0.05, 0.08],
  'qwen-2.5-32b': [0.20, 0.20],
  // Free / Local
  'local': [0, 0],
  'ollama': [0, 0],
}

/**
 * Table keys sorted LONGEST FIRST.
 *
 * A substring match walked in object-literal order bills the wrong rate whenever
 * one model id is a prefix of another, and it is always the cheap model that
 * loses: 'gpt-4o-mini' contains 'gpt-4o', so it matched the $2.50/$10.00 row and
 * was reported at 16.7x its real $0.15/$0.60. 'o1-mini' contains 'o1' — 5x.
 * Longest-first makes the most specific id win, which is the only ordering that
 * cannot be broken by adding a row.
 */
const PRICING_KEYS = Object.keys(PRICING_TABLE).sort((a, b) => b.length - a.length)

/**
 * Resolve [inputRate, outputRate] per 1M tokens for a given model/provider
 */
export function getModelPricing(model = '', provider = '') {
  const m = String(model || '').toLowerCase()
  const p = String(provider || '').toLowerCase()

  if (p === 'local' || p === 'ollama') return [0, 0]

  for (const key of PRICING_KEYS) {
    if (m.includes(key)) return PRICING_TABLE[key]
  }

  // Fallback defaults based on provider tier
  if (p === 'groq' || p === 'cerebras') return [0.10, 0.20]
  if (p === 'gemini') return [0.10, 0.40]
  if (p === 'deepseek') return [0.20, 0.50]
  if (p === 'anthropic') return [3.00, 15.00]
  if (p === 'openai') return [2.50, 10.00]

  return [0.50, 1.50]
}

/**
 * Compute estimated USD cost for a turn
 */
export function calculateTurnCost(promptTokens = 0, completionTokens = 0, model = '', provider = '') {
  const [inputRate, outputRate] = getModelPricing(model, provider)
  const inputCost = (promptTokens / 1_000_000) * inputRate
  const outputCost = (completionTokens / 1_000_000) * outputRate
  return Number((inputCost + outputCost).toFixed(6))
}

function readRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)))
  } catch {}
}

/**
 * Record a completed turn's token usage and estimated cost
 */
export function recordTurnUsage({
  provider = '',
  model = '',
  promptTokens = 0,
  completionTokens = 0,
  latencyMs = 0,
  timestamp = Date.now(),
} = {}) {
  const totalTokens = promptTokens + completionTokens
  const estimatedCost = calculateTurnCost(promptTokens, completionTokens, model, provider)

  const record = {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
    latencyMs,
    timestamp,
  }

  const existing = readRecords()
  existing.push(record)
  writeRecords(existing)
  return record
}

/**
 * Get aggregate usage metrics
 */
export function getUsageSummary() {
  const records = readRecords()
  let totalTokens = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalCost = 0
  let totalRequests = records.length
  const byModel = {}
  const byProvider = {}

  for (const r of records) {
    totalTokens += r.totalTokens || 0
    totalPromptTokens += r.promptTokens || 0
    totalCompletionTokens += r.completionTokens || 0
    totalCost += r.estimatedCost || 0

    const m = r.model || 'Unknown'
    const p = r.provider || 'Unknown'

    if (!byModel[m]) byModel[m] = { requests: 0, tokens: 0, cost: 0 }
    byModel[m].requests += 1
    byModel[m].tokens += r.totalTokens || 0
    byModel[m].cost += r.estimatedCost || 0

    if (!byProvider[p]) byProvider[p] = { requests: 0, tokens: 0, cost: 0 }
    byProvider[p].requests += 1
    byProvider[p].tokens += r.totalTokens || 0
    byProvider[p].cost += r.estimatedCost || 0
  }

  return {
    totalRequests,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    totalCost: Number(totalCost.toFixed(4)),
    byModel,
    byProvider,
    recentRecords: records.slice(-20).reverse(),
  }
}

export function clearUsageRecords() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
