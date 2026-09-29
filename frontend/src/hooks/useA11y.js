/**
 * useA11y — Accessibility utilities and live region management
 */
import { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react'

const A11yContext = createContext(null)

let announcementRegion = null
let assertiveRegion = null

function ensureRegions() {
  if (typeof document === 'undefined') return
  
  if (!announcementRegion) {
    announcementRegion = document.createElement('div')
    announcementRegion.setAttribute('role', 'status')
    announcementRegion.setAttribute('aria-live', 'polite')
    announcementRegion.setAttribute('aria-atomic', 'true')
    announcementRegion.style.position = 'absolute'
    announcementRegion.style.left = '-9999px'
    announcementRegion.style.width = '1px'
    announcementRegion.style.height = '1px'
    announcementRegion.style.overflow = 'hidden'
    document.body.appendChild(announcementRegion)
  }
  
  if (!assertiveRegion) {
    assertiveRegion = document.createElement('div')
    assertiveRegion.setAttribute('role', 'alert')
    assertiveRegion.setAttribute('aria-live', 'assertive')
    assertiveRegion.setAttribute('aria-atomic', 'true')
    assertiveRegion.style.position = 'absolute'
    assertiveRegion.style.left = '-9999px'
    assertiveRegion.style.width = '1px'
    assertiveRegion.style.height = '1px'
    assertiveRegion.style.overflow = 'hidden'
    document.body.appendChild(assertiveRegion)
  }
}

// Announce to screen readers
export function announce(message, priority = 'polite') {
  ensureRegions()
  const region = priority === 'assertive' ? assertiveRegion : announcementRegion
  if (region) {
    region.textContent = ''
    setTimeout(() => { region.textContent = message }, 0)
  }
}

export function announceAssertive(message) {
  announce(message, 'assertive')
}

// Focus management
export function trapFocus(element) {
  if (!element) return () => {}
  
  const focusable = element.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  
  function handleTab(e) {
    if (e.key !== 'Tab') return
    
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }
  
  element.addEventListener('keydown', handleTab)
  first?.focus()
  
  return () => element.removeEventListener('keydown', handleTab)
}

export function restoreFocus(element) {
  if (element && typeof element.focus === 'function') {
    setTimeout(() => element.focus(), 0)
  }
}

export function getFocusableChildren(element) {
  if (!element) return []
  return Array.from(element.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null)
}

// Reduced motion
export function useReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false)
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mediaQuery.matches)
    
    const handler = (e) => setPrefersReduced(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])
  
  return prefersReduced
}

// High contrast
export function useHighContrast() {
  const [prefersHighContrast, setPrefersHighContrast] = useState(false)
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)')
    setPrefersHighContrast(mediaQuery.matches)
    
    const handler = (e) => setPrefersHighContrast(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])
  
  return prefersHighContrast
}

// Color scheme
export function useColorScheme() {
  const [scheme, setScheme] = useState('dark')
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setScheme(mediaQuery.matches ? 'dark' : 'light')
    
    const handler = (e) => setScheme(e.matches ? 'dark' : 'light')
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])
  
  return scheme
}

// A11y Provider component
export function A11yProvider({ children }) {
  const [announcements, setAnnouncements] = useState([])
  
  useEffect(() => {
    ensureRegions()
  }, [])
  
  const announceToRegion = useCallback((message, priority = 'polite') => {
    announce(message, priority)
  }, [])
  
  return (
    <A11yContext.Provider value={{ announce: announceToRegion, assertive: (message) => announce(message, 'assertive') }}>
      {children}
    </A11yContext.Provider>
  )
}

export function useA11y() {
  const context = useContext(A11yContext)
  if (!context) {
    return {
      announce: (message, priority) => announce(message, priority),
      assertive: (message) => announceAssertive(message),
    }
  }
  return context
}

export default { announce, announceAssertive, trapFocus, restoreFocus, getFocusableChildren, useReducedMotion, useHighContrast, useColorScheme, A11yProvider, useA11y }
