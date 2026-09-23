/**
 * Context compaction.
 *
 * windowHistory() kept a character budget and TRUNCATED the oldest turn with an
 * ellipsis — information was silently destroyed, so a long session quietly
 * forgot its own beginning. This summarizes the turns that fall out instead, so
 * the decisions and facts from early on survive as a compact note.
 *
 * Pure orchestration: the summarizer is injected, which keeps it testable and
 * provider-agnostic (it runs on whatever model the chat already uses).
 */

function textOf(msg) {
  const c = msg?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.filter(p => p?.type === 'text').map(p => p.text || '').join(' ')
  return ''
}

/**
 * Estimate token count from history text or message array (~3.8 chars per token).
 */
export function estimateTokens(textOrTurns) {
  if (typeof textOrTurns === 'string') {
    return Math.ceil(textOrTurns.length / 3.8)
  }
  if (Array.isArray(textOrTurns)) {
    let total = 0
    for (const turn of textOrTurns) {
      total += Math.ceil(textOf(turn).length / 3.8) + 4
    }
    return total
  }
  return 0
}

/**
 * Model-aware context limits.
 * Translates provider and model families into dynamic history character budgets and turn counts.
 */
export function getModelContextLimits(provider = '', model = '') {
  const p = String(provider || '').toLowerCase()
  const m = String(model || '').toLowerCase()

  if (p === 'local') {
    return { budget: 4000, maxTurns: 6, estimatedMaxTokens: 4096 }
  }
  if (p === 'gemini' || m.includes('gemini')) {
    return { budget: 120000, maxTurns: 40, estimatedMaxTokens: 1000000 }
  }
  if (p === 'anthropic' || m.includes('claude')) {
    return { budget: 80000, maxTurns: 35, estimatedMaxTokens: 200000 }
  }
  if (p === 'openai' || m.includes('gpt-4') || m.includes('o1') || m.includes('o3')) {
    return { budget: 60000, maxTurns: 30, estimatedMaxTokens: 128000 }
  }
  if (p === 'deepseek' || m.includes('deepseek') || m.includes('qwen-2.5-72b')) {
    return { budget: 48000, maxTurns: 25, estimatedMaxTokens: 64000 }
  }
  if (p === 'groq' || p === 'cerebras' || p === 'together') {
    return { budget: 32000, maxTurns: 20, estimatedMaxTokens: 32000 }
  }
  // Default cloud fallback
  return { budget: 24000, maxTurns: 20, estimatedMaxTokens: 16000 }
}

/**
 * Analyze conversation complexity to dynamically adjust context window
 */
function analyzeComplexity(history) {
  const text = history.map(h => {
    const c = h?.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) return c.filter(p => p?.type === 'text').map(p => p.text || '').join(' ')
    return ''
  }).join(' ')
  
  const indicators = [
    /\b(architecture|algorithm|optimize|refactor|debug|integrate)\b/gi,
    /\b(compare|analyze|evaluate|synthesize|trade.?off)\b/gi,
    /```[\s\S]*?```/g, // code blocks
  ]
  let score = 0
  for (const ind of indicators) score += (text.match(ind) || []).length
  return Math.min(1, score / 20)
}

/**
 * Count tool calls in conversation history
 */
function countToolCalls(history) {
  let count = 0
  for (const turn of history) {
    if (turn.role === 'tool' || (turn.role === 'assistant' && turn.tool_calls)) count++
  }
  return count
}

/**
 * Calculate average response token length
 */
function avgTokenLength(history) {
  const responses = history.filter(h => h.role === 'assistant')
  if (!responses.length) return 0
  let total = 0
  for (const r of responses) {
    const c = r.content
    total += typeof c === 'string' ? c.length : Array.isArray(c) ? c.filter(p => p.type === 'text').join('').length : 0
  }
  return total / responses.length / 3.8 // chars to tokens
}

/**
 * Get dynamic context limits based on conversation complexity
 */
export function getDynamicContextLimits(provider, model, conversationHistory = []) {
  const base = getModelContextLimits(provider, model)
  
  // Analyze conversation complexity
  const complexity = analyzeComplexity(conversationHistory)
  const toolUsage = countToolCalls(conversationHistory)
  const avgResponseLength = avgTokenLength(conversationHistory)
  
  // Adjust budget dynamically
  let budget = base.budget
  if (complexity > 0.7) budget *= 1.5      // Complex = more context
  if (toolUsage > 10) budget *= 1.3        // Tool-heavy = more context
  if (avgResponseLength > 2000) budget *= 1.2 // Verbose = more context
  
  // Cap at model maximum
  budget = Math.min(budget, base.estimatedMaxTokens * 0.8)
  
  return { ...base, budget: Math.floor(budget), dynamic: true, complexity, toolUsage, avgResponseLength }
}

/**
 * Decide which turns to summarize and which to keep verbatim. The newest turns
 * are always kept — at least one, whatever the budget.
 */
export function splitForCompaction(history, budget, maxTurns) {
  const h = Array.isArray(history) ? history : []
  if (!h.length) return { toSummarize: [], keep: [] }

  const keep = []
  let used = 0
  for (let i = h.length - 1; i >= 0; i--) {
    const len = textOf(h[i]).length
    const overTurns = keep.length >= maxTurns
    const overBudget = used + len > budget
    if ((overTurns || overBudget) && keep.length >= 1) break
    keep.unshift(h[i])
    used += len
  }
  return { toSummarize: h.slice(0, h.length - keep.length), keep }
}

export function buildCompactionPrompt(turnsToSummarize) {
  const transcript = (turnsToSummarize || [])
    .map(m => `${m.role}: ${textOf(m)}`)
    .filter(l => l.trim().length > 6)
    .join('\n')

  return 'Summarize the earlier part of this conversation so it can be dropped from context ' +
    'without losing anything important. Keep: decisions made, facts and values established, ' +
    'file or code names touched, constraints the user stated, and anything still unresolved. ' +
    'Drop pleasantries and restated context. Write compact prose or bullets, no preamble.\n\n' +
    '--- transcript ---\n' + transcript
}

export function formatSummaryTurn(summary) {
  return {
    role: 'user',
    content: '[Summary of earlier conversation, compacted to save context]\n' + summary,
  }
}

/**
 * @param summarize  async (prompt) => string. Injected so this is testable and
 *                   runs on whatever provider the chat is already using.
 */
/**
 * Send only {role, content} to the provider, never whatever extra fields a
 * stored message happens to carry. Multimodal array content is passed THROUGH
 * unchanged — stringifying it would inline a base64 image into the prompt as
 * megabytes of garbage tokens.
 */
function normalizeTurn(m) {
  return Array.isArray(m.content)
    ? { role: m.role, content: m.content }
    : { role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content ?? '') }
}

export async function compactHistory(history, { budget, maxTurns, summarize } = {}) {
  const { toSummarize, keep } = splitForCompaction(history, budget, maxTurns)
  const kept = keep.map(normalizeTurn)
  if (!toSummarize.length) return kept

  try {
    const summary = await summarize(buildCompactionPrompt(toSummarize))
    if (summary && String(summary).trim()) return [formatSummaryTurn(String(summary).trim()), ...kept]
  } catch {
    // Summarization is best-effort. Falling back to the old drop-the-oldest
    // behaviour is worse than a summary but far better than failing the turn.
  }
  return kept
}
