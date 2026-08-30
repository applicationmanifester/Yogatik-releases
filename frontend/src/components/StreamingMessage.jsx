import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { stripToolCallSyntax } from '../promptedTools'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTypewriter } from '../hooks/useTypewriter'

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

/**
 * @param {string} initialText text this chat had already streamed before this
 *   component mounted. It is read ONCE, at mount: the parent renders us only
 *   after the first token exists, and remounts us (keyed by chat) on a chat
 *   switch, so without this the text pushed before mount would be lost.
 * @param {boolean} bare render only the reasoning + content, no message wrapper
 *   or role header — for a parent that already draws that chrome.
 * @param {number} typewriterSpeed ms per character for typewriter effect (0 = disabled)
 * @param {boolean} typewriterEnabled whether typewriter effect is enabled
 */
export const StreamingMessage = forwardRef(function StreamingMessage(
  { 
    onFirstToken, 
    onGrow, 
    initialText = '', 
    bare = false,
    typewriterSpeed = 0,
    typewriterEnabled = false,
  }, ref,
) {
  const [text, setText] = useState(() => initialText)
  const frame = useRef(0)
  const pending = useRef('')
  const started = useRef(!!initialText)

  // Optional typewriter effect (bypassed by default for ultra-low latency real-time streaming)
  const { displayedText, isComplete, skip } = useTypewriter({
    fullText: text,
    enabled: typewriterEnabled && !!text && !initialText,
    speed: typewriterSpeed,
  })

  const push = useCallback((full) => {
    pending.current = full
    if (!started.current && full) { started.current = true; onFirstToken?.() }
    // Tokens arrive faster than the browser paints; coalesce to one update
    // per frame.
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setText(pending.current)
    })
  }, [onFirstToken])

  const [activeAction, setActiveAction] = useState(null)

  const clear = useCallback(() => {
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
    pending.current = ''
    started.current = false
    setText('')
    setActiveAction(null)
  }, [])

  useImperativeHandle(ref, () => ({
    /** @param {string} full the complete text so far, not a delta */
    push,
    clear,
    /** Set active in-flight tool action pill */
    setActiveAction: (action) => setActiveAction(action),
    /** Skip typewriter animation and show full text immediately */
    skipTypewriter: skip,
  }), [push, clear, skip])

  // Follow the stream imperatively — going through App state would reintroduce
  // exactly the re-render this component exists to avoid.
  useEffect(() => { if (text) onGrow?.() }, [text, onGrow])

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current) }, [])

  const sanitizedText = stripToolCallSyntax(text || '')
  const { reasoning, answer } = splitReasoning(sanitizedText)
  
  // Directly use answer/text when typewriter is disabled for zero-latency 60fps streaming
  const displayContent = !typewriterEnabled || isComplete 
    ? (answer || (reasoning ? '' : sanitizedText)) 
    : stripToolCallSyntax(displayedText || '')
  
  const body = (
    <>
      {reasoning ? (
        <details className="reasoning-bubble" style={bare ? { marginTop: 4 } : undefined}>
          <summary className="reasoning-summary">Thinking…</summary>
          <div className="reasoning-body">{reasoning}</div>
        </details>
      ) : null}
      {displayContent ? (
        <div className="message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
          {!isComplete && <span className="typewriter-cursor" aria-hidden="true">▌</span>}
        </div>
      ) : null}
      {activeAction && (
        <div className="streaming-action-pill" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderRadius: '999px',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          color: '#60a5fa',
          fontSize: '11.5px',
          fontWeight: 500,
          marginTop: '8px',
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            boxShadow: '0 0 8px #3b82f6',
          }} />
          <span>{activeAction.label || `⚡ Executing ${activeAction.name || 'tool'}…`}</span>
        </div>
      )}
    </>
  )
  if (!displayContent && !activeAction && !reasoning) return null
  if (bare) return body
  return (
    <div className="message assistant" role="article" aria-busy={!isComplete} aria-label={isComplete ? "Assistant response complete" : "Assistant is responding"}>
      <div className="message-role">Yogatik</div>
      {body}
    </div>
  )
})