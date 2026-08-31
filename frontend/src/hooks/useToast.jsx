/**
 * Toasts — one implementation, with actions and progress.
 *
 * There were TWO. This provider was mounted in main.jsx and consumed by
 * nothing; App kept its own `showToast` + a `.toast` div, which could show only
 * ONE message at a time (each call replaced the last) and was
 * `pointer-events: none`, so a button inside it could never have been clicked.
 * App now delegates here, so there is a single place where a toast can grow a
 * Retry button or a progress bar.
 *
 * Three rules, each fixing something the old version got wrong:
 *
 *  1. A TOAST WITH AN ACTION MUST NOT AUTO-DISMISS. Offering "Retry" and then
 *     vanishing after three seconds is worse than not offering it — the user
 *     reaches for a button that is no longer there.
 *  2. TIMERS ARE TRACKED AND CLEARED. The old `setTimeout` was never cancelled,
 *     so a manually dismissed toast still fired later and the whole set leaked
 *     on unmount.
 *  3. `role="alert"` INTERRUPTS A SCREEN READER. That is right for a failure
 *     and wrong for "Copied" — and actively hostile for a progress toast that
 *     updates several times a second. Only errors assert.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const clearTimer = useCallback((id) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const dismiss = useCallback((id) => {
    clearTimer(id)
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [clearTimer])

  /**
   * @param {string} message
   * @param {object} [options]
   * @param {'info'|'success'|'error'} [options.variant]
   * @param {Array<{label:string,onClick:Function,primary?:boolean}>} [options.actions]
   * @param {number|null} [options.progress]  0..1, or null for indeterminate
   * @param {number} [options.duration]       ms; ignored when the toast is actionable or in progress
   */
  const show = useCallback((message, options = {}) => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const toast = { id, message, variant: 'info', ...options }
    setToasts(prev => [...prev, toast])

    // Anything the user is meant to act on, or that is still running, stays
    // until it is dismissed or completed explicitly.
    const sticky = !!(toast.actions?.length) || toast.progress !== undefined
    if (!sticky) {
      // Scale with length: a long sentence needs longer than "Copied".
      const ms = options.duration ?? Math.min(6000, Math.max(2200, String(message).length * 55))
      timers.current.set(id, setTimeout(() => dismiss(id), ms))
    }
    return id
  }, [dismiss])

  /** Patch a live toast — the progress path, and "done" messages. */
  const update = useCallback((id, patch = {}) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
    // A toast that has finished should behave like a normal one again.
    if (patch.progress === undefined && patch.done) {
      clearTimer(id)
      timers.current.set(id, setTimeout(() => dismiss(id), patch.duration ?? 2500))
    }
  }, [clearTimer, dismiss])

  /** Convenience for the commonest actionable case. */
  const showError = useCallback((message, onRetry) => show(message, {
    variant: 'error',
    actions: onRetry ? [{ label: 'Retry', onClick: onRetry, primary: true }] : undefined,
  }), [show])

  useEffect(() => {
    const t = timers.current
    return () => { for (const id of t.keys()) clearTimeout(t.get(id)); t.clear() }
  }, [])

  useEffect(() => {
    window.__YOGATIK_TOAST__ = { show, dismiss, update }
    return () => { window.__YOGATIK_TOAST__ = null }
  }, [show, dismiss, update])

  return (
    <ToastContext.Provider value={{ show, showError, dismiss, update, toasts }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.variant || 'info'}${t.actions?.length || t.progress !== undefined ? ' toast-interactive' : ''}`}
            role={t.variant === 'error' ? 'alert' : 'status'}
            aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
          >
            <div className="toast-body">
              <span className="toast-message">{t.message}</span>
              {t.actions?.length > 0 && (
                <span className="toast-actions">
                  {t.actions.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`toast-action${a.primary ? ' toast-action-primary' : ''}`}
                      onClick={() => {
                        try { a.onClick?.() }
                        catch (err) { console.error('Toast action error:', err) }
                        finally { if (a.keepOpen !== true) dismiss(t.id) }
                      }}
                    >{a.label}</button>
                  ))}
                  <button type="button" className="toast-action toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
                </span>
              )}
            </div>
            {t.progress !== undefined && (
              <div
                className={`toast-progress${t.progress === null ? ' toast-progress-indeterminate' : ''}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                {...(t.progress === null ? {} : { 'aria-valuenow': Math.round(t.progress * 100) })}
              >
                <div className="toast-progress-bar" style={t.progress === null ? undefined : { width: `${Math.max(0, Math.min(1, t.progress)) * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const NOOP_TOAST = {
  show: () => 'noop',
  success: () => 'noop',
  error: () => 'noop',
  warn: () => 'noop',
  info: () => 'noop',
  dismiss: () => {},
  update: () => {},
}

export function useToast() {
  const ctx = useContext(ToastContext)
  return ctx || NOOP_TOAST
}
