import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutsModal } from './ShortcutsModal'

let host = null
let root = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('ShortcutsModal', () => {
  it('renders all shortcut groups and dismiss button', () => {
    const onClose = vi.fn()
    act(() => {
      root.render(<ShortcutsModal onClose={onClose} />)
    })

    expect(host.textContent).toContain('Keyboard Shortcuts')
    expect(host.textContent).toContain('General & Navigation')
    expect(host.textContent).toContain('Workspace & Tools')
    expect(host.textContent).toContain('New conversation')

    const closeBtn = host.querySelector('.palette-clear-btn')
    expect(closeBtn).toBeDefined()
    act(() => {
      closeBtn.click()
    })
    expect(onClose).toHaveBeenCalled()
  })
})
