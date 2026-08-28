import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState([])
  const timerIdsRef = useRef<number[]>([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message, options = {}) => {
    const id = Date.now() + Math.random()
    const toast = { id, message, ...options }
    setToasts(prev => [...prev, toast])

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

  // Expose to window for desktop bridge
  useEffect(() => {
    window.__YOGATIK_TOAST__ = { show, dismiss }
    return () => {
      window.__YOGATIK_TOAST__ = null
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

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// Export `toast` as an alias for `show` for convenience
export const toast = (message: string, options?: { duration?: number; type?: 'success' | 'error' | 'info' }) => {
  // This will be set by ToastProvider via window.__YOGATIK_TOAST__
  if (typeof window !== 'undefined' && window.__YOGATIK_TOAST__) {
    return window.__YOGATIK_TOAST__.show(message, options)
  }
  // Fallback: console.warn if used outside provider
  console.warn('Toast not available: ToastProvider not mounted')
  return null
}