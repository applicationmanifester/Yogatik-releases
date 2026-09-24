import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FollowUpSuggestions, deriveFollowUpSuggestions } from './FollowUpSuggestions'

afterEach(cleanup)

describe('FollowUpSuggestions Component', () => {
  it('derives code-specific suggestions when response contains code', () => {
    const codeResponse = 'Here is the function:\n```javascript\nfunction add(a, b) { return a + b }\n```'
    const suggestions = deriveFollowUpSuggestions(codeResponse)
    expect(suggestions.length).toBe(3)
    expect(suggestions.some(s => s.label.includes('unit tests'))).toBe(true)
    expect(suggestions.some(s => s.label.includes('Optimize'))).toBe(true)
  })

  it('derives data/chart suggestions when response contains tables', () => {
    const tableResponse = '| Name | Score |\n|---|---|\n| Alice | 95 |\n| Bob | 88 |'
    const suggestions = deriveFollowUpSuggestions(tableResponse)
    expect(suggestions.length).toBe(3)
    expect(suggestions.some(s => s.label.includes('chart'))).toBe(true)
  })

  it('renders chips and invokes onSelectSuggestion with full prompt', () => {
    const onSelect = vi.fn()
    render(<FollowUpSuggestions content="Here is how to deploy a database." onSelectSuggestion={onSelect} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)

    fireEvent.click(buttons[0])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(typeof onSelect.mock.calls[0][0]).toBe('string')
    expect(onSelect.mock.calls[0][0].length).toBeGreaterThan(5)
  })

  it('renders nothing when content is empty', () => {
    const { container } = render(<FollowUpSuggestions content="" />)
    expect(container.firstChild).toBeNull()
  })
})
