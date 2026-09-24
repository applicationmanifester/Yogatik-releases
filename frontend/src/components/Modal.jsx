import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal shell: Escape to close, focus trapped inside, focus
 * restored to whatever opened it. Every dialog in the app uses this so the
 * keyboard behaviour can't drift apart between them.
 */
export function Modal({ title, icon, onClose, children, footer, labelledBy = 'modal-title', className = '', embedded = false }) {
  const ref = useRef(null)
  const restoreTo = useRef(null)
  const inertRootsRef = useRef([])

  useEffect(() => {
    // Embedded inside DashboardShell: the shell's own overlay already owns
    // focus-trapping and Escape-to-close for whichever section is showing.
    // Installing a second capture-phase listener here would double-fire
    // both on every keypress.
    if (embedded) return

    restoreTo.current = document.activeElement

    const node = ref.current
    const first = node?.querySelector(FOCUSABLE)
    ;(first || node)?.focus()

    // Apply inert to background content for screen readers
    // Find main content areas that should be inert while modal is open
    const mainContent = document.querySelector('main, #root > div:first-child, .app, [role="main"]')
    const sidebar = document.querySelector('aside, .sidebar, [role="complementary"]')
    const header = document.querySelector('header, .header, [role="banner"]')
    const nav = document.querySelector('nav, [role="navigation"]')
    
    const roots = [mainContent, sidebar, header, nav].filter(Boolean)
    inertRootsRef.current = roots
    
    roots.forEach(root => {
      if (root && !root.contains(node)) {
        root.setAttribute('inert', '')
      }
    })

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
      if (e.key !== 'Tab') return

      const items = [...(node?.querySelectorAll(FOCUSABLE) || [])].filter(el => el.offsetParent !== null)
      if (!items.length) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]

      // Wrap focus rather than letting Tab escape behind the overlay.
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Remove inert from background content
      inertRootsRef.current.forEach(root => {
        if (root) root.removeAttribute('inert')
      })
      restoreTo.current?.focus?.()
    }
  }, [onClose, embedded])

  // No overlay, no backdrop, no own header — DashboardShell's topbar already
  // shows this section's icon/title and its own close button. Only the
  // content + footer are this component's job here.
  if (embedded) {
    return (
      <div className={`modal embedded-page ${className}`}>
        {children}
        {footer}
      </div>
    )
  }

  return (
    <div className={`modal-overlay ${className ? `${className}-overlay` : ''}`} onClick={onClose}>
      <div
        ref={ref}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={labelledBy}>{icon} {title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  )
}
