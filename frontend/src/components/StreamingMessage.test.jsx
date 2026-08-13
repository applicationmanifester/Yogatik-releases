import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { createRef, act } from 'react'
import { createRoot } from 'react-dom/client'

// ReactMarkdown is not under test and mounting it is slow.
vi.mock('react-markdown', () => ({ default: ({ children }) => <span>{children}</span> }))

const { StreamingMessage } = await import('./StreamingMessage')

let frames = []
let host = null
let root = null

/** Drive requestAnimationFrame by hand so the coalescing is observable. */
beforeEach(() => {
  // Without this React logs "not configured to support act(...)" on every call.
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

const mount = (props) => act(() => root.render(<StreamingMessage {...props} />))
const paint = () => act(() => { const due = frames; frames = []; due.forEach(cb => cb?.(0)) })
const pending = () => frames.filter(Boolean).length

describe('StreamingMessage', () => {
  it('renders nothing until text arrives', () => {
    mount({ ref: createRef() })
    expect(host.textContent).toBe('')
  })

  it('coalesces many pushes into a single paint', () => {
    const ref = createRef()
    mount({ ref })

    act(() => {
      ref.current.push('He')
      ref.current.push('Hell')
      ref.current.push('Hello')
    })
    // Three tokens, one scheduled frame — this is the entire point of it.
    expect(pending()).toBe(1)
    paint()
    expect(host.textContent).toContain('Hello')
  })

  it('fires onFirstToken exactly once per turn, and re-arms after clear', () => {
    const ref = createRef()
    const onFirstToken = vi.fn()
    mount({ ref, onFirstToken })

    act(() => { ref.current.push('a'); ref.current.push('ab') })
    paint()
    act(() => ref.current.push('abc'))
    paint()
    expect(onFirstToken).toHaveBeenCalledTimes(1)

    act(() => ref.current.clear())
    act(() => ref.current.push('x'))
    paint()
    expect(onFirstToken).toHaveBeenCalledTimes(2)
  })

  it('does not announce a first token for an empty push', () => {
    const ref = createRef()
    const onFirstToken = vi.fn()
    mount({ ref, onFirstToken })
    act(() => ref.current.push(''))
    expect(onFirstToken).not.toHaveBeenCalled()
  })

  it('clear() drops pending text and cancels the queued frame', () => {
    const ref = createRef()
    mount({ ref })

    act(() => ref.current.push('half a sentence'))
    act(() => ref.current.clear())
    paint()
    // A stale frame must not resurrect the answer that was just cleared.
    expect(host.textContent).toBe('')
  })

  it('calls onGrow after each painted chunk so the view can follow', () => {
    const ref = createRef()
    const onGrow = vi.fn()
    mount({ ref, onGrow })

    act(() => ref.current.push('one'))
    paint()
    expect(onGrow).toHaveBeenCalledTimes(1)

    act(() => ref.current.push('one two'))
    paint()
    expect(onGrow).toHaveBeenCalledTimes(2)
  })
})
