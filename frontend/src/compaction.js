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
