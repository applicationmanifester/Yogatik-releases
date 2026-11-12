import React, { useEffect, useRef } from 'react'
import { announce, initAnnouncer, trapFocus, saveFocus, restoreFocus, createArrowNavigation } from '../a11y'

/**
 * Global announcer component - renders a polite live region.
 * Place once at root of app.
 */
export function A11yAnnouncer() {
  const initialized = useRef(false)
  
  useEffect(() => {
    if (!initialized.current) {
      initAnnouncer()
      initialized.current = true
    }
  }, [])

  // This component doesn't render visible content
  // The announcer is injected into body by initAnnouncer()
  return null
}

/**
 * Skip to main content link - place at very top of app.
 */
export function SkipLink({ targetId = 'main-content' }) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-link"
      style={{
        position: 'absolute',
        top: '-100%',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        background: 'var(--primary, #3b82f6)',
        color: 'white',
        borderRadius: '0 0 8px 8px',
        zIndex: 10000,
        textDecoration: 'none',
        fontWeight: 600,
      }}
      onFocus={(e) => { e.currentTarget.style.top = '0' }}
      onBlur={(e) => { e.currentTarget.style.top = '-100%' }}
      onClick={(e) => {
        const target = document.getElementById(targetId)
        if (!target) return
        e.preventDefault()
        target.focus({ preventScroll: true })
        target.scrollIntoView({ block: 'start' })
      }}
    >
      Skip to main content
    </a>
  )
}

/**
 * Focus trap for modals and dialogs.
 * Usage: <FocusTrap><ModalContent /></FocusTrap>
 */
export function FocusTrap({ children, active = true, onDeactivate }) {
  const containerRef = useRef(null)
  const previousFocus = useRef(null)
  const cleanupRef = useRef(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    previousFocus.current = saveFocus()
    cleanupRef.current = trapFocus(containerRef.current)

    return () => {
      cleanupRef.current?.()
      restoreFocus(previousFocus.current)
      onDeactivate?.()
    }
  }, [active, onDeactivate])

  return (
    <div ref={containerRef} role="dialog" aria-modal="true">
      {children}
    </div>
  )
}

/**
 * Live region for announcing dynamic content changes.
 */
export function LiveRegion({ message, priority = 'polite', atomic = true }) {
  const [announced, setAnnounced] = React.useState('')

  useEffect(() => {
    if (message) {
      announce(message, priority)
      setAnnounced(message)
    }
  }, [message, priority])

  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic={atomic}
      className="sr-only"
      style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
    >
      {announced}
    </div>
  )
}

/**
 * Hook for managing focus in components.
 */
export function useFocusManagement() {
  const save = () => saveFocus()
  const restore = (el) => restoreFocus(el)
  const focusFirst = (container) => {
    const focusable = container.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus()
    return focusable
  }

  return { save, restore, focusFirst }
}

/**
 * Hook for keyboard navigation in lists.
 */
export function useArrowNavigation(items, options = {}) {
  return createArrowNavigation(items, options)
}

export default {
  A11yAnnouncer,
  SkipLink,
  FocusTrap,
  LiveRegion,
  useFocusManagement,
  useArrowNavigation,
}
