import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, options = {}) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, ...options };
    setToasts(prev => [...prev, toast]);

    const duration = options.duration ?? 3000;
    setTimeout(() => dismiss(id), duration);

    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Expose to window for desktop bridge
  useEffect(() => {
    window.__YOGATIK_TOAST__ = { show, dismiss };
    return () => { window.__YOGATIK_TOAST__ = null; };
  }, [show, dismiss]);

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
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}