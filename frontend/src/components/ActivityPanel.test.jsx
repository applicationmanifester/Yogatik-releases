/**
 * The panel subscribes to activityStream and must re-render from it. This is the
 * one link a browser check could not verify: an injected script gets its OWN
 * module instance under Vite dev, so publishing from outside never reaches the
 * panel's subscription. In vitest both share one registry, so this closes it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ActivityPanel } from './ActivityPanel'
import {
  startActivityTurn, publishStream, publishStep, endActivityTurn,
  _flushActivity, _resetActivity,
} from '../activityStream'

let host, root

beforeEach(() => {
  _resetActivity()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const mount = () => act(() => { root.render(<ActivityPanel onClose={() => {}} />) })
const settle = () => act(() => { _flushActivity() })

describe('ActivityPanel', () => {
  it('shows an empty state before anything happens', () => {
    mount()
    expect(host.querySelector('.activity-empty')).toBeTruthy()
    expect(host.querySelector('.activity-section')).toBeNull()
  })

  it('renders a running tool, then its result and timing', () => {
    mount()
    act(() => {
      startActivityTurn()
      publishStep({ id: '1', name: 'fs_read', status: 'running' })
    })
    settle()
    expect(host.querySelector('.activity-step.running')).toBeTruthy()
    expect(host.querySelector('.activity-step code').textContent).toBe('fs_read')

    act(() => publishStep({ id: '1', status: 'done', ms: 1500 }))
    settle()
    expect(host.querySelector('.activity-step.done')).toBeTruthy()
    expect(host.querySelector('.activity-ms').textContent).toBe('1.5s')
    // Updated in place, not appended twice.
    expect(host.querySelectorAll('.activity-step')).toHaveLength(1)
  })

  it('surfaces a failed tool with its error', () => {
    mount()
    act(() => {
      startActivityTurn()
      publishStep({ id: '2', name: 'web_search', status: 'error', detail: 'rate limited (429)' })
    })
    settle()
    expect(host.querySelector('.activity-step.error')).toBeTruthy()
    expect(host.querySelector('.activity-step-detail').textContent).toMatch(/429/)
  })

  it('streams reasoning while the think block is still open', () => {
    mount()
    act(() => {
      startActivityTurn()
      publishStream('<think>weighing the options')
    })
    settle()
    expect(host.querySelector('.activity-think').textContent).toBe('weighing the options')
  })

  it('shows a live badge only while the turn is running', () => {
    mount()
    act(() => startActivityTurn())
    settle()
    expect(host.querySelector('.activity-live')).toBeTruthy()

    act(() => endActivityTurn())
    settle()
    expect(host.querySelector('.activity-live')).toBeNull()
  })

  it('clears the previous turn when a new one starts', () => {
    mount()
    act(() => {
      startActivityTurn()
      publishStep({ id: '1', name: 'old_tool', status: 'done' })
    })
    settle()
    expect(host.querySelectorAll('.activity-step')).toHaveLength(1)

    act(() => startActivityTurn())
    settle()
    expect(host.querySelectorAll('.activity-step')).toHaveLength(0)
  })

  it('unsubscribes on unmount — no update after teardown', () => {
    mount()
    act(() => root.unmount())
    // Publishing after unmount must not throw (a live subscription would try to
    // set state on an unmounted component).
    expect(() => {
      startActivityTurn()
      publishStep({ id: '9', name: 'late', status: 'done' })
      _flushActivity()
    }).not.toThrow()
    root = createRoot(host)   // afterEach unmounts again safely
  })
})
