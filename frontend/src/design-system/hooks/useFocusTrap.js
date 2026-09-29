import { useEffect, useRef } from 'react'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * useFocusTrap — Traps Tab navigation inside a modal while it is open.
 *
 * Shared design-system hook. Also wires Escape to onEscape (replacing the
 * per-modal keydown effect) and restores focus to the previously focused
 * element on close.
 *
 * @param {React.RefObject} ref    ref to the modal container element
 * @param {object}          opts
 * @param {boolean}         active        trap only while true
 * @param {Function}        onEscape      called on Escape (close the modal)
 * @param {string|number}   initialFocus  'first' | 'last' | tabindex index
 * @param {boolean}         returnFocus   restore focus on close
 */
export function useFocusTrap(ref, { active = true, onEscape, initialFocus = 'first', returnFocus = true } = {}) {
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!active) return
    const node = ref?.current
    if (!node) return

    previouslyFocused.current = document.activeElement

    // Initial focus inside the modal.
    const focusables = Array.from(node.querySelectorAll(FOCUSABLE))
    if (focusables.length) {
      if (initialFocus === 'last') focusables[focusables.length - 1].focus()
      else if (typeof initialFocus === 'number' && focusables[initialFocus]) focusables[initialFocus].focus()
      else focusables[0].focus()
    }

    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape?.()
        return
      }
      if (e.key !== 'Tab') return
      const list = Array.from(node.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null)
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler, true)

    return () => {
      document.removeEventListener('keydown', handler, true)
      if (returnFocus && previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus()
      }
    }
  }, [active, ref, onEscape, initialFocus, returnFocus])
}

export default useFocusTrap
