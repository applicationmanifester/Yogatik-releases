import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal shell: Escape to close, focus trapped inside, focus
 * restored to whatever opened it. Every dialog in the app uses this so the
 * keyboard behaviour can't drift apart between them.
 */
export function Modal({ title, icon, onClose, children, footer, labelledBy = 'modal-title' }) {
  const ref = useRef(null)
  const restoreTo = useRef(null)

  useEffect(() => {
    restoreTo.current = document.activeElement

    const node = ref.current
    const first = node?.querySelector(FOCUSABLE)
    ;(first || node)?.focus()

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
      restoreTo.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="modal"
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
