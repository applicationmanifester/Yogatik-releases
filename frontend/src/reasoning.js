/**
 * Reasoning models (nemotron, r1, …) wrap their scratch-work in <think>…</think>.
 * react-markdown drops the tag but the text used to render as a blank preview, or
 * the whole answer sat inside it. Pull reasoning out so the answer renders plainly
 * and the reasoning can go in a panel of its own. Handles an unclosed <think>
 * while the reply is still streaming.
 */

/**
 * Detects and truncates repetitive degenerate loops in text without locking the main thread.
 */
export function deduplicateRepetitions(text) {
  if (!text || typeof text !== 'string' || text.length < 60) return text
  if (text.length > 30000) return text // Skip heavy scan on massive documents
  
  // Fast line-based deduplication for runaway generation loops (e.g. repeated lines)
  const lines = text.split('\n')
  if (lines.length > 6) {
    const cleanLines = []
    let repeatCount = 0
    let lastLine = null
    for (const line of lines) {
      const trimmed = line.trim()
      // Markdown table rows and separator rows are legitimately repetitive — skip them
      // e.g.  "| col | col |"  and  "| --- | --- |"
      const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|')
      if (isTableRow) {
        repeatCount = 0
        lastLine = null
        cleanLines.push(line)
        continue
      }
      if (trimmed && trimmed.length > 5 && trimmed === lastLine) {
        repeatCount++
        if (repeatCount <= 2) {
          cleanLines.push(line)
        } else if (repeatCount === 3) {
          cleanLines.push('*(…repetitive output truncated)*')
        }
      } else {
        repeatCount = 0
        lastLine = trimmed.length > 5 ? trimmed : null
        cleanLines.push(line)
      }
    }
    return cleanLines.join('\n')
  }
  return text
}

const reasoningCache = new Map()

export function splitReasoning(content) {
  if (typeof content !== 'string') return { reasoning: '', answer: content }
  
  // Fast path: if no reasoning markup, bypass all parsing instantly
  if (!content.includes('<think>')) {
    return { reasoning: '', answer: deduplicateRepetitions(content) }
  }

  // Fast LRU cache for unchanged completed strings
  if (reasoningCache.has(content)) {
    return reasoningCache.get(content)
  }

  let reasoning = ''
  const answer = content
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_, r) => { reasoning += r + '\n'; return '' })
    // An unclosed block is reasoning still being written.
    .replace(/<think>([\s\S]*)$/i, (_, r) => { reasoning += r; return '' })

  const cleanReasoning = deduplicateRepetitions(reasoning.trim())
  const cleanAnswer = deduplicateRepetitions(answer.trim())

  const res = { reasoning: cleanReasoning, answer: cleanAnswer }
  if (reasoningCache.size > 200) {
    const firstKey = reasoningCache.keys().next().value
    reasoningCache.delete(firstKey)
  }
  reasoningCache.set(content, res)
  return res
}

/** Just the part the user is meant to read. Reasoning alone is not an answer. */
export function visibleAnswer(content) {
  const ans = splitReasoning(content).answer
  if (!ans) return ''
  // Pseudo tool announcements (e.g. "[Tool called: fs_file_tree for workspace exploration]")
  // are internal tool execution attempts, not visible answers to the user.
  const stripped = ans.replace(/\[(?:Tool called|Calling tool|Tool|Call tool|Invoke):\s*[\s\S]*?\]/gi, '').trim()
  return stripped
}

/**
 * Reasoning models return their scratch-work in a SEPARATE streaming field —
 * `reasoning_content` on DeepSeek-R1 and NVIDIA's reasoning models, `reasoning`
 * on OpenRouter — not inline in `content`.
 *
 * Wraps reasoning in <think> tags and includes stream-level repetition breakers
 * on BOTH reasoning and content channels to prevent runaway loops (common in 120B+
 * Nemotron and open reasoning models).
 */
export function createReasoningTagger() {
  let open = false
  let reasoningTail = ''
  let suppressedDueToLoop = false
  let contentTail = ''
  let contentLoopSuppressed = false

  return {
    /** Text from the reasoning channel. Opens the block on first use. */
    reasoning(text) {
      if (!text) return ''

      // If we already detected an infinite repetition loop, suppress further duplicate tokens
      if (suppressedDueToLoop) {
        return ''
      }

      reasoningTail += text
      if (reasoningTail.length > 500) {
        reasoningTail = reasoningTail.slice(-500)
      }

      // Check if the tail contains a 3x repeating pattern.
      // Skip if the tail is dominated by markdown table content (pipe-delimited rows).
      const hasTableContent = (reasoningTail.match(/\|/g) || []).length > 6
      if (!hasTableContent) {
        const loopMatch = reasoningTail.match(/(.{15,80}?)(?:\s*\1){2,}/is)
        if (loopMatch) {
          suppressedDueToLoop = true
          return '\n\n*(…repetitive reasoning loop truncated)*'
        }
      }

      const prefix = open ? '' : '<think>'
      open = true
      return prefix + text
    },
    /** Text from the answer channel. Closes any open reasoning block first. */
    content(text) {
      if (!text) return ''
      suppressedDueToLoop = false
      const prefix = open ? '</think>' : ''
      open = false

      if (contentLoopSuppressed) {
        return ''
      }

      contentTail += text
      if (contentTail.length > 500) {
        contentTail = contentTail.slice(-500)
      }

      // Check for runaway dots / ellipses / filler tokens (e.g. "... ... ... ..." or "...........")
      if (/(\.\s*|\.\.\.\s*){10,}/.test(contentTail)) {
        contentLoopSuppressed = true
        return prefix + '\n\n*(…repetitive filler loop truncated)*'
      }

      // Check if the tail contains a 3x repeating pattern (min 15 chars to avoid short table fragments).
      // Skip entirely when the tail is dominated by markdown table content (pipe-delimited rows).
      const hasTableContent = (contentTail.match(/\|/g) || []).length > 6
      if (!hasTableContent) {
        const loopMatch = contentTail.match(/(.{15,80}?)(?:\s*\1){2,}/is)
        if (loopMatch) {
          contentLoopSuppressed = true
          return prefix + '\n\n*(…repetitive text loop truncated)*'
        }
      }

      return prefix + text
    },
    /** End of stream: close the block if the model only ever reasoned. */
    end() {
      const out = open ? '</think>' : ''
      open = false
      suppressedDueToLoop = false
      contentLoopSuppressed = false
      return out
    },
    isOpen() { return open },
    isContentLoopSuppressed() { return contentLoopSuppressed },
  }
}
