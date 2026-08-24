/**
 * Keeps the app shell's height under the stylesheet's control.
 *
 * Third-party scripts un-constrain their ancestors so their own iframe can
 * grow: adsbygoogle.js walks up from its <ins> writing
 * `height:auto !important; min-height:0 !important` onto every parent it
 * finds. An INLINE !important declaration outranks every author rule, so no
 * amount of CSS can win that argument — the only fix is to take the
 * declaration back off.
 *
 * Measured on 2026-08-24: with the banner mounted inside .settings-body,
 * #root, .app, .sidebar and .settings were all rewritten and the sidebar
 * became 2129px tall in a 900px window. html/body are overflow:hidden, so the
 * settings drawer and the whole sidebar footer (Sign In included) sat below
 * the fold with no scrollbar anywhere that could reach them.
 *
 * The guard is deliberately narrow: it only strips `height` and `min-height`,
 * only from the four shell elements, and only when a rule of ours is what
 * should be sizing them. Anything else a script does to its own subtree is
 * left alone.
 */

const SHELL_SELECTOR = '#root, .app, .sidebar, .settings'
const GUARDED_PROPS = ['height', 'min-height', 'max-height']

/** Strip the offending declarations; returns true if the node was changed. */
export function stripShellSizing(el) {
  if (!el?.style) return false
  let changed = false
  for (const prop of GUARDED_PROPS) {
    if (el.style.getPropertyValue(prop)) {
      el.style.removeProperty(prop)
      changed = true
    }
  }
  // An emptied style="" attribute is noise in the DOM inspector and in diffs.
  if (changed && el.getAttribute('style') === '') el.removeAttribute('style')
  return changed
}

/** True when this element is part of the shell the stylesheet must own. */
export function isShellElement(el) {
  return !!el?.matches?.(SHELL_SELECTOR)
}

let observer = null

/**
 * Watch for inline style attributes appearing on shell elements and revert
 * them. Idempotent; returns a stop function.
 */
export function installShellGuard(root = typeof document !== 'undefined' ? document : null) {
  if (!root || typeof MutationObserver === 'undefined') return () => {}
  if (observer) return () => stopShellGuard()

  // Anything already written before the observer existed (the ad script can
  // run during the same task that mounts React).
  root.querySelectorAll?.(SHELL_SELECTOR)?.forEach(stripShellSizing)

  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'style' && isShellElement(r.target)) {
        stripShellSizing(r.target)
      }
    }
  })
  observer.observe(root.documentElement || root, {
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  })
  return stopShellGuard
}

export function stopShellGuard() {
  observer?.disconnect()
  observer = null
}
