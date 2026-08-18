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
