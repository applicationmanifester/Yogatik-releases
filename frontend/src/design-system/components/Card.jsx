/**
 * Card — Container component built on design tokens
 */
import React, { forwardRef } from 'react'
import { tokens } from '../tokens'

const baseStyles = {
  background: `linear-gradient(180deg, ${tokens.colors.panel}, ${tokens.colors.bgElevated})`,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radius.lg,
  boxSizing: 'border-box',
  transition: `border-color ${tokens.motion.base}, box-shadow ${tokens.motion.base}, transform ${tokens.motion.base}`,
}

const variantStyles = {
  default: {},
  elevated: { boxShadow: tokens.shadow.md },
  outlined: { borderWidth: 2 },
  interactive: {
    cursor: 'pointer',
    '&:hover': { 
      borderColor: `color-mix(in srgb, ${tokens.colors.brand} 35%, ${tokens.colors.border})`,
      boxShadow: tokens.shadow.md,
      transform: 'translateY(-2px)',
    },
  },
}

const paddingStyles = {
  none: { padding: 0 },
  sm: { padding: tokens.spacing[3] },
  md: { padding: tokens.spacing[4] },
  lg: { padding: tokens.spacing[6] },
  xl: { padding: tokens.spacing[8] },
}

export const Card = forwardRef(function Card({
  children,
  variant = 'default',
  padding = 'md',
  hoverable = false,
  className = '',
  style = {},
  onClick,
  ...props
}, ref) {
  const combinedStyle = {
    ...baseStyles,
    ...variantStyles[variant],
    ...paddingStyles[padding],
    ...(hoverable && variantStyles.interactive),
    ...style,
  }

  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      ref={ref}
      className={className}
      style={combinedStyle}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...(onClick ? { tabIndex: 0, role: 'button' } : {})}
      {...props}
    >
      {children}
    </Component>
  )
})

Card.displayName = 'Card'

// Card sub-components
export const CardHeader = forwardRef(function CardHeader({ children, className = '', style = {}, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={className}
      style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.spacing[4], marginBottom: tokens.spacing[3], ...style }}
      {...props}
    >
      {children}
    </div>
  )
})
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef(function CardTitle({ children, className = '', style = {}, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={className}
      style={{ fontSize: tokens.typography.size.lg, fontWeight: tokens.typography.weight.bold, color: tokens.colors.text, margin: 0, lineHeight: tokens.typography.leading.tight, ...style }}
      {...props}
    >
      {children}
    </h3>
  )
})
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef(function CardDescription({ children, className = '', style = {}, ...props }, ref) {
  return (
    <p
      ref={ref}
      className={className}
      style={{ fontSize: tokens.typography.size.sm, color: tokens.colors.textSecondary, margin: `${tokens.spacing[1]} 0 0`, lineHeight: tokens.typography.leading.normal, ...style }}
      {...props}
    >
      {children}
    </p>
  )
})
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef(function CardContent({ children, className = '', style = {}, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style }}
      {...props}
    >
      {children}
    </div>
  )
})
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef(function CardFooter({ children, className = '', style = {}, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: tokens.spacing[2], paddingTop: tokens.spacing[3], marginTop: tokens.spacing[3], borderTop: `1px solid ${tokens.colors.border}`, ...style }}
      {...props}
    >
      {children}
    </div>
  )
})
CardFooter.displayName = 'CardFooter'

export default Card
