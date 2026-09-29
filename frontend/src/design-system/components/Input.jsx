/**
 * Input — Form input component built on design tokens
 */
import React, { forwardRef, useId } from 'react'
import { tokens } from '../tokens'

const baseStyles = {
  width: '100%',
  fontFamily: tokens.typography.fontFamily,
  fontSize: tokens.typography.size.sm,
  lineHeight: tokens.typography.leading.normal,
  color: tokens.colors.text,
  background: tokens.colors.panel,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radius.md,
  padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
  minHeight: 40,
  outline: 'none',
  transition: `border-color ${tokens.motion.fast}, box-shadow ${tokens.motion.fast}, background-color ${tokens.motion.fast}`,
  boxSizing: 'border-box',
}

const focusStyles = {
  borderColor: tokens.colors.accent,
  boxShadow: tokens.shadow.focus,
}

const errorStyles = {
  borderColor: tokens.colors.error,
  boxShadow: tokens.shadow.focusError,
}

const disabledStyles = {
  opacity: 0.5,
  cursor: 'not-allowed',
  background: tokens.colors.bgElevated,
}

const labelStyles = {
  display: 'block',
  fontSize: tokens.typography.size.xs,
  fontWeight: tokens.typography.weight.medium,
  color: tokens.colors.textSecondary,
  marginBottom: tokens.spacing[1],
}

const helperStyles = {
  display: 'block',
  fontSize: tokens.typography.size.xs,
  color: tokens.colors.textMuted,
  marginTop: tokens.spacing[1],
}

export const Input = forwardRef(function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  fullWidth = true,
  className = '',
  style = {},
  id: providedId,
  ...props
}, ref) {
  const generatedId = useId()
  const id = providedId || generatedId
  const errorId = error ? `${id}-error` : undefined
  const helperId = helperText && !error ? `${id}-helper` : undefined
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined

  const inputStyle = {
    ...baseStyles,
    ...(props.disabled && disabledStyles),
    ...style,
  }

  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }} className={className}>
      {label && (
        <label htmlFor={id} style={labelStyles}>
          {label}
          {props.required && <span style={{ color: tokens.colors.error, marginLeft: 4 }}>*</span>}
        </label>
      )}
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        {leftIcon && (
          <span
            style={{
              position: 'absolute',
              left: tokens.spacing[3],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tokens.colors.textMuted,
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          style={{
            ...inputStyle,
            paddingLeft: leftIcon ? tokens.spacing[8] : undefined,
            paddingRight: rightIcon ? tokens.spacing[8] : undefined,
          }}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          aria-required={props.required}
          {...props}
        />
        {rightIcon && (
          <span
            style={{
              position: 'absolute',
              right: tokens.spacing[3],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tokens.colors.textMuted,
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
        {props.loading && (
          <span
            style={{
              position: 'absolute',
              right: tokens.spacing[3],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tokens.colors.textMuted,
            }}
            aria-hidden="true"
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
              <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </svg>
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} style={{ ...helperStyles, color: tokens.colors.error }} role="alert">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} style={helperStyles}>{helperText}</p>
      )}
    </div>
  )
})

Input.displayName = 'Input'
export default Input
