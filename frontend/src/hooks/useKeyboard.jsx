import { useState, useEffect } from 'react'

/**
 * Mobile keyboard detection hook
 * Detects virtual keyboard open/close and provides keyboard height
 */
export function useKeyboard() {
  const [isOpen, setIsOpen] = useState(false)
  const [height, setHeight] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initial viewport height
    const updateViewportHeight = () => {
      setViewportHeight(window.visualViewport?.height || window.innerHeight)
    }
    updateViewportHeight()

    // Visual Viewport API (most reliable for keyboard detection)
    const visualViewport = window.visualViewport
    if (visualViewport) {
      const handleResize = () => {
        const vpHeight = visualViewport.height
        const vpWidth = visualViewport.width
        updateViewportHeight()

        // Keyboard is likely open if viewport height decreased significantly
        // Use a threshold of 150px to avoid false positives from browser UI
        const keyboardHeight = window.innerHeight - vpHeight
        const keyboardOpen = keyboardHeight > 150

        setIsOpen(keyboardOpen)
        setHeight(keyboardOpen ? keyboardHeight : 0)

        // Set CSS custom property for use in styles
        document.documentElement.style.setProperty(
          '--keyboard-height',
          keyboardOpen ? `${keyboardHeight}px` : '0px'
        )
        document.documentElement.style.setProperty(
          '--viewport-height',
          `${vpHeight}px`
        )
      }

      visualViewport.addEventListener('resize', handleResize)
      visualViewport.addEventListener('scroll', handleResize)

      return () => {
        visualViewport.removeEventListener('resize', handleResize)
        visualViewport.removeEventListener('scroll', handleResize)
        document.documentElement.style.setProperty('--keyboard-height', '0px')
      }
    }

    // Fallback for browsers without Visual Viewport API
    const handleResize = () => {
      updateViewportHeight()
      const keyboardHeight = window.innerHeight - window.visualViewport?.height
      const keyboardOpen = keyboardHeight > 150
      setIsOpen(keyboardOpen)
      setHeight(keyboardOpen ? keyboardHeight : 0)
      document.documentElement.style.setProperty(
        '--keyboard-height',
        keyboardOpen ? `${keyboardHeight}px` : '0px'
      )
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      document.documentElement.style.setProperty('--keyboard-height', '0px')
    }
  }, [])

  return { isOpen, height, viewportHeight }
}

/**
 * Hook to add keyboard-aware class to body
 */
export function useKeyboardBodyClass() {
  const { isOpen } = useKeyboard()

  useEffect(() => {
    document.body.classList.toggle('keyboard-open', isOpen)
    return () => document.body.classList.remove('keyboard-open')
  }, [isOpen])
}

/**
 * Hook to prevent body scroll when keyboard is open (optional)
 */
export function useKeyboardScrollLock() {
  const { isOpen } = useKeyboard()

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [isOpen])
}

// Re-export for convenience
export default useKeyboard