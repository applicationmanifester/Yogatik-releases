// @vitest-environment jsdom
//
// There were TWO toast systems. This provider was mounted in main.jsx and
// consumed by nothing; App kept its own single-slot state and a `.toast` div
// carrying `pointer-events: none` — so only one message could show at a time,
// and a button inside a toast could never have been clicked. App delegates
// here now, which is why the wiring assertions at the bottom matter as much as
// the behaviour ones.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react'
import { ToastProvider, useToast } from './useToast'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Renders nothing; hands the toast API to the test. */
function Harness({ onReady }) {
  const api = useToast()
  React.useEffect(() => { onReady(api) }, [api, onReady])
  return null
}

function mount() {
  let api = null
  render(<ToastProvider><Harness onReady={(a) => { api = a }} /></ToastProvider>)
  return () => api
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('plain toasts', () => {
  it('shows a message and clears itself', async () => {
    const get = mount()
    act(() => { get().show('Copied') })
    expect(screen.getByText('Copied')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(7000) })
    expect(screen.queryByText('Copied')).toBeNull()
  })

  it('stacks several at once', () => {
    // The old App implementation held ONE message in state, so a second toast
    // silently replaced the first.
    const get = mount()
    act(() => { get().show('First'); get().show('Second') })
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
  })

  it('only errors interrupt a screen reader', () => {
    // role="alert" is right for a failure and hostile for "Copied" — and for a
    // progress toast that updates several times a second.
    const get = mount()
    act(() => { get().show('Saved') })
    expect(screen.getByText('Saved').closest('.toast').getAttribute('role')).toBe('status')
    act(() => { get().show('It broke', { variant: 'error' }) })
    expect(screen.getByText('It broke').closest('.toast').getAttribute('role')).toBe('alert')
  })
})

describe('actionable toasts', () => {
  it('does NOT auto-dismiss while an action is offered', () => {
    // Offering Retry and then vanishing after three seconds is worse than not
    // offering it: the user reaches for a button that is no longer there.
    const get = mount()
    act(() => { get().show('Upload failed', { actions: [{ label: 'Retry', onClick: () => {} }] }) })
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByText('Upload failed')).toBeTruthy()
  })

  it('runs the action and closes', () => {
    const onRetry = vi.fn()
    const get = mount()
    act(() => { get().show('Failed', { actions: [{ label: 'Retry', onClick: onRetry }] }) })
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Failed')).toBeNull()
  })

  it('still closes when the action throws', () => {
    // A handler that blows up must not leave a stuck toast on screen forever.
    const get = mount()
    act(() => { get().show('Failed', { actions: [{ label: 'Retry', onClick: () => { throw new Error('nope') } }] }) })
    try { fireEvent.click(screen.getByText('Retry')) } catch {}
    expect(screen.queryByText('Failed')).toBeNull()
  })

  it('always offers a way out', () => {
    const get = mount()
    act(() => { get().show('Failed', { actions: [{ label: 'Retry', onClick: () => {} }] }) })
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Failed')).toBeNull()
  })

  it('showError builds the common retry case', () => {
    const onRetry = vi.fn()
    const get = mount()
    act(() => { get().showError('Network is down', onRetry) })
    expect(screen.getByText('Network is down').closest('.toast').getAttribute('role')).toBe('alert')
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('progress toasts', () => {
  it('stays up while the work runs, and can be updated', () => {
    const get = mount()
    let id
    act(() => { id = get().show('Exporting…', { progress: null }) })
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByText('Exporting…')).toBeTruthy()
    act(() => { get().update(id, { message: 'Reloading…' }) })
    expect(screen.getByText('Reloading…')).toBeTruthy()
  })

  it('reports a real percentage but never invents one', () => {
    // An indeterminate operation gets a moving bar and NO aria-valuenow —
    // claiming "43%" for work that reports no steps is a confident lie.
    const get = mount()
    act(() => { get().show('Half done', { progress: 0.5 }) })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
    act(() => { get().show('Working', { progress: null }) })
    const bars = screen.getAllByRole('progressbar')
    expect(bars.some(b => b.getAttribute('aria-valuenow') === null)).toBe(true)
  })

  it('clamps a value outside 0–1 instead of overflowing the bar', () => {
    const get = mount()
    act(() => { get().show('Odd', { progress: 1.8 }) })
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('100%')
  })
})

describe('timers are cleaned up', () => {
  it('a manual dismiss cancels the pending timer', () => {
    // The old version never cleared it, so the timeout still fired later
    // against a toast that was already gone, and the whole set leaked on
    // unmount.
    const get = mount()
    let id
    act(() => { id = get().show('Bye') })
    act(() => { get().dismiss(id) })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('wiring', () => {
  const app = fs.readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')
  const css = fs.readFileSync(path.join(HERE, '..', 'styles.css'), 'utf8')

  it('App uses this provider rather than its own toast state', () => {
    expect(app).toMatch(/import \{ useToast \} from '\.\/hooks\/useToast'/)
    expect(app).not.toMatch(/const \[toast, setToast\]/)
  })

  it('showToast keeps its old signature so existing call sites still work', () => {
    expect(app).toMatch(/const showToast = useCallback\(\(msg, options\) => pushToast\(msg, options\)/)
  })

  it('long operations report progress instead of looking frozen', () => {
    expect(app).toMatch(/pushToast\('Exporting your backup…', \{ progress: null \}\)/)
    expect(app).toMatch(/progress: null/)
  })

  it('an interactive toast can actually be clicked', () => {
    // `.toast { pointer-events: none }` applied to every toast, so a Retry
    // button inside one was unreachable by construction.
    expect(css).toMatch(/\.toast-interactive\s*\{[^}]*pointer-events:\s*auto/)
  })
})
