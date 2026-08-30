import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Typewriter effect hook for streaming text.
 * Provides a smooth character-by-character reveal with configurable speed.
 */
export function useTypewriter({
  fullText = '',
  enabled = true,
  speed = 30, // ms per character
  onComplete,
}) {
  const [displayedText, setDisplayedText] = useState('')
  const targetTextRef = useRef(fullText)
  const animationFrameRef = useRef(0)
  const startTimeRef = useRef(0)
  const isCompleteRef = useRef(false)
  const speedRef = useRef(speed)
  const enabledRef = useRef(enabled)
  const onCompleteRef = useRef(onComplete)

  // Keep refs in sync
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const lastLengthRef = useRef(0)

  // Reset when fullText changes (new message)
  useEffect(() => {
    targetTextRef.current = fullText
    lastLengthRef.current = 0
    setDisplayedText('')
    isCompleteRef.current = false
    startTimeRef.current = performance.now()

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (enabled && fullText) {
      animate()
    } else {
      setDisplayedText(fullText)
      isCompleteRef.current = true
      onCompleteRef.current?.()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [fullText, enabled])

  const animate = useCallback(() => {
    if (!enabledRef.current) {
      setDisplayedText(targetTextRef.current)
      isCompleteRef.current = true
      onCompleteRef.current?.()
      return
    }

    const elapsed = performance.now() - startTimeRef.current
    const targetLength = Math.floor(elapsed / speedRef.current)

    if (targetLength !== lastLengthRef.current) {
      lastLengthRef.current = targetLength
      const target = targetTextRef.current.slice(0, targetLength)
      setDisplayedText(target)
    }

    if (targetLength >= targetTextRef.current.length) {
      setDisplayedText(targetTextRef.current)
      isCompleteRef.current = true
      onCompleteRef.current?.()
      return
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [])

  const skip = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setDisplayedText(targetTextRef.current)
    isCompleteRef.current = true
    onCompleteRef.current?.()
  }, [])

  return {
    displayedText,
    isComplete: isCompleteRef.current,
    skip,
  }
}

/**
 * Hook for managing optimistic user messages.
 * Immediately shows user message while sending to server.
 */
export function useOptimisticMessages() {
  const [messages, setMessages] = useState([])
  const pendingRef = useRef(new Map())

  const addOptimisticMessage = useCallback((tempId, content, metadata = {}) => {
    const optimisticMsg = {
      id: tempId,
      role: 'user',
      content,
      timestamp: Date.now(),
      optimistic: true,
      ...metadata,
    }
    setMessages(prev => [...prev, optimisticMsg])
    pendingRef.current.set(tempId, optimisticMsg)
    return tempId
  }, [])

  const confirmMessage = useCallback((tempId, serverId, serverData = {}) => {
    setMessages(prev => prev.map(msg =>
      msg.id === tempId && msg.optimistic
        ? { ...msg, id: serverId, optimistic: false, ...serverData }
        : msg
    ))
    pendingRef.current.delete(tempId)
  }, [])

  const removeOptimisticMessage = useCallback((tempId) => {
    setMessages(prev => prev.filter(msg => msg.id !== tempId))
    pendingRef.current.delete(tempId)
  }, [])

  const replaceOptimisticWithError = useCallback((tempId, error) => {
    setMessages(prev => prev.map(msg =>
      msg.id === tempId && msg.optimistic
        ? { ...msg, optimistic: false, error, content: msg.content }
        : msg
    ))
    pendingRef.current.delete(tempId)
  }, [])

  return {
    messages,
    setMessages,
    addOptimisticMessage,
    confirmMessage,
    removeOptimisticMessage,
    replaceOptimisticWithError,
  }
}