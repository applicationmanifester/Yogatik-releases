/**
 * Modal — Accessible dialog component built on design tokens
 */
import React, { useEffect, useRef, forwardRef } from 'react'
import { tokens } from '../tokens'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

const overlayStyles = {
  position: 'fixed',
  inset: 0,
  background: tokens.colors.overlayStrong,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: tokens.spacing[4],
  zIndex: tokens.zIndex.modal,
  animation: `fadeIn ${tokens.motion.fast} ease-out`,
}

const modalStyles = {
  background: tokens.colors.panel,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radius.xl,
  boxShadow: tokens.shadow.xl,
  maxWidth: '560px',
  width: '100%',
  maxHeight: '85vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  animation: `slideUp ${tokens.motion.base} ${tokens.motion.easeOut}`,
}

const headerStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${tokens.spacing[4]} ${tokens.spacing[5]}`,
  borderBottom: `1px solid ${tokens.colors.border}`,
}

const titleStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing[2],
  fontSize: tokens.typography.size.lg,
  fontWeight: tokens.typography.weight.bold,
  color: tokens.colors.text,
  margin: 0,
}

const closeButtonStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: tokens.radius.full,
  background: 'transparent',
  border: 'none',
  color: tokens.colors.textSecondary,
  cursor: 'pointer',
  transition: `background-color ${tokens.motion.fast}, color ${tokens.motion.fast}`,
}

const contentStyles = {
  padding: tokens.spacing[5],
  overflowY: 'auto',
  flex: 1,
}

const footerStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: tokens.spacing[2],
  padding: `${tokens.spacing[3]} ${tokens.spacing[5]}`, 
  borderTop: `1px solid ${tokens.colors.border}`,
  background: tokens.colors.bgElevated,
}

export const Modal = forwardRef(function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  size = 'md',
  className = '',
  style = {},
  'aria-labelledby': labelledBy = 'modal-title',
  embedded = false,
  ...props
}, ref) {
  const modalRef = useRef(null)
  const restoreTo = useRef(null)
  const inertRootsRef = useRef([])

  const sizeStyles = {
    sm: { maxWidth: '400px' },
    md: { maxWidth: '560px' },
    lg: { maxWidth: '720px' },
    xl: { maxWidth: '960px' },
    full: { maxWidth: '100%', maxHeight: '100%', borderRadius: 0 },
  }

  useEffect(() => {
    if (!isOpen || embedded) return

    restoreTo.current = document.activeElement
    const node = modalRef.current
    const first = node?.querySelector(FOCUSABLE)
    ;(first || node)?.focus()

    // Apply inert to background content for screen readers
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

      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      inertRootsRef.current.forEach(root => {
        if (root) root.removeAttribute('inert')
      })
      document.body.style.overflow = ''
      restoreTo.current?.focus?.()
    }
  }, [isOpen, onClose, embedded])

  if (!isOpen) return null

  if (embedded) {
    return (
      <div
        ref={ref}
        className={`modal embedded-page ${className}`}
        style={{ ...modalStyles, ...sizeStyles[size], ...style }}
        role="main"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        {...props}
      >
        {children}
        {footer}
      </div>
    )
  }

  return (
    <div
      className={`modal-overlay ${className}-overlay`}
      style={overlayStyles}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal ${className}`}
        style={{ ...modalStyles, ...sizeStyles[size], ...style }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        {...props}
      >
        {(title || icon) && (
          <div style={headerStyles}>
            <h2 id={labelledBy} style={titleStyles}>
              {icon && <span style={{ display: 'flex' }}>{icon}</span>}
              {title}
            </h2>
            <button
              style={closeButtonStyles}
              onClick={onClose}
              aria-label="Close dialog"
              onMouseOver={e => e.currentTarget.style.background = tokens.colors.brandLight}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div style={contentStyles}>
          {children}
        </div>
        {footer && <div style={footerStyles}>{footer}</div>}
        <style jsx>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        `}</style>
      </div>
    </div>
  )
})

Modal.displayName = 'Modal'
export default Modal
