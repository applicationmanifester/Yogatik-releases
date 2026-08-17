import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ActiveTimerIndicator } from './ActiveTimerIndicator'
import { timerTool } from '../tools/timer'

let host = null
let root = null

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await timerTool.execute({ action: 'clear_all' })
})

afterEach(async () => {
  await timerTool.execute({ action: 'clear_all' })
  await act(async () => {
    root.unmount()
  })
  host.remove()
})

describe('ActiveTimerIndicator Component', () => {
  it('renders nothing when there are no active timers', async () => {
    await act(async () => {
      root.render(<ActiveTimerIndicator />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders active timer countdown pill when a timer is set', async () => {
    await act(async () => {
      root.render(<ActiveTimerIndicator />)
    })
    expect(host.innerHTML).toBe('')

    await act(async () => {
      await timerTool.execute({ duration: '5 minutes', label: 'Team Standup' })
    })

    expect(host.textContent).toContain('5:00')
    const button = host.querySelector('.active-timer-pill')
    expect(button).not.toBeNull()
  })

  it('opens popover on click and lists active timer with cancel button', async () => {
    await act(async () => {
      await timerTool.execute({ duration: '10 minutes', label: 'Bake Bread' })
    })

    await act(async () => {
      root.render(<ActiveTimerIndicator />)
    })

    const button = host.querySelector('.active-timer-pill')
    expect(button).not.toBeNull()

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host.textContent).toContain('Active Timers')
    expect(host.textContent).toContain('Bake Bread')

    const cancelBtn = host.querySelector('.timer-cancel-btn')
    expect(cancelBtn).not.toBeNull()

    await act(async () => {
      cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // After cancel, popover disappears and no timers remain
    expect(host.querySelector('.timer-popover')).toBeNull()
  })
})
