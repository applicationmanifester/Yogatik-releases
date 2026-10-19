import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { createRef, act } from 'react'
import { createRoot } from 'react-dom/client'

// Keep these unit tests fast: markdown and announcer are not under test.
vi.mock('react-markdown', () => ({ default: ({ children }) => <span>{children}</span> }))

const { SHORTCUT_MAP } = await import('./components/ShortcutsModal')
const { StreamingMessage } = await import('./components/StreamingMessage')
const { ReasoningAccordion } = await import('./components/ReasoningAccordion')
const { ModelPicker } = await import('./components/ModelPicker')

let frames = []
let host = null
let root = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', (id) => { frames[id - 1] = null })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const mount = (el) => act(() => root.render(el))
const paint = () => act(() => { const due = frames; frames = []; due.forEach(cb => cb?.(0)) })

describe('Sprint 3 — Reach & Insight accessibility', () => {
  it('documents a shortcut map that includes the ? key', () => {
    expect(Array.isArray(SHORTCUT_MAP)).toBe(true)
    const keys = SHORTCUT_MAP.flatMap(s => s.keys)
    expect(keys).toContain('?')
    expect(keys).toContain('ctrl+/')
    for (const s of SHORTCUT_MAP) {
      expect(s.desc, `shortcut ${s.action} needs a description`).toBeTruthy()
    }
  })

  it('streaming region never floods live announcements: completion only', () => {
    const ref = createRef()
    mount(<StreamingMessage ref={ref} />)
    act(() => { ref.current.push('Hello'); ref.current.push('Hello world') })
    paint()
    // No assertive/per-token live region while streaming…
    expect(host.querySelector('[aria-live="assertive"]')).toBeNull()
    const article = host.querySelector('[role="article"]')
    expect(article?.getAttribute('aria-label')).toMatch(/responding/i)
    // …completion is announced exactly once via the polite status node.
    act(() => ref.current.complete())
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/complete/i)
    expect(host.querySelector('[role="article"]')?.getAttribute('aria-label')).toMatch(/complete/i)
  })

  it('reasoning accordion uses a native button with aria-expanded/controls', () => {
    mount(<ReasoningAccordion reasoning="plan" isStreaming={false} defaultExpanded />)
    const header = host.querySelector('button.reasoning-accordion-header')
    expect(header).not.toBeNull()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    const controls = header.getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    expect(document.getElementById(controls)?.getAttribute('role')).toBe('region')
  })

  it('model picker trigger exposes listbox semantics and keyboard open', () => {
    mount(<ModelPicker models={['a', 'b']} value="a" onChange={() => {}} />)
    const trigger = host.querySelector('button.model-trigger')
    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(trigger?.getAttribute('aria-controls')).toBeTruthy()
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(host.querySelector('[role="listbox"]')).not.toBeNull()
  })
})
