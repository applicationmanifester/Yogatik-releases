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

  it('shows text that arrived before it mounted (initialText)', () => {
    // The parent renders this component only once the first token exists, so
    // that token is always pushed BEFORE mount. Without initialText the first
    // chunk of every answer was lost until the next token repainted.
    mount({ ref: createRef(), initialText: 'already streaming' })
    expect(host.textContent).toContain('already streaming')
    // Text present at mount is not a "first token" event waiting to fire.
    const ref = createRef()
    const onFirstToken = vi.fn()
    mount({ ref, initialText: 'x', onFirstToken })
    act(() => ref.current.push('xy'))
    paint()
    expect(onFirstToken).not.toHaveBeenCalled()
  })

  it('bare mode omits the message wrapper the parent already draws', () => {
    const ref = createRef()
    mount({ ref, bare: true })
    act(() => ref.current.push('hi'))
    paint()
    expect(host.querySelector('.message.assistant')).toBeNull()
    expect(host.querySelector('.message-content')?.textContent).toContain('hi')
  })

  it('separates <think> tags into a reasoning block while streaming', () => {
    const ref = createRef()
    mount({ ref })

    act(() => ref.current.push('<think>Planning the solution...</think>Here is the final answer.'))
    paint()
    expect(host.querySelector('.reasoning-body')?.textContent).toBe('Planning the solution...')
    expect(host.querySelector('.message-content')?.textContent).toContain('Here is the final answer.')
  })

  it('renders interactive action chips and calls onActionClick when clicked', () => {
    const ref = createRef()
    const onActionClick = vi.fn()
    mount({ ref, onActionClick })

    act(() => ref.current.push('Done! [action: Run Unit Tests | prompt: npm test]'))
    paint()

    const btn = host.querySelector('.action-chip-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Run Unit Tests')

    act(() => btn?.click())
    expect(onActionClick).toHaveBeenCalledWith(expect.objectContaining({ label: 'Run Unit Tests', prompt: 'npm test' }))
  })

  it('renders stepped execution tree when activeAction.steps is provided', () => {
    const ref = createRef()
    mount({ ref })

    act(() => {
      ref.current.push('Investigating...')
      ref.current.setActiveAction({
        label: 'Multi-Agent Workflow',
        steps: [
          { id: '1', name: 'Scrape documentation', status: 'done', duration: '0.4s' },
          { id: '2', name: 'Run syntax checks', status: 'running' },
          { id: '3', name: 'Build bundle', status: 'pending' },
        ],
      })
    })
    paint()

    const tree = host.querySelector('.streaming-steps-tree')
    expect(tree).not.toBeNull()
    expect(tree?.textContent).toContain('Multi-Agent Workflow (1/3)')
    expect(tree?.textContent).toContain('Scrape documentation')
    expect(tree?.textContent).toContain('Run syntax checks')
  })
})

