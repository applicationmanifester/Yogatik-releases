/**
 * Reasoning models (nemotron, r1, …) wrap their scratch-work in <think>…</think>.
 * react-markdown drops the tag but the text used to render as a blank preview, or
 * the whole answer sat inside it. Pull reasoning out so the answer renders plainly
 * and the reasoning can go in a panel of its own. Handles an unclosed <think>
 * while the reply is still streaming.
 */

/**
 * Detects and truncates repetitive degenerate loops in text
 * (e.g. "Also we looked at src/tools/registry... Also we looked at src/tools/registry...")
 */
export function deduplicateRepetitions(text) {
  if (!text || typeof text !== 'string' || text.length < 40) return text
  // Matches any repeating block of 10-150 chars that repeats 3 or more times consecutively
  return text.replace(/(.{10,150}?)(?:\s*\1){2,}/gis, '$1')
}

export function splitReasoning(content) {
  if (typeof content !== 'string') return { reasoning: '', answer: content }
  let reasoning = ''
  const answer = content
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_, r) => { reasoning += r + '\n'; return '' })
    // An unclosed block is reasoning still being written.
    .replace(/<think>([\s\S]*)$/i, (_, r) => { reasoning += r; return '' })

  const cleanReasoning = deduplicateRepetitions(reasoning.trim())
  const cleanAnswer = deduplicateRepetitions(answer.trim())

  return { reasoning: cleanReasoning, answer: cleanAnswer }
}

/** Just the part the user is meant to read. Reasoning alone is not an answer. */
export function visibleAnswer(content) {
  return splitReasoning(content).answer
}

/**
 * Reasoning models return their scratch-work in a SEPARATE streaming field —
 * `reasoning_content` on DeepSeek-R1 and NVIDIA's reasoning models, `reasoning`
 * on OpenRouter — not inline in `content`.
 *
 * Wraps reasoning in <think> tags and includes a stream-level repetition breaker
 * to prevent runaway loops (common in 120B+ Nemotron reasoning collapse).
 */
export function createReasoningTagger() {
  let open = false
  let reasoningTail = ''
  let suppressedDueToLoop = false

  return {
    /** Text from the reasoning channel. Opens the block on first use. */
    reasoning(text) {
      if (!text) return ''

      // If we already detected an infinite repetition loop, suppress further duplicate tokens
      if (suppressedDueToLoop) {
        return ''
      }

      reasoningTail += text
      if (reasoningTail.length > 300) {
        reasoningTail = reasoningTail.slice(-300)
      }

      // Check if the tail contains a 3x repeating pattern
      const loopMatch = reasoningTail.match(/(.{12,80}?)(?:\s*\1){2,}/is)
      if (loopMatch) {
        suppressedDueToLoop = true
        return '\n\n*(…repetitive reasoning loop truncated)*'
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
      return prefix + text
    },
    /** End of stream: close the block if the model only ever reasoned. */
    end() {
      const out = open ? '</think>' : ''
      open = false
      suppressedDueToLoop = false
      return out
    },
    isOpen() { return open },
  }
}
