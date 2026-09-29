/**
 * Yogatik Design System Tokens
 * Single source of truth for colors, spacing, typography, motion, shadows, radius.
 * All components should import from here instead of hardcoding values.
 */
export const tokens = {
  colors: {
    // Base
    bg: '#0a0e14',
    bgElevated: '#0f1520',
    panel: '#121824',
    panelHover: '#1a2234',
    border: 'rgba(255,255,255,0.08)',
    borderFocus: 'rgba(99, 102, 241, 0.5)',
    
    // Text
    text: '#e8edf4',
    textSecondary: '#93a0b4',
    textMuted: '#6b7a94',
    textInverse: '#0a0e14',
    
    // Brand
    brand: '#ff6b35',
    brandHover: '#ff9142',
    brandLight: 'rgba(255, 107, 53, 0.12)',
    brandMedium: 'rgba(255, 107, 53, 0.25)',
    brandStrong: 'rgba(255, 107, 53, 0.4)',
    
    // Semantic
    success: '#10b981',
    successLight: 'rgba(16, 185, 129, 0.12)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.12)',
    error: '#ef4444',
    errorLight: 'rgba(239, 68, 68, 0.12)',
    info: '#38bdf8',
    infoLight: 'rgba(56, 189, 248, 0.12)',
    
    // Accent (purple)
    accent: '#6366f1',
    accentHover: '#818cf8',
    accentLight: 'rgba(99, 102, 241, 0.12)',
    
    // Overlay
    overlay: 'rgba(0, 0, 0, 0.6)',
    overlayStrong: 'rgba(0, 0, 0, 0.8)',
  },
  
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
  },
  
  radius: {
    none: 0,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    '2xl': 24,
    full: 9999,
  },
  
  shadow: {
    none: 'none',
    sm: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
    md: '0 4px 12px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)',
    lg: '0 12px 28px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15)',
    xl: '0 20px 40px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.18)',
    focus: '0 0 0 3px rgba(99, 102, 241, 0.45)',
    focusError: '0 0 0 3px rgba(239, 68, 68, 0.45)',
  },
  
  motion: {
    fast: '100ms cubic-bezier(0.2, 0, 0, 1)',
    base: '180ms cubic-bezier(0.16, 1, 0.3, 1)',
    slow: '280ms cubic-bezier(0.16, 1, 0.3, 1)',
    spring: '350ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    
    // Font sizes (px)
    size: {
      xs: 11,
      sm: 13,
      base: 15,
      lg: 17,
      xl: 20,
      '2xl': 26,
      '3xl': 32,
      '4xl': 40,
    },
    
    // Font weights
    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    
    // Line heights
    leading: {
      tight: 1.15,
      snug: 1.35,
      normal: 1.55,
      relaxed: 1.75,
    },
    
    // Letter spacing
    tracking: {
      tight: '-0.02em',
      normal: '0',
      wide: '0.02em',
    },
  },
  
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 300,
    popover: 400,
    tooltip: 500,
    toast: 600,
    max: 9999,
  },
  
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
}

// CSS custom property generator for :root
export function generateCSSVariables(tokens) {
  const css = {}
  
  // Flatten tokens to CSS custom properties
  function flatten(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const propName = prefix ? `--${prefix}-${key}` : `--${key}`
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, prefix ? `${prefix}-${key}` : key)
      } else {
        css[propName] = value
      }
    }
  }
  
  flatten(tokens.colors, 'color')
  flatten(tokens.spacing, 'space')
  flatten(tokens.radius, 'radius')
  flatten(tokens.shadow, 'shadow')
  flatten(tokens.motion, 'motion')
  flatten(tokens.typography.size, 'text')
  flatten(tokens.typography.weight, 'font')
  flatten(tokens.typography.leading, 'leading')
  flatten(tokens.typography.tracking, 'tracking')
  flatten(tokens.zIndex, 'z')
  
  return css
}

export const cssVariables = generateCSSVariables(tokens)

export default tokens
