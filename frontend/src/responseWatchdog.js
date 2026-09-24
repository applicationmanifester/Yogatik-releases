/**
 * Response Quality Watchdog — Autonomous Self-Healing AI Response System
 *
 * Evaluates the quality of an AI model's response and decides whether to
 * accept it, continue it (truncation), regenerate it (failure), or escalate
 * to a stronger model / different provider.
 *
 * Pure logic — no React, no side effects, no network. Safe to call from
 * agent.js, App.jsx, cascade.js, or any other context.
 */

// ── Verdict types ──────────────────────────────────────────────────────
/**
 * @typedef {'good' | 'degraded' | 'failed'} Quality
 * @typedef {'accept' | 'continue' | 'regenerate' | 'escalate' | 'accept_partial'} Action
 * @typedef {'low' | 'medium' | 'high' | 'critical'} Severity
 *
 * @typedef {Object} WatchdogVerdict
 * @property {Quality}  quality
 * @property {Action}   action
 * @property {string}   reason   Human-readable explanation
 * @property {Severity} severity
 * @property {string}   check    Which check triggered the verdict
 */

// ── Configurable thresholds ────────────────────────────────────────────
const DEFAULTS = {
  /** Maximum regeneration attempts the watchdog will recommend. */
  maxRegenerations: 2,
  /** Maximum auto-continuation attempts for truncated responses. */
  maxContinuations: 3,
  /** Tri-gram repetition ratio above which a response is degenerate. */
  repetitionThreshold: 0.40,
  /** Minimum visible characters for a non-trivial prompt's response. */
  minContentLength: 10,
  /** Common token-limit boundaries that hint at max_tokens truncation. */
  tokenBoundaries: [4096, 8192, 16384, 32768],
  /** Token boundary tolerance (chars). */
  tokenBoundaryTolerance: 80,
}

// ── Refusal patterns ───────────────────────────────────────────────────
const REFUSAL_PATTERNS = [
  /^I(?:'m| am) (?:sorry|unable|not able|afraid)[,.]?\s/i,
  /^(?:As|Being) an? (?:AI|language model|assistant)/i,
  /^I (?:cannot|can't|do not|don't) (?:help|assist|provide|generate|create)/i,
  /^Unfortunately,?\s+I\s/i,
  /^I'?m not (?:able|designed|equipped|programmed) to/i,
  /^(?:Sorry|Apologies),?\s+(?:but )?I (?:can'?t|cannot)/i,
  /^This (?:request|query|prompt) (?:is|goes|falls) (?:beyond|outside|against)/i,
]

const FILE_ACCESS_DENIAL_PATTERNS = [
  /(?:don'?t|do not|cannot|can'?t|unable to|lack)\s+(?:have\s+)?(?:access(?:\s+to)?|view|read|open|inspect)\s+(?:your\s+)?(?:local\s+)?(?:files?|filesystem|codebase|directory|folder|disk|repo)/i,
  /(?:as an ai|as a language model)[^.\n]*(?:cannot|can'?t|don'?t|do not)\s+(?:have\s+)?(?:access(?:\s+to)?|view|read|open)\s+(?:your\s+)?(?:local\s+)?(?:files?|filesystem|codebase|directory|folder|disk)/i,
  /(?:don'?t|do not|cannot|can'?t)\s+see\s+(?:your\s+)?(?:local\s+)?(?:files?|codebase|project|directory)/i,
  /please (?:share|paste|provide) (?:the |your )?(?:code|file|files|snippet) (?:content )?because I (?:cannot|can'?t|don'?t|do not) have access/i,
  /if it'?s in a file in your project, let me know the path and i'?ll read it/i,
]

const TOOL_RECEIPT_PATTERNS = [
  /^I have completed the requested actions \(tool results\):/i,
  /^I have completed the requested operations and gathered the following information:/i,
  /^I have finished inspecting the files and applying the requested changes\.?$/i,
  /^I have finished inspecting the workspace and analyzing the requested task\.?$/i,
  /^I have analyzed the request and prepared the following plan:\s*\n\n[\s\S]*\*Click \*\*Continue\*\*/i,
]

/** True if the response is merely a raw fallback receipt or action list rather than an actual synthesized answer. */
export function isToolReceiptStub(text) {
  if (!text) return false
  const visible = visibleContent(text).trim()
  return TOOL_RECEIPT_PATTERNS.some(p => p.test(visible))
}

/** True if the model falsely claims it cannot access files in desktop mode. */
export function isFalseFileAccessDenial(text) {
  if (!text) return false
  const visible = visibleContent(text)
  return FILE_ACCESS_DENIAL_PATTERNS.some(p => p.test(visible))
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Strip `<think>…</think>` blocks and return only user-visible content. */
export function visibleContent(text) {
  if (!text) return ''
  return text.replace(/<think[\s\S]*?<\/think>/gi, '').trim()
}

/**
 * Tri-gram repetition ratio: what fraction of the text's tri-grams are
 * duplicates. Values near 1.0 mean the text is a degenerate loop.
 */
export function repetitionRatio(text) {
  if (!text || text.length < 60) return 0
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length < 6) return 0
  const trigrams = []
  for (let i = 0; i <= words.length - 3; i++) {
    trigrams.push(words.slice(i, i + 3).join(' '))
  }
  if (trigrams.length === 0) return 0
  const unique = new Set(trigrams)
  return 1 - (unique.size / trigrams.length)
}

/** Detects unclosed markdown code fences (odd count of ```). */
export function hasUnclosedCodeBlock(text) {
  const matches = text.match(/```/g)
  return !!matches && matches.length % 2 !== 0
}

/** Detects mid-sentence or mid-thought endings. */
export function endsMidThought(text) {
  if (!text || text.length < 20) return false
  const trimmed = text.trim()
  // Trailing transitional phrases
  if (/\b(let'?s (also )?(check|inspect|look at|examine|see|run)|now (we will|let's|inspect)|next step is to)\s*[^.?!]*$/i.test(trimmed)) return true
  // Ends with a colon, comma, dash, ampersand, pipe, or conjunction
  if (/[:,(\-&|+=]\s*$/.test(trimmed)) return true
  if (/\b(and|or|because|such as|for example|step \d+:?|following:?)\s*$/i.test(trimmed)) return true
  return false
}

/** True if the response length is suspiciously close to a common token boundary. */
export function hitsTokenBoundary(text, boundaries = DEFAULTS.tokenBoundaries, tolerance = DEFAULTS.tokenBoundaryTolerance) {
  if (!text) return false
  const len = text.length
  // Rough estimate: 1 token ≈ 4 chars
  const tokenEstimate = len / 4
  return boundaries.some(b => Math.abs(tokenEstimate - b) < tolerance)
}

/** True if the response is purely a refusal with no substantive content. */
export function isRefusal(text) {
  if (!text || text.length > 600) return false // Real answers with a disclaimer are fine
  const visible = visibleContent(text)
  if (!visible) return false
  return REFUSAL_PATTERNS.some(p => p.test(visible))
}

/** True if the response looks like a raw error message, not a real answer. */
export function isErrorContent(text) {
  if (!text) return false
  const t = text.trim()
  if (t.length > 400) return false
  // Typical error patterns from providers
  return /^(Error|error|ERROR):?\s/i.test(t)
    || /^(500|502|503|504|429|400|401|403)\s/i.test(t)
    || /^{\s*"error"/i.test(t)
    || /^Request failed/i.test(t)
    || /^fetch failed/i.test(t)
    || /^network error/i.test(t)
    || /^timeout/i.test(t)
}

/** True if the response starts with broken encoding or a mid-word fragment. */
export function startsIncoherent(text) {
  if (!text || text.length < 4) return false
  const start = text.trimStart().slice(0, 20)
  // Broken UTF-8 replacement characters
  if (/^[\uFFFD\uFEFF]/.test(start)) return true
  // Starts with a lowercase continuation of nothing (mid-word)
  if (/^[a-z]{1,3}[.!?,;)\]}\s]/.test(start) && !/^(a |an |at |be |by |do |go |he |if |in |is |it |me |my |no |of |on |or |so |to |up |us |we |the |but |for |has |had |her |him |his |its |let |may |not |now |our |out |own |run |set |too |try |use |via |was |who |why |yes |yet |you )/.test(start)) return true

  return false
}

// ── Main assessment ────────────────────────────────────────────────────

/**
 * Assess an AI response's quality and return a verdict.
 *
 * @param {string} content      The model's full response text
 * @param {Object} [meta]       Context about the turn
 * @param {string} [meta.userMessage]       The user's original prompt
 * @param {number} [meta.rounds]            Tool rounds completed
 * @param {number} [meta.maxRounds]         Max tool rounds allowed
 * @param {boolean} [meta.forcedFinal]      Whether a forced-final pass was used
 * @param {number} [meta.regenerations]     How many times we've already regenerated
 * @param {number} [meta.continuations]     How many times we've already continued
 * @param {'chat'|'voice'} [meta.mode]      Pipeline mode (voice uses relaxed thresholds)
 * @param {string} [meta.provider]          The provider that produced this response
 * @param {string} [meta.model]             The model that produced this response
 * @returns {WatchdogVerdict}
 */
export function assessResponse(content, meta = {}) {
  const {
    userMessage = '',
    rounds = 0,
    maxRounds = 25,
    forcedFinal = false,
    regenerations = 0,
    continuations = 0,
    mode = 'chat',
    provider = '',
    model = '',
  } = meta

  const maxRegens = DEFAULTS.maxRegenerations
  const maxCont = DEFAULTS.maxContinuations
  const visible = visibleContent(content || '')
  const isVoice = mode === 'voice'

  // ── 1. Empty / blank check ─────────────────────────────────────────
  if (!visible) {
    if (regenerations >= maxRegens) {
      return verdict('failed', 'accept_partial', 'Response is empty after all retry attempts.', 'high', 'empty')
    }
    return verdict('failed', 'regenerate', 'Response is empty — no visible content after stripping reasoning.', 'critical', 'empty')
  }

  // ── 1.5. Incomplete tool synthesis / raw tool receipt stub ─────────
  if (isToolReceiptStub(visible)) {
    if (regenerations >= maxRegens) {
      return verdict('degraded', 'accept_partial', 'Model stopped after tool execution without synthesizing an answer.', 'high', 'incomplete_synthesis')
    }
    return verdict('failed', 'regenerate', 'The model stopped after tool execution without writing the actual answer prose. Synthesize the findings now.', 'critical', 'incomplete_synthesis')
  }

  // ── 2. Error-as-content ────────────────────────────────────────────
  if (isErrorContent(visible)) {
    if (regenerations >= maxRegens) {
      return verdict('failed', 'accept_partial', 'Response is an error message after all retries.', 'high', 'error_content')
    }
    return verdict('failed', 'regenerate', 'Response appears to be a raw error message, not a real answer.', 'high', 'error_content')
  }

  // ── 3. Incoherent start ────────────────────────────────────────────
  if (startsIncoherent(visible)) {
    if (regenerations >= maxRegens) {
      return verdict('degraded', 'accept_partial', 'Response starts incoherently after all retries.', 'medium', 'incoherent')
    }
    return verdict('failed', 'regenerate', 'Response starts with broken encoding or a mid-word fragment.', 'medium', 'incoherent')
  }

  // ── 4. Minimum length (skip for voice — short replies are normal) ──
  if (!isVoice && visible.length < DEFAULTS.minContentLength && userMessage.length > 20) {
    if (regenerations >= maxRegens) {
      return verdict('degraded', 'accept_partial', 'Response is suspiciously short after all retries.', 'medium', 'too_short')
    }
    return verdict('degraded', 'regenerate', `Response is only ${visible.length} chars for a substantive prompt.`, 'medium', 'too_short')
  }

  // ── 5. Degenerate repetition ───────────────────────────────────────
  const ratio = repetitionRatio(visible)
  if (ratio > DEFAULTS.repetitionThreshold) {
    if (regenerations >= maxRegens) {
      return verdict('failed', 'accept_partial', `Degenerate repetition detected (${(ratio * 100).toFixed(0)}% repeated tri-grams) after all retries.`, 'high', 'repetition')
    }
    return verdict('failed', 'regenerate', `Degenerate repetition loop detected: ${(ratio * 100).toFixed(0)}% of tri-grams are duplicates.`, 'high', 'repetition')
  }

  // ── 5.5 False file access denial in desktop mode ──────────────────
  if (meta.isDesktop && isFalseFileAccessDenial(visible)) {
    if (regenerations >= maxRegens) {
      return verdict('degraded', 'accept_partial', 'Model denied file access in Desktop mode after retries.', 'high', 'file_access_denial')
    }
    return verdict(
      'failed',
      'regenerate',
      'You are running in the Yogatik Desktop App with FULL file access. NEVER claim you lack file access or ask the user to paste files. Use your fs_* tools (fs_list, fs_find_files, fs_read) to inspect the workspace files directly.',
      'critical',
      'file_access_denial'
    )
  }

  // ── 6. Pure refusal with no substance ──────────────────────────────
  if (isRefusal(visible)) {
    if (regenerations >= maxRegens) {
      return verdict('degraded', 'accept_partial', 'Model refused the request after all retry/escalation attempts.', 'medium', 'refusal')
    }
    return verdict('degraded', 'escalate', 'Model refused the request — try a different provider or model.', 'medium', 'refusal')
  }

  // ── 7. Truncation: unclosed code blocks ────────────────────────────
  if (hasUnclosedCodeBlock(visible)) {
    if (continuations >= maxCont) {
      return verdict('degraded', 'accept_partial', 'Response has unclosed code blocks after max continuations.', 'low', 'unclosed_code')
    }
    return verdict('degraded', 'continue', 'Response has an unclosed code block — likely truncated mid-output.', 'low', 'unclosed_code')
  }

  // ── 8. Truncation: mid-thought ending ──────────────────────────────
  if (endsMidThought(visible)) {
    if (continuations >= maxCont || forcedFinal) {
      return verdict('degraded', 'accept_partial', 'Response ends mid-thought after max continuations.', 'low', 'mid_thought')
    }
    return verdict('degraded', 'continue', 'Response appears truncated — ends mid-sentence or with a transitional phrase.', 'low', 'mid_thought')
  }

  // ── 9. Token-boundary hit (suspicious exact length) ────────────────
  if (!isVoice && hitsTokenBoundary(visible) && !visible.trimEnd().endsWith('.') && !visible.trimEnd().endsWith('```')) {
    if (continuations >= maxCont) {
      return verdict('degraded', 'accept_partial', 'Response may have hit a token limit.', 'low', 'token_boundary')
    }
    return verdict('degraded', 'continue', 'Response length suggests it hit a max_tokens boundary.', 'low', 'token_boundary')
  }

  // ── All checks passed ──────────────────────────────────────────────
  return verdict('good', 'accept', 'Response passed all quality checks.', 'low', 'none')
}

// ── Verdict builder ────────────────────────────────────────────────────
/** @returns {WatchdogVerdict} */
function verdict(quality, action, reason, severity, check) {
  return { quality, action, reason, severity, check }
}

// ── Retry-decision helpers (for callers) ───────────────────────────────

/**
 * Whether a streaming/network error is retryable (transient).
 * Used by App.jsx to decide whether to auto-retry the entire turn.
 */
export function isRetryableError(errorString) {
  if (!errorString) return false
  const e = String(errorString).toLowerCase()
  return /429|rate.?limit|50[0-4]|timeout|timed?\s*out|econnreset|econnrefused|network|overload|exceeded|capacity|busy|unavailable|bad gateway|gateway timeout|premature|socket|disconnect|aborted by server|fetch failed|stream ended|closed unexpectedly/i.test(e)
}

/**
 * Exponential backoff delay for a given attempt number.
 * attempt=0 → 500ms, attempt=1 → 1000ms, attempt=2 → 2000ms, capped at 8s.
 */
export function retryDelay(attempt) {
  return Math.min(500 * Math.pow(2, attempt), 8000)
}

/**
 * Build a continuation prompt for the model to resume from truncated output.
 */
export function continuationPrompt(content) {
  if (hasUnclosedCodeBlock(content)) {
    return 'Your previous output was cut off mid-code-block. Continue from EXACTLY where you stopped — do NOT repeat any text or code already given. Close all open code fences.'
  }
  return 'Your previous output was cut off mid-thought. Continue from EXACTLY where you stopped — do NOT repeat any text already given. Complete all remaining analysis, code, and conclusions.'
}

/**
 * Build a regeneration system message for the model.
 */
export function regenerationPrompt(reason) {
  if (reason && reason.includes('fs_* tools')) {
    return `${reason} Do not mention or reference the failed attempt.`
  }
  if (reason && (reason.includes('incomplete_synthesis') || reason.includes('tool execution without writing the actual answer') || reason.includes('without synthesizing'))) {
    return 'You have completed the tool exploration and collected all the data. ' +
      'Do NOT just list the tools executed or output an action receipt. ' +
      'Write your complete, comprehensive final answer directly to the user now in clear markdown formatting using the information gathered above.'
  }
  return `Your previous response did not meet quality standards (${reason}). ` +
    'Please provide a complete, high-quality response to the original question. ' +
    'Do not mention or reference the failed attempt.'
}
