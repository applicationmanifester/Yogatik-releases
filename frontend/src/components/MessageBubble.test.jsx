import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MessageBubble } from './MessageBubble'

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

describe('MessageBubble Links and Markdown Rendering', () => {
  it('renders bare URLs as clickable anchor links with target="_blank"', () => {
    const rawMsg = {
      role: 'assistant',
      content: 'Here are the links:\n- Photos: https://www.instagram.com/p/CAB2pw4DQ4s/\n- Videos: https://www.instagram.com/reel/CAB7L5-xBvA/',
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    const links = host.querySelectorAll('a')
    expect(links.length).toBe(2)

    expect(links[0].href).toBe('https://www.instagram.com/p/CAB2pw4DQ4s/')
    expect(links[0].target).toBe('_blank')
    expect(links[0].rel).toContain('noopener')

    expect(links[1].href).toBe('https://www.instagram.com/reel/CAB7L5-xBvA/')
    expect(links[1].target).toBe('_blank')
  })

  it('renders markdown formatted links correctly', () => {
    const rawMsg = {
      role: 'assistant',
      content: 'Visit [Official Site](https://example.com) for more details.',
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    const link = host.querySelector('a')
    expect(link).not.toBeNull()
    expect(link.textContent).toBe('Official Site')
    expect(link.href).toBe('https://example.com/')
  })

  it('renders markdown tables via remark-gfm', () => {
    const rawMsg = {
      role: 'assistant',
      content: '| Platform | URL |\n| --- | --- |\n| X | https://x.com |\n| LinkedIn | https://linkedin.com |',
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    const table = host.querySelector('table')
    expect(table).not.toBeNull()
    const tableLinks = table.querySelectorAll('a')
    expect(tableLinks.length).toBe(2)
  })
})
