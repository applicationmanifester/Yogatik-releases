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

describe('MessageBubble inline citations strip ([citations])', () => {
  const docResult = {
    success: true,
    tool: 'doc_search',
    query: 'leave and expenses',
    passages: [
      { n: 1, document: 'Handbook.pdf', passage: 'Full-time employees accrue 18 days of paid annual leave per year.', chunk: 2, of: 9, score: 1.23 },
      { n: 2, document: 'Travel policy', passage: 'Travel expenses must be filed within 30 days of the trip.', chunk: 1, of: 4, score: 0.98 },
      { n: 3, document: 'Handbook.pdf', passage: 'The notice period is 60 days for senior roles.', chunk: 5, of: 9, score: 0.71 },
    ],
  }

  it('renders the strip for finished answers that cite doc_search results', () => {
    const rawMsg = {
      role: 'assistant',
      content: 'Employees accrue 18 days of leave [1], and expenses must be filed within 30 days [2].',
      toolResults: { doc_search: docResult },
      toolsUsed: ['doc_search'],
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    const strip = host.querySelector('[data-testid="citations-strip"]')
    expect(strip).not.toBeNull()
    const chips = [...host.querySelectorAll('[data-testid="citation-chip"]')]
    expect(chips.map(c => c.textContent)).toEqual(['[1] Handbook.pdf', '[2] Travel policy'])
    // The uncited third passage stays out of the strip.
    expect(strip.textContent).not.toContain('notice period')
  })

  it('reads grouped and citation: forms too', () => {
    const rawMsg = {
      role: 'assistant',
      content: 'One form says [2,3]; another spells [citation:1].',
      toolResults: { doc_search: docResult },
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    const chips = [...host.querySelectorAll('[data-testid="citation-chip"]')]
    expect(chips.map(c => c.textContent)).toEqual(['[1] Handbook.pdf', '[2] Travel policy', '[3] Handbook.pdf'])
  })

  it('hides the strip when the answer cites nothing (even with doc results)', () => {
    const rawMsg = {
      role: 'assistant',
      content: 'The handbook covers leave, expenses and notice periods.',
      toolResults: { doc_search: docResult },
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    expect(host.querySelector('[data-testid="citations-strip"]')).toBeNull()
  })

  it('hides the strip when there was no doc_search result (plain text with brackets)', () => {
    const rawMsg = {
      role: 'assistant',
      content: 'Array indexing like arr[1] at the start, plus [2] for good measure.',
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    expect(host.querySelector('[data-testid="citations-strip"]')).toBeNull()
  })

  it('hides the strip on user messages, whatever they contain', () => {
    const rawMsg = {
      role: 'user',
      content: 'What about leave? [1]',
      toolResults: { doc_search: docResult },
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    expect(host.querySelector('[data-testid="citations-strip"]')).toBeNull()
  })

  it('never mutates the raw message text — the answer still shows its [1] marker', () => {
    const content = 'See [1] and [2]. Note `code [3]` stays an array literal.'
    const rawMsg = {
      role: 'assistant',
      content,
      toolResults: { doc_search: { success: true, passages: docResult.passages.slice(0, 2) } },
    }

    act(() => {
      root.render(<MessageBubble msg={rawMsg} />)
    })

    expect(rawMsg.content).toBe(content)
    expect(host.textContent).toContain('See [1] and [2].')
  })
})
