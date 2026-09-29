import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react'
import { stripToolCallSyntax } from '../promptedTools'
import { extractActionChips } from '../actionChips'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ReasoningAccordion } from './ReasoningAccordion'
import { sanitizeHtmlSync } from '../utils/sanitize'
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
import { splitReasoning } from '../reasoning'

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
export const StreamingMessage = forwardRef(function StreamingMessage(props, ref) {
  const { 
    onFirstToken, 
    onGrow, 
    initialText = '', 
    bare = false,
    typewriterSpeed = 0,
    typewriterEnabled = false,
    onActionClick,
    onError,
    onRetry,
    onComplete,
    onReconnect,
  } = props

  const [text, setText] = useState(() => initialText)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isOnlineState, setIsOnlineState] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [retryCount, setRetryCount] = useState(0)
  const [retryTimeout, setRetryTimeout] = useState(null)
  
  const frame = useRef(0)
  const pending = useRef('')
  const started = useRef(!!initialText)
  const streamController = useRef(null)
  const reconnectTimeout = useRef(null)
  const retryTimeoutRef = useRef(null)
  
  // Online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnlineState(true)
      if (onReconnect) onReconnect()
      if (isStreaming && pending.current) {
        attemptReconnect()
      }
    }
    
    const handleOffline = () => {
      setIsOnlineState(false)
      if (streamController.current) {
        streamController.current.abort()
        streamController.current = null
      }
    }
    
    const handleVisibilityChange = () => {
      if (document.hidden && isStreaming) {
        // Pause streaming when tab is hidden
        if (streamController.current) {
          streamController.current.pause?.()
        }
      } else if (!document.hidden && isStreaming && pending.current) {
        // Resume streaming when tab becomes visible
        attemptReconnect()
      }
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isStreaming, onReconnect])

  const RETRY_CONFIG = useMemo(() => ({
    initialDelay: 1000,
    maxDelay: 30000,
    maxRetries: 5,
    exponentialBase: 2,
  }), [])

  const calculateRetryDelay = useCallback((attempt) => {
    const delay = Math.min(
      RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.exponentialBase, attempt),
      RETRY_CONFIG.maxDelay
    )
    return delay
  }, [RETRY_CONFIG])

  const attemptReconnect = useCallback(async () => {
    if (!isOnlineState || retryCount >= RETRY_CONFIG.maxRetries) {
      return false
    }
    
    const delay = calculateRetryDelay(retryCount)
    
    return new Promise((resolve) => {
      retryTimeoutRef.current = setTimeout(async () => {
        try {
          setRetryCount(prev => prev + 1)
          if (onRetry) {
            const result = await onRetry(pending.current)
            if (result) {
              setRetryCount(0)
              resolve(true)
            } else {
              resolve(false)
            }
          } else {
            resolve(true)
          }
        } catch (error) {
          if (onError) onError(error)
          resolve(false)
        }
      }, delay)
    })
  }, [isOnlineState, retryCount, RETRY_CONFIG.maxRetries, calculateRetryDelay, onRetry, onError])

  const push = useCallback(async (full) => {
    if (!isOnlineState) {
      pending.current = full
      if (!isStreaming) {
        attemptReconnect()
      }
      return
    }
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    
    pending.current = full
    if (!started.current && full) { 
      started.current = true; 
      setIsStreaming(true)
      onFirstToken?.() 
    }
    
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setText(pending.current)
      setIsStreaming(true)
    })
  }, [isOnlineState, isStreaming, onFirstToken, attemptReconnect])

  const stop = useCallback(() => {
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    if (streamController.current) {
      streamController.current.abort()
      streamController.current = null
    }
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
      reconnectTimeout.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    
    pending.current = ''
    started.current = false
    setText('')
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    stop()
    setRetryCount(0)
    setActiveAction(null)
  }, [stop])

  const { displayedText, isComplete, skip } = useTypewriter({
    fullText: text,
    enabled: typewriterEnabled && !!text && !initialText,
    speed: typewriterSpeed,
  })

  const [activeAction, setActiveAction] = useState(null)

  useImperativeHandle(ref, () => ({
    push,
    clear,
    stop,
    skipTypewriter: skip,
    setActiveAction: (action) => setActiveAction(action),
    setActiveSteps: (steps) => setActiveAction(prev => ({ ...(prev || {}), steps })),
  }), [push, clear, stop, skip])

  useEffect(() => { 
    if (text) onGrow?.() 
  }, [text, onGrow])

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    stop()
  }, [stop])

  const sanitizedText = stripToolCallSyntax(text || '')
  const { reasoning, answer } = splitReasoning(sanitizedText)
  
  const displayContent = !typewriterEnabled || isComplete 
    ? (answer || (reasoning ? '' : sanitizedText)) 
    : stripToolCallSyntax(displayedText || '')

  const { cleanText, chips } = extractActionChips(displayContent || '')

  const sanitizedMarkdown = useMemo(() => {
    const toolName = activeAction?.name || ''
    return sanitizeHtmlSync(cleanText || '', toolName)
  }, [cleanText, activeAction?.name])

  return (
    <div className={`streaming-message ${!isOnlineState ? 'offline' : ''} ${isStreaming ? 'streaming' : ''}`}>
      {isStreaming && (
        <div className="stream-status">
          <span className="status-indicator" />
          <span className="retry-count">Retry: {retryCount}/{RETRY_CONFIG.maxRetries}</span>
          {!isOnlineState && <span className="offline-indicator">Offline</span>}
        </div>
      )}
      
      {reasoning ? (
        <ReasoningAccordion reasoning={reasoning} isStreaming={isStreaming} defaultExpanded={true} />
      ) : null}
      
      {cleanText ? (
        <div className="message-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitizedMarkdown}</ReactMarkdown>
          {!isComplete && <span className="typewriter-cursor" aria-hidden="true">▌</span>}
        </div>
      ) : null}
      
      {chips.length > 0 && (
        <div className="streaming-action-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
          {chips.map((chip, idx) => (
            <button
              key={chip.id || idx}
              className="action-chip-btn"
              onClick={() => onActionClick?.(chip)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.2)'}
              onMouseOut={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.12)'}
            >
              <span>{chip.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

export default StreamingMessage