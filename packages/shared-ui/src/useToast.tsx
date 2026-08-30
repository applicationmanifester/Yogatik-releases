import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

export interface ToastItem {
  id: number
  message: string
  duration?: number
  type?: 'success' | 'error' | 'info'
  [key: string]: unknown
}

export interface ToastContextValue {
  show: (message: string, options?: Partial<ToastItem>) => number
  dismiss: (id: number | string) => void
  toasts: ToastItem[]
}

declare global {
  interface Window {
    __YOGATIK_TOAST__?: {
      show: (msg: unknown, opts?: Record<string, unknown>) => number | void
      dismiss: (id: unknown) => void
    }
  }
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerIdsRef = useRef<number[]>([])

  const dismiss = useCallback((id: number | string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message: string, options: Partial<ToastItem> = {}) => {
    const id = Date.now() + Math.random()
    const toastItem: ToastItem = { id, message, ...options }
    setToasts(prev => [...prev, toastItem])

    const duration = options.duration ?? 3000
    const timerId = window.setTimeout(() => {
      dismiss(id)
      timerIdsRef.current = timerIdsRef.current.filter(t => t !== timerId)
    }, duration)
    timerIdsRef.current.push(timerId)

    return id
  }, [dismiss])

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach(timerId => clearTimeout(timerId))
      timerIdsRef.current = []
    }
  }, [])

  // Expose to window for desktop bridge with frozen descriptor and input validation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        Object.defineProperty(window, '__YOGATIK_TOAST__', {
          value: Object.freeze({
            show: (msg: unknown, opts: Record<string, unknown> = {}) => {
              if (typeof msg === 'string') return show(msg, opts)
            },
            dismiss: (id: unknown) => {
              if (typeof id === 'number' || typeof id === 'string') dismiss(id)
            }
          }),
          configurable: true,
          writable: false,
        })
      } catch {}
    }
    return () => {
      try {
        delete (window as unknown as Record<string, unknown>).__YOGATIK_TOAST__
      } catch {}
    }
  }, [show, dismiss])

  return (
    <ToastContext.Provider value={{ show, dismiss, toasts }}>
      {children}
      <div className="toast-container" role="region" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="toast" role="alert">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// Export `toast` as an alias for `show` for convenience
export const toast = (message: string, options?: Partial<ToastItem>) => {
  // This will be set by ToastProvider via window.__YOGATIK_TOAST__
  if (typeof window !== 'undefined' && window.__YOGATIK_TOAST__) {
    return window.__YOGATIK_TOAST__.show(message, options)
  }
  // Fallback: console.warn if used outside provider
  console.warn('Toast not available: ToastProvider not mounted')
  return null
}