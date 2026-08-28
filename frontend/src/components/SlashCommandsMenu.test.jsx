import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SlashCommandsMenu } from './SlashCommandsMenu'

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

describe('SlashCommandsMenu Component', () => {
  it('renders matching slash commands', () => {
    const handleSelect = vi.fn()
    const handleClose = vi.fn()

    act(() => {
      root.render(
        <SlashCommandsMenu
          filter="/enh"
          selectedIndex={0}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      )
    })

    expect(host.textContent).toContain('/enhance')
    expect(host.textContent).toContain('Enhance Prompt')
  })

  it('triggers onSelect when clicking a command', () => {
    const handleSelect = vi.fn()
    const handleClose = vi.fn()

    act(() => {
      root.render(
        <SlashCommandsMenu
          filter="/"
          selectedIndex={0}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      )
    })

    const cmdItem = host.querySelector('.slash-commands-menu div[style*="cursor: pointer"]')
    expect(cmdItem).not.toBeNull()
    act(() => {
      cmdItem.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(handleSelect).toHaveBeenCalled()
  })
})
