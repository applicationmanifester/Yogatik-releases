/**
 * Reasoning models (nemotron, r1, …) wrap their scratch-work in <think>…</think>.
 * react-markdown drops the tag but the text used to render as a blank preview, or
 * the whole answer sat inside it. Pull reasoning out so the answer renders plainly
 * and the reasoning can go in a panel of its own. Handles an unclosed <think>
 * while the reply is still streaming.
 *
 * Lives here rather than inside MessageBubble because three places need it now —
 * the bubble, the agent's empty-answer guard, and the live activity panel — and
 * three copies would drift.
 */
export function splitReasoning(content) {
  if (typeof content !== 'string') return { reasoning: '', answer: content }
  let reasoning = ''
  const answer = content
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_, r) => { reasoning += r + '\n'; return '' })
    // An unclosed block is reasoning still being written. Capture it rather than
    // discarding it, so a live view can show the thinking as it happens instead
    // of nothing at all until </think> finally lands.
    .replace(/<think>([\s\S]*)$/i, (_, r) => { reasoning += r; return '' })
  return { reasoning: reasoning.trim(), answer: answer.trim() }
}

/** Just the part the user is meant to read. Reasoning alone is not an answer. */
export function visibleAnswer(content) {
  return splitReasoning(content).answer
}

/**
 * Reasoning models return their scratch-work in a SEPARATE streaming field —
 * `reasoning_content` on DeepSeek-R1 and NVIDIA's reasoning models, `reasoning`
 * on OpenRouter — not inline in `content`. llm.js read only `delta.content`, so
 * that thinking was silently discarded and the Thinking panel was always empty
 * for exactly the models that have the most to show.
 *
 * Rather than teach every consumer a second channel, wrap it in <think> tags as
 * it streams. splitReasoning already understands those everywhere: the message
 * bubble, the activity panel, and the agent's empty-answer guard.
 */
export function createReasoningTagger() {
  let open = false
  return {
    /** Text from the reasoning channel. Opens the block on first use. */
    reasoning(text) {
      if (!text) return ''
      const prefix = open ? '' : '<think>'
      open = true
      return prefix + text
    },
    /** Text from the answer channel. Closes any open reasoning block first. */
    content(text) {
      if (!text) return ''
      const prefix = open ? '</think>' : ''
      open = false
      return prefix + text
    },
    /** End of stream: close the block if the model only ever reasoned. */
    end() {
      const out = open ? '</think>' : ''
      open = false
      return out
    },
    isOpen() { return open },
  }
}
