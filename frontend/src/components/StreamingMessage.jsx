import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import ReactMarkdown from 'react-markdown'

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
  return (
    <div className="message assistant">
      <div className="message-role">Yogatik</div>
      <div className="message-content"><ReactMarkdown>{text}</ReactMarkdown></div>
    </div>
  )
})
