import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Toast from './Toast';

const POSITIONS = {
  'top-right': { top: '24px', right: '24px', left: 'auto', bottom: 'auto', flexDirection: 'column-reverse' },
  'top-left': { top: '24px', left: '24px', right: 'auto', bottom: 'auto', flexDirection: 'column-reverse' },
  'bottom-right': { bottom: '24px', right: '24px', left: 'auto', top: 'auto', flexDirection: 'column' },
  'bottom-left': { bottom: '24px', left: '24px', right: 'auto', top: 'auto', flexDirection: 'column' },
  'top-center': { top: '24px', left: '50%', transform: 'translateX(-50%)', right: 'auto', bottom: 'auto', flexDirection: 'column-reverse' },
  'bottom-center': { bottom: '24px', left: '50%', transform: 'translateX(-50%)', right: 'auto', top: 'auto', flexDirection: 'column' },
};

const containerStyles = {
  wrapper: {
    position: 'fixed',
    zIndex: 9999,
    pointerEvents: 'none',
    display: 'flex',
    gap: '12px',
    padding: '8px',
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    width: '100%',
    maxWidth: '460px',
    boxSizing: 'border-box',
  },
  toast: {
    pointerEvents: 'auto',
    width: '100%',
  },
};

let toastId = 0;
const generateId = () => `toast-${Date.now()}-${++toastId}`;

const defaultOptions = {
  position: 'top-right',
  maxToasts: 5,
  gap: 12,
  pauseOnHover: true,
};

function ToastContainer({ 
  position = 'top-right', 
  maxToasts = 5, 
  onAllClosed,
  children 
}) {
  const [toasts, setToasts] = useState([]);
  const containerRef = useRef(null);
  const timeoutsRef = useRef(new Map());

  const posStyle = POSITIONS[position] || POSITIONS['top-right'];

  const removeToast = useCallback((id) => {
    setToasts(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0 && onAllClosed) onAllClosed();
      return next;
    });
    timeoutsRef.current.delete(id);
  }, [onAllClosed]);

  const addToast = useCallback((toast) => {
    const id = toast.id || generateId();
    const newToast = { 
      ...toast, 
      id,
      duration: toast.duration ?? 5000,
      persistent: toast.persistent ?? false,
    };

    setToasts(prev => {
      const limited = [...prev, newToast].slice(-maxToasts);
      return limited;
    });

    if (!newToast.persistent && newToast.type !== 'loading') {
      const timeout = setTimeout(() => removeToast(id), newToast.duration);
      timeoutsRef.current.set(id, timeout);
    }

    return id;
  }, [maxToasts, removeToast]);

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current.clear();
    if (onAllClosed) onAllClosed();
  }, [onAllClosed]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const api = {
    success: (title, message, options = {}) => addToast({ type: 'success', title, message, ...options }),
    error: (title, message, options = {}) => addToast({ type: 'error', title, message, ...options }),
    warning: (title, message, options = {}) => addToast({ type: 'warning', title, message, ...options }),
    info: (title, message, options = {}) => addToast({ type: 'info', title, message, ...options }),
    loading: (title, message, options = {}) => addToast({ type: 'loading', title, message, persistent: true, ...options }),
    dismiss: removeToast,
    dismissAll,
    update: updateToast,
  };

  if (children) {
    return children(api);
  }

  return createPortal(
    <div
      ref={containerRef}
      style={{
        ...containerStyles.wrapper,
        ...posStyle,
      }}
      aria-live="polite"
      aria-atomic="true"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <div key={toast.id} style={containerStyles.toast}>
          <Toast toast={toast} onClose={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export default ToastContainer;