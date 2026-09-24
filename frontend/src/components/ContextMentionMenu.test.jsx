import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ContextMentionMenu } from './ContextMentionMenu'

describe('ContextMentionMenu Component', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders mention items when query is "@"', () => {
    render(<ContextMentionMenu query="@" onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Live Web Search')).toBeDefined()
    expect(screen.getByText('Video Studio & Trimmer')).toBeDefined()
    expect(screen.getByText('Desktop Terminal')).toBeDefined()
  })

  it('filters items when query text is typed after "@"', () => {
    render(<ContextMentionMenu query="@web" onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Live Web Search')).toBeDefined()
    expect(screen.queryByText('Desktop Terminal')).toBeNull()
  })

  it('includes custom documents passed via docs prop', () => {
    const docs = [{ id: '1', name: 'Roadmap.pdf', charCount: 4000 }]
    render(<ContextMentionMenu query="@doc" docs={docs} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Roadmap.pdf')).toBeDefined()
  })

  it('calls onSelect when an item is clicked', () => {
    const handleSelect = vi.fn()
    render(<ContextMentionMenu query="@" onSelect={handleSelect} onClose={() => {}} />)
    const webItem = screen.getByText('Live Web Search')
    fireEvent.click(webItem)
    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'web' }))
  })
})
