/**
 * The shell's height belongs to the stylesheet.
 *
 * adsbygoogle.js un-constrains the ancestors of a responsive unit by writing
 * `height:auto !important; min-height:0 !important` inline. Inline !important
 * beats every author rule, so this was invisible to CSS: measured on
 * 2026-08-24 with the banner inside .settings-body, the sidebar rendered
 * 2129px tall in a 900px window and the settings drawer plus the entire
 * footer sat below an overflow:hidden edge with no scrollbar to reach them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installShellGuard, stopShellGuard, stripShellSizing, isShellElement } from './shellGuard'

const flush = () => new Promise(r => setTimeout(r, 0))

let root, app, sidebar, ins

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div'); root.id = 'root'
  app = document.createElement('div'); app.className = 'app'
  sidebar = document.createElement('aside'); sidebar.className = 'sidebar'
  ins = document.createElement('ins'); ins.className = 'adsbygoogle'
  sidebar.appendChild(ins); app.appendChild(sidebar); root.appendChild(app)
  document.body.appendChild(root)
})

afterEach(() => { stopShellGuard(); document.body.innerHTML = '' })

/** What the ad script actually does, walking up from its own <ins>. */
function unconstrainAncestors(from) {
  for (let el = from.parentElement; el; el = el.parentElement) {
    el.style.setProperty('height', 'auto', 'important')
    el.style.setProperty('min-height', '0px', 'important')
  }
}

describe('shellGuard', () => {
  it('reverts inline height written onto shell elements', async () => {
    installShellGuard()
    unconstrainAncestors(ins)
    await flush()
    for (const el of [root, app, sidebar]) {
      expect(el.style.getPropertyValue('height'), el.className || el.id).toBe('')
      expect(el.style.getPropertyValue('min-height')).toBe('')
    }
  })

  it('cleans up what was written before it was installed', () => {
    unconstrainAncestors(ins)
    installShellGuard()
    expect(root.style.getPropertyValue('height')).toBe('')
    expect(app.style.getPropertyValue('min-height')).toBe('')
  })

  it('leaves non-shell elements alone', async () => {
    const card = document.createElement('div')
    card.className = 'adsense-wrapper'
    card.style.setProperty('height', 'auto', 'important')
    sidebar.appendChild(card)
    installShellGuard()
    await flush()
    // The ad's own box may size itself however it likes.
    expect(card.style.getPropertyValue('height')).toBe('auto')
    expect(isShellElement(card)).toBe(false)
  })

  it('only touches sizing, never other inline styles', async () => {
    installShellGuard()
    app.setAttribute('style', 'height: auto !important; transform: translateX(-10px);')
    await flush()
    expect(app.style.getPropertyValue('height')).toBe('')
    expect(app.style.transform).toBe('translateX(-10px)')
  })

  it('removes an emptied style attribute rather than leaving style=""', () => {
    app.style.setProperty('height', 'auto', 'important')
    expect(stripShellSizing(app)).toBe(true)
    expect(app.hasAttribute('style')).toBe(false)
  })

  it('is a no-op on an element with nothing to strip', () => {
    expect(stripShellSizing(app)).toBe(false)
    expect(stripShellSizing(null)).toBe(false)
  })
})
