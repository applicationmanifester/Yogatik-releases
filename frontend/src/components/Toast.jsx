import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, CheckCircle, AlertCircle, AlertTriangle, Info, Loader2, 
  ChevronRight, Bell, MessageSquare, Zap, Shield 
} from 'lucide-react';

const toastStyles = {
  container: {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
    maxWidth: '420px',
  },
  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px 16px',
    background: 'var(--bg-elevated, #ffffff)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
    pointerEvents: 'auto',
    animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    minWidth: '300px',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  toastExiting: {
    animation: 'slideOut 0.2s ease-in forwards',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: '3px',
    background: 'var(--accent-color, #3b82f6)',
    borderRadius: '0 0 12px 12px',
    transition: 'width linear',
    transformOrigin: 'left',
  },
  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '24px',
    height: '24px',
    borderRadius: '8px',
    marginTop: '2px',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary, #111827)',
    marginBottom: '2px',
    lineHeight: 1.3,
  },
  message: {
    fontSize: '13px',
    color: 'var(--text-secondary, #6b7280)',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-tertiary, #9ca3af)',
    transition: 'all 0.15s ease',
    flexShrink: 0,
    marginTop: '-2px',
    marginRight: '-4px',
  },
  closeBtnHover: {
    background: 'var(--bg-hover, #f3f4f6)',
    color: 'var(--text-primary, #111827)',
  },
  actionBtn: {
    marginTop: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--accent-color, #3b82f6)',
    background: 'var(--accent-bg, #eff6ff)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  actionBtnHover: {
    background: 'var(--accent-hover, #dbeafe)',
  },
  // Type-specific styles
  success: { borderLeft: '4px solid #10b981' },
  error: { borderLeft: '4px solid #ef4444' },
  warning: { borderLeft: '4px solid #f59e0b' },
  info: { borderLeft: '4px solid #3b82f6' },
  loading: { borderLeft: '4px solid #8b5cf6' },
  action: { borderLeft: '4px solid #ec4899' },
  // Icon colors
  iconSuccess: { background: '#ecfdf5', color: '#10b981' },
  iconError: { background: '#fef2f2', color: '#ef4444' },
  iconWarning: { background: '#fffbeb', color: '#f59e0b' },
  iconInfo: { background: '#eff6ff', color: '#3b82f6' },
  iconLoading: { background: '#f5f3ff', color: '#8b5cf6' },
  iconAction: { background: '#fdf2f8', color: '#ec4899' },
};

const keyframes = `
@keyframes slideIn {
  from { opacity: 0; transform: translateX(100%) scale(0.95); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes slideOut {
  from { opacity: 1; transform: translateX(0) scale(1); }
  to { opacity: 0; transform: translateX(100%) scale(0.95); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;

function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('toast-keyframes')) return;
  
  const style = document.createElement('style');
  style.id = 'toast-keyframes';
  style.textContent = keyframes;
  document.head.appendChild(style);
}

if (typeof window !== 'undefined') {
  injectKeyframes();
}

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
  action: Zap,
};

const ICON_STYLES = {
  success: toastStyles.iconSuccess,
  error: toastStyles.iconError,
  warning: toastStyles.iconWarning,
  info: toastStyles.iconInfo,
  loading: toastStyles.iconLoading,
  action: toastStyles.iconAction,
};

const DEFAULT_DURATION = 5000;

export function Toast({ 
  id, 
  type = 'info', 
  title, 
  message, 
  duration = DEFAULT_DURATION, 
  onClose, 
  action, 
  dismissible = true,
  progress = true,
  ...props 
}) {
  const [exiting, setExiting] = useState(false);
  const [progressWidth, setProgressWidth] = useState(100);
  const [hovered, setHovered] = useState(false);
  const progressRef = useRef(null);
  const timeoutRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const pausedRef = useRef(false);

  const Icon = ICONS[type] || Info;
  const iconStyle = ICON_STYLES[type] || toastStyles.iconInfo;
  const typeStyle = toastStyles[type] || {};

  const close = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTimeout(() => onClose?.(id), 200);
  }, [id, onClose, exiting]);

  const pauseTimer = useCallback(() => {
    if (!progress || duration <= 0) return;
    pausedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const elapsed = Date.now() - startTimeRef.current;
    progressRef.current = { elapsed, duration };
    if (progressRef.current) {
      const remaining = duration - elapsed;
      setProgressWidth((remaining / duration) * 100);
    }
  }, [duration, progress]);

  const resumeTimer = useCallback(() => {
    if (!progress || duration <= 0 || !pausedRef.current) return;
    pausedRef.current = false;
    const { elapsed } = progressRef.current || { elapsed: 0 };
    const remaining = Math.max(0, duration - elapsed);
    startTimeRef.current = Date.now() - elapsed;
    
    const animateProgress = () => {
      if (pausedRef.current || exiting) return;
      const now = Date.now();
      const elapsedTotal = now - startTimeRef.current;
      const width = Math.max(0, ((duration - elapsedTotal) / duration) * 100);
      setProgressWidth(width);
      if (width > 0) {
        requestAnimationFrame(animateProgress);
      }
    };
    
    if (remaining > 0) {
      timeoutRef.current = setTimeout(close, remaining);
      requestAnimationFrame(animateProgress);
    }
  }, [close, duration, exiting, progress]);

  useEffect(() => {
    if (duration > 0 && progress) {
      startTimeRef.current = Date.now();
      const animateProgress = () => {
        if (pausedRef.current || exiting) return;
        const elapsed = Date.now() - startTimeRef.current;
        const width = Math.max(0, ((duration - elapsed) / duration) * 100);
        setProgressWidth(width);
        if (width > 0) {
          requestAnimationFrame(animateProgress);
        }
      };
      requestAnimationFrame(animateProgress);
      timeoutRef.current = setTimeout(close, duration);
    } else if (duration > 0) {
      timeoutRef.current = setTimeout(close, duration);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [close, duration, progress, exiting]);

  if (exiting) {
    return (
      <div 
        style={{ ...toastStyles.toast, ...toastStyles.toastExiting, ...typeStyle, ...props.style }}
        onMouseEnter={pauseTimer}
        onMouseLeave={resumeTimer}
        role="alert"
        aria-live={type === 'error' ? 'assertive' : 'polite'}
        {...props}
      >
        <div style={{ ...toastStyles.iconWrapper, ...iconStyle }}>
          <Icon size={16} strokeWidth={2.5} />
        </div>
        <div style={toastStyles.content}>
          {title && <div style={toastStyles.title}>{title}</div>}
          {message && <div style={toastStyles.message}>{message}</div>}
          {action && (
            <button 
              style={toastStyles.actionBtn}
              onClick={(e) => { e.stopPropagation(); action.onClick(); close(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = toastStyles.actionBtnHover.background}
              onMouseLeave={(e) => e.currentTarget.style.background = toastStyles.actionBtn.background}
            >
              {action.label}
            </button>
          )}
        </div>
        {dismissible && (
          <button 
            style={toastStyles.closeBtn}
            onClick={(e) => { e.stopPropagation(); close(); }}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, toastStyles.closeBtnHover)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-tertiary, #9ca3af)' })}
            aria-label="Dismiss"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
        {progress && duration > 0 && (
          <div 
            style={{ ...toastStyles.progressBar, width: `${progressWidth}%` }} 
            role="progressbar" 
            aria-valuenow={Math.round(progressWidth)} 
            aria-valuemin={0} 
            aria-valuemax={100}
          />
        )}
      </div>
    );
  }

  return (
    <div 
      style={{ ...toastStyles.toast, ...typeStyle, ...props.style }}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      {...props}
    >
      <div style={{ ...toastStyles.iconWrapper, ...iconStyle }}>
        {type === 'loading' ? (
          <Icon size={16} strokeWidth={2.5} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <Icon size={16} strokeWidth={2.5} />
        )}
      </div>
      <div style={toastStyles.content}>
        {title && <div style={toastStyles.title}>{title}</div>}
        {message && <div style={toastStyles.message}>{message}</div>}
        {action && (
          <button 
            style={toastStyles.actionBtn}
            onClick={(e) => { e.stopPropagation(); action.onClick(); close(); }}
            onMouseEnter={(e) => e.currentTarget.style.background = toastStyles.actionBtnHover.background}
            onMouseLeave={(e) => e.currentTarget.style.background = toastStyles.actionBtn.background}
          >
            {action.label}
          </button>
        )}
      </div>
      {dismissible && (
        <button 
          style={toastStyles.closeBtn}
          onClick={(e) => { e.stopPropagation(); close(); }}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, toastStyles.closeBtnHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-tertiary, #9ca3af)' })}
          aria-label="Dismiss"
        >
          <X size={16} strokeWidth={2} />
        </button>
      )}
      {progress && duration > 0 && (
        <div 
          style={{ ...toastStyles.progressBar, width: `${progressWidth}%` }} 
          role="progressbar" 
          aria-valuenow={Math.round(progressWidth)} 
          aria-valuemin={0} 
          aria-valuemax={100}
        />
      )}
    </div>
  );
}

Toast.displayName = 'Toast';

export function ToastContainer({ 
  toasts = [], 
  onClose, 
  position = 'top-right',
  maxToasts = 5,
  ...props 
}) {
  const containerPositions = {
    'top-right': { top: '16px', right: '16px', bottom: 'auto', left: 'auto', flexDirection: 'column' },
    'top-left': { top: '16px', left: '16px', bottom: 'auto', right: 'auto', flexDirection: 'column' },
    'bottom-right': { bottom: '16px', right: '16px', top: 'auto', left: 'auto', flexDirection: 'column-reverse' },
    'bottom-left': { bottom: '16px', left: '16px', top: 'auto', right: 'auto', flexDirection: 'column-reverse' },
    'top-center': { top: '16px', left: '50%', transform: 'translateX(-50%)', bottom: 'auto', right: 'auto', flexDirection: 'column' },
    'bottom-center': { bottom: '16px', left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto', flexDirection: 'column-reverse' },
  };

  const posStyle = containerPositions[position] || containerPositions['top-right'];

  const visibleToasts = toasts.slice(-maxToasts);

  return (
    <div 
      style={{ 
        ...toastStyles.container, 
        ...posStyle,
        ...props.style 
      }}
      {...props}
    >
      {visibleToasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          duration={toast.duration}
          action={toast.action}
          dismissible={toast.dismissible !== false}
          progress={toast.progress !== false}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

ToastContainer.displayName = 'ToastContainer';

// Hook for easy toast management
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = toast.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = useCallback((title, message, options = {}) => 
    addToast({ type: 'success', title, message, ...options }), [addToast]);
  
  const error = useCallback((title, message, options = {}) => 
    addToast({ type: 'error', title, message, duration: 8000, ...options }), [addToast]);
  
  const warning = useCallback((title, message, options = {}) => 
    addToast({ type: 'warning', title, message, ...options }), [addToast]);
  
  const info = useCallback((title, message, options = {}) => 
    addToast({ type: 'info', title, message, ...options }), [addToast]);
  
  const loading = useCallback((title, message, options = {}) => 
    addToast({ type: 'loading', title, message, duration: 0, dismissible: false, ...options }), [addToast]);
  
  const action = useCallback((title, message, action, options = {}) => 
    addToast({ type: 'action', title, message, action, ...options }), [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    updateToast,
    clearAll,
    success,
    error,
    warning,
    info,
    loading,
    action,
  };
}

export default ToastContainer;