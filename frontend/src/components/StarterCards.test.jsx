import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { StarterCards, STARTER_CATEGORIES } from './StarterCards'

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

describe('StarterCards Component', () => {
  it('renders all starter categories', () => {
    const handleSelect = vi.fn()
    act(() => {
      root.render(<StarterCards onSelectPrompt={handleSelect} />)
    })

    STARTER_CATEGORIES.forEach(cat => {
      expect(host.textContent).toContain(cat.title)
    })
  })

  it('triggers onSelectPrompt when clicking a starter card', () => {
    const handleSelect = vi.fn()
    act(() => {
      root.render(<StarterCards onSelectPrompt={handleSelect} />)
    })

    const button = host.querySelector('.starter-card')
    expect(button).not.toBeNull()
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(handleSelect).toHaveBeenCalledWith(STARTER_CATEGORIES[0].prompt)
  })
})
