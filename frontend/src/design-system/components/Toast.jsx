/**
 * Toast — Notification component built on design tokens
 */
import React from 'react'
import { tokens } from '../tokens'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

const containerStyles = {
  position: 'fixed',
  bottom: tokens.spacing[4],
  right: tokens.spacing[4],
  zIndex: tokens.zIndex.toast,
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.spacing[2],
  pointerEvents: 'none',
  maxWidth: '420px',
}

const baseToastStyles = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: tokens.spacing[3],
  padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`,
  borderRadius: tokens.radius.lg,
  boxShadow: tokens.shadow.xl,
  border: `1px solid ${tokens.colors.border}`,
  animation: `slideInRight ${tokens.motion.spring}`,
  pointerEvents: 'auto',
  minWidth: 280,
  maxWidth: '100%',
}

const variantStyles = {
  info: {
    background: tokens.colors.panel,
    borderColor: `color-mix(in srgb, ${tokens.colors.info} 30%, ${tokens.colors.border})`,
    color: tokens.colors.text,
  },
  success: {
    background: tokens.colors.panel,
    borderColor: `color-mix(in srgb, ${tokens.colors.success} 30%, ${tokens.colors.border})`,
    color: tokens.colors.text,
  },
  warning: {
    background: tokens.colors.panel,
    borderColor: `color-mix(in srgb, ${tokens.colors.warning} 30%, ${tokens.colors.border})`,
    color: tokens.colors.text,
  },
  error: {
    background: tokens.colors.panel,
    borderColor: `color-mix(in srgb, ${tokens.colors.error} 30%, ${tokens.colors.border})`,
    color: tokens.colors.text,
  },
}

const iconStyles = {
  flexShrink: 0,
  marginTop: 2,
}

const messageStyles = {
  flex: 1,
  fontSize: tokens.typography.size.sm,
  lineHeight: tokens.typography.leading.normal,
  wordBreak: 'break-word',
}

const actionsStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing[1],
  marginLeft: tokens.spacing[2],
  flexShrink: 0,
}

const actionButtonStyles = {
  padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
  fontSize: tokens.typography.size.xs,
  fontWeight: tokens.typography.weight.medium,
  fontFamily: tokens.typography.fontFamily,
  borderRadius: tokens.radius.sm,
  border: 'none',
  cursor: 'pointer',
  transition: `background-color ${tokens.motion.fast}`,
}

const primaryActionStyles = {
  ...actionButtonStyles,
  background: tokens.colors.accent,
  color: '#fff',
}

const secondaryActionStyles = {
  ...actionButtonStyles,
  background: tokens.colors.bgElevated,
  color: tokens.colors.text,
  border: `1px solid ${tokens.colors.border}`,
}

const dismissButtonStyles = {
  ...actionButtonStyles,
  background: 'transparent',
  color: tokens.colors.textMuted,
  padding: tokens.spacing[1],
  lineHeight: 1,
}

const progressStyles = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  height: 3,
  borderRadius: `0 0 ${tokens.radius.lg} ${tokens.radius.lg}`,
  transition: 'width 0.1s linear',
}

const variantProgressColors = {
  info: tokens.colors.info,
  success: tokens.colors.success,
  warning: tokens.colors.warning,
  error: tokens.colors.error,
}

export function Toast({ toast, onDismiss, onAction }) {
  const { id, message, variant = 'info', actions = [], progress, done } = toast
  const style = { ...baseToastStyles, ...variantStyles[variant] }
  
  const IconComponent = {
    info: Info,
    success: CheckCircle2,
    warning: AlertCircle,
    error: AlertCircle,
  }[variant] || Info

  return (
    <div
      style={style}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      data-toast-id={id}
    >
      <IconComponent size={18} style={{ ...iconStyles, color: variantProgressColors[variant] }} aria-hidden="true" />
      <span style={messageStyles}>{message}</span>
      
      {(actions.length > 0 || progress !== undefined) && (
        <div style={actionsStyles}>
          {actions.map((action, index) => (
            <button
              key={index}
              style={action.primary ? primaryActionStyles : secondaryActionStyles}
              onClick={() => {
                try { action.onClick?.() }
                catch (err) { console.error('Toast action error:', err) }
                finally { if (action.keepOpen !== true) onDismiss(id) }
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            style={dismissButtonStyles}
            onClick={() => onDismiss(id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {progress !== undefined && (
        <div
          style={{
            ...progressStyles,
            width: progress === null ? '100%' : `${Math.max(0, Math.min(100, progress * 100))}%`,
            background: variantProgressColors[variant],
            animation: progress === null ? 'indeterminate 1.5s ease-in-out infinite' : 'none',
          }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
        />
      )}
      
      <style jsx>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes indeterminate {
          0% { transform: translateX(-100%) scaleX(0.3); }
          50% { transform: translateX(0) scaleX(0.6); }
          100% { transform: translateX(200%) scaleX(0.3); }
        }
      `}</style>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={containerStyles} aria-live="polite" aria-atomic="false">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

export default ToastContainer
