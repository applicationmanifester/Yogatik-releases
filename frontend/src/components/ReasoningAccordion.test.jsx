import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ReasoningAccordion } from './ReasoningAccordion'

describe('ReasoningAccordion Component', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when reasoning is empty and not streaming', () => {
    const { container } = render(<ReasoningAccordion reasoning="" isStreaming={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders live Thinking state when isStreaming is true', () => {
    render(<ReasoningAccordion reasoning="Analyzing user query..." isStreaming={true} />)
    expect(screen.getByText(/Thinking/i)).toBeDefined()
  })

  it('renders collapsed Thought Process with estimated tokens', () => {
    render(<ReasoningAccordion reasoning="Step 1: Check constraints. Step 2: Formulate solution." isStreaming={false} />)
    expect(screen.getByText(/Thought Process/i)).toBeDefined()
    expect(screen.getByText(/tokens/i)).toBeDefined()
  })

  it('toggles expansion when header is clicked', () => {
    render(<ReasoningAccordion reasoning="Detailed reasoning chain here." isStreaming={false} />)
    const header = screen.getByRole('button')
    // Click to expand
    fireEvent.click(header)
    expect(screen.getByText('Detailed reasoning chain here.')).toBeDefined()
    // Click to collapse
    fireEvent.click(header)
    expect(screen.queryByText('Detailed reasoning chain here.')).toBeNull()
  })
})
