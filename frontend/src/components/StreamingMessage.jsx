import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * The in-flight assistant reply.
 *
 * This owns the streaming text itself instead of holding it in App state. When
 * App held it, every animation frame of every answer re-rendered the whole app
 * — sidebar, composer, and all 40 message bubbles, each re-running ReactMarkdown
 * — for text that only ever appears inside this one div.
 *
 * The parent pushes through the ref; React state stops at this component.
 */
function splitReasoning(content) {
  if (typeof content !== 'string') return { reasoning: '', answer: content }
  let reasoning = ''
  const answer = content
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_, r) => { reasoning += r + '\n'; return '' })
    .replace(/<think>([\s\S]*)$/i, (_, r) => { reasoning += r; return '' })
    .trim()
  return { reasoning: reasoning.trim(), answer }
}

export const StreamingMessage = forwardRef(function StreamingMessage(
  { onFirstToken, onGrow }, ref,
) {
  const [text, setText] = useState('')
  const frame = useRef(0)
  const pending = useRef('')
  const started = useRef(false)

  useImperativeHandle(ref, () => ({
    /** @param {string} full the complete text so far, not a delta */
    push(full) {
      pending.current = full
      if (!started.current && full) { started.current = true; onFirstToken?.() }
      // Tokens arrive faster than the browser paints; coalesce to one update
      // per frame.
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        setText(pending.current)
      })
    },
    clear() {
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
      pending.current = ''
      started.current = false
      setText('')
    },
  }), [onFirstToken])

  // Follow the stream imperatively — going through App state would reintroduce
  // exactly the re-render this component exists to avoid.
  useEffect(() => { if (text) onGrow?.() }, [text, onGrow])

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current) }, [])

  if (!text) return null
  const { reasoning, answer } = splitReasoning(text)
  return (
    <div className="message assistant" role="article" aria-busy="true" aria-label="Assistant is responding">
      <div className="message-role">Yogatik</div>
      {reasoning ? (
        <details className="reasoning-bubble" open>
          <summary className="reasoning-summary">Thinking…</summary>
          <div className="reasoning-body">{reasoning}</div>
        </details>
      ) : null}
      <div className="message-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer || (reasoning ? '' : text)}</ReactMarkdown>
      </div>
    </div>
  )
})
