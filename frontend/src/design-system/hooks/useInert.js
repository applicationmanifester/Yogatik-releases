import { useEffect } from 'react'

/**
 * useInert — Marks everything OUTSIDE a modal inert while it is open.
 *
 * Shared design-system hook. Uses the native `inert` attribute (supported in
 * Chromium and all modern browsers) plus aria-hidden, so background content
 * is unreachable by click, tab, and screen reader while a modal is up.
 *
 * The modal is located via `excludeRef` (read at effect time, after the ref
 * attaches) or a static `exclude` element list. Everything else is inerted
 * along the modal's ancestor path.
 *
 * @param {boolean}         active inert only while true
 * @param {object}          opts
 * @param {Array<Element>}  exclude     static elements to keep interactive
 * @param {React.RefObject} excludeRef  ref to the modal container
 */
export function useInert(active, { exclude = [], excludeRef = null } = {}) {
  useEffect(() => {
    if (!active) return
    const modalNode = excludeRef?.current || exclude.find(Boolean) || null

    // No modal node to preserve — do nothing rather than inert the whole
    // page including the modal itself (fail open over fail broken).
    if (!modalNode || !modalNode.isConnected) return

    const affected = []

    const inert = (el) => {
      if (!el || el.contains(modalNode)) return
      el.setAttribute('inert', '')
      el.setAttribute('aria-hidden', 'true')
      affected.push(el)
    }

    for (const child of [...document.body.children]) {
      if (child.contains(modalNode)) {
        // The modal lives under this top-level node: inert every branch of
        // its ancestor chain except the path down to the modal.
        let current = modalNode
        while (current && current !== child) {
          const parent = current.parentElement
          if (!parent) break
          for (const sibling of parent.children) {
            if (sibling !== current) inert(sibling)
          }
          current = parent
        }
      } else {
        inert(child)
      }
    }

    return () => {
      for (const el of affected) {
        el.removeAttribute('inert')
        el.removeAttribute('aria-hidden')
      }
    }
  }, [active])
}

export default useInert
