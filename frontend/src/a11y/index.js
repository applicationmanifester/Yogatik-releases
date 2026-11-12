const ANNOUNCER_ID = 'yogatik-a11y-announcer'
const ASSERTIVE_ID = 'yogatik-a11y-announcer-assertive'

function getAnnouncer(id, live = 'polite') {
  if (typeof document === 'undefined') return null
  let region = document.getElementById(id)
  if (!region) {
    region = document.createElement('div')
    region.id = id
    region.className = 'sr-only'
    region.setAttribute('role', live === 'assertive' ? 'alert' : 'status')
    region.setAttribute('aria-live', live)
    region.setAttribute('aria-atomic', 'true')
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    })
    document.body.appendChild(region)
  }
  return region
}

export function initAnnouncer() {
  getAnnouncer(ANNOUNCER_ID)
  getAnnouncer(ASSERTIVE_ID, 'assertive')
}

function announceIn(id, message, live) {
  const region = getAnnouncer(id, live)
  if (!region) return
  // Clear first so repeated messages are announced again by assistive tech.
  region.textContent = ''
  requestAnimationFrame(() => { region.textContent = String(message || '') })
}

export function announce(message) {
  announceIn(ANNOUNCER_ID, message, 'polite')
}

export function announceAssertive(message) {
  announceIn(ASSERTIVE_ID, message, 'assertive')
}

export function saveFocus() {
  return typeof document === 'undefined' ? null : document.activeElement
}

export function restoreFocus(element) {
  if (element && typeof element.focus === 'function' && element.isConnected) element.focus()
}

export function focusFirst(container) {
  const first = container?.querySelector(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  first?.focus()
  return first || null
}

export function trapFocus(container) {
  if (!container) return () => {}
  const handleKeyDown = (event) => {
    if (event.key !== 'Tab') return
    const items = [...container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(item => item.getAttribute('aria-hidden') !== 'true')
    if (!items.length) {
      event.preventDefault()
      container.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }
  container.addEventListener('keydown', handleKeyDown)
  return () => container.removeEventListener('keydown', handleKeyDown)
}

export function createSkipLink(targetId = 'main-content') {
  const link = document.createElement('a')
  link.href = `#${targetId}`
  link.textContent = 'Skip to main content'
  link.className = 'skip-link'
  link.addEventListener('click', (event) => {
    const target = document.getElementById(targetId)
    if (!target) return
    event.preventDefault()
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start' })
  })
  return link
}

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
export const prefersHighContrast = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches

export function createArrowNavigation(items, { orientation = 'horizontal', loop = true } = {}) {
  return (event) => {
    const elements = (Array.isArray(items) ? items : [...(items?.current || [])]).filter(Boolean)
    if (!elements.length) return
    const keys = orientation === 'vertical'
      ? { next: 'ArrowDown', previous: 'ArrowUp' }
      : { next: 'ArrowRight', previous: 'ArrowLeft' }
    const currentIndex = Math.max(0, elements.indexOf(document.activeElement))
    let nextIndex
    if (event.key === keys.next) nextIndex = currentIndex + 1
    else if (event.key === keys.previous) nextIndex = currentIndex - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = elements.length - 1
    else return
    event.preventDefault()
    if (loop) nextIndex = (nextIndex + elements.length) % elements.length
    else nextIndex = Math.max(0, Math.min(elements.length - 1, nextIndex))
    elements[nextIndex]?.focus()
  }
}

export function LiveRegion({ message, priority = 'polite', atomic = true }) {
  return {
    role: priority === 'assertive' ? 'alert' : 'status',
    'aria-live': priority,
    'aria-atomic': atomic,
    className: 'sr-only',
    children: message,
  }
}

export default {
  initAnnouncer, announce, announceAssertive, trapFocus, restoreFocus, saveFocus,
  focusFirst, createSkipLink, prefersReducedMotion, prefersHighContrast,
  createArrowNavigation, LiveRegion,
}
