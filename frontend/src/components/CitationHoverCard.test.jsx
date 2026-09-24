import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CitationHoverCard } from './CitationHoverCard'

afterEach(cleanup)

describe('CitationHoverCard Component', () => {
  it('renders domain, title, snippet and link correctly', () => {
    const mockSource = {
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      title: 'MDN Web Docs: JavaScript',
      snippet: 'JavaScript (JS) is a lightweight, interpreted programming language.',
    }

    render(<CitationHoverCard source={mockSource} index={1} />)

    expect(screen.getByText('developer.mozilla.org')).toBeDefined()
    expect(screen.getByText('MDN Web Docs: JavaScript')).toBeDefined()
    expect(screen.getByText(/lightweight, interpreted/)).toBeDefined()
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://developer.mozilla.org/en-US/docs/Web/JavaScript')
  })

  it('handles fallback when title or snippet are omitted', () => {
    const mockSource = {
      url: 'https://example.com/test',
    }

    render(<CitationHoverCard source={mockSource} index={2} />)
    const matches = screen.getAllByText('example.com')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })
})
