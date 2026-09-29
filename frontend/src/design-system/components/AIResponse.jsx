import React from 'react'

/**
 * AIResponse — Renders a model's text answer inside a modal.
 *
 * Shared design-system component. Preserves line breaks (models emit plain
 * text with newlines) while inheriting the surrounding modal's typography.
 *
 * @param {string} content the model's answer text
 */
export function AIResponse({ content }) {
  if (!content || typeof content !== 'string') return null
  return <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{content}</p>
}

export default AIResponse
