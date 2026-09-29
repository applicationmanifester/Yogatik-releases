/**
 * Button — Primary interactive component built on design tokens
 * Replaces 15+ inline button styles across the codebase
 */
import React, { forwardRef } from 'react'
import { tokens } from '../tokens'

const baseStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: tokens.spacing[2],
  fontFamily: tokens.typography.fontFamily,
  fontSize: tokens.typography.size.sm,
  fontWeight: tokens.typography.weight.medium,
  lineHeight: tokens.typography.leading.normal,
  borderRadius: tokens.radius.md,
  border: 'none',
  cursor: 'pointer',
  transition: `background-color ${tokens.motion.fast}, color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast}, transform ${tokens.motion.fast}, border-color ${tokens.motion.fast}`,
  whiteSpace: 'nowrap',
  userSelect: 'none',
  outline: 'none',
}

const sizeStyles = {
  sm: { padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`, minHeight: 32, fontSize: tokens.typography.size.xs },
  md: { padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`, minHeight: 40, fontSize: tokens.typography.size.sm },
  lg: { padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`, minHeight: 48, fontSize: tokens.typography.size.base },
}

const variantBaseStyles = {
  primary: {
    background: `linear-gradient(135deg, ${tokens.colors.brand}, ${tokens.colors.brandHover})`,
    color: tokens.colors.textInverse,
    boxShadow: `0 4px 16px ${tokens.colors.brandMedium}`,
  },
  secondary: {
    background: tokens.colors.panel,
    color: tokens.colors.text,
    border: `1px solid ${tokens.colors.border}`,
  },
  ghost: {
    background: 'transparent',
    color: tokens.colors.text,
  },
  danger: {
    background: tokens.colors.errorLight,
    color: tokens.colors.error,
  },
  outline: {
    background: 'transparent',
    color: tokens.colors.text,
    border: `1px solid ${tokens.colors.border}`,
  },
}

const disabledStyles = {
  opacity: 0.45,
  cursor: 'not-allowed',
  transform: 'none',
}

function getVariantStyles(variant, disabled) {
  const base = variantBaseStyles[variant] || variantBaseStyles.secondary
  if (disabled) return { ...base, ...disabledStyles }
  return base
}

export const Button = forwardRef(function Button({
  children,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  onClick,
  type = 'button',
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...props
}, ref) {
  const combinedStyle = {
    ...baseStyles,
    ...sizeStyles[size],
    ...getVariantStyles(variant, disabled),
    width: fullWidth ? '100%' : 'auto',
    opacity: loading ? 0.8 : undefined,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    ...style,
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={className}
      style={combinedStyle}
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          style={{ animation: 'spin 1s linear infinite' }}
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="31.4 31.4"
          />
        </svg>
      )}
      {!loading && leftIcon && <span style={{ display: 'flex' }}>{leftIcon}</span>}
      <span>{children}</span>
      {!loading && rightIcon && <span style={{ display: 'flex' }}>{rightIcon}</span>}
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </button>
  )
})

Button.displayName = 'Button'

export default Button
