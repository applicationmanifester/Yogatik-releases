import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AgentWorkflowStepper } from './AgentWorkflowStepper'

describe('AgentWorkflowStepper Component', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders collapsed workflow card with steps count', () => {
    const trace = [
      { tool: 'search_web', status: 'done', args: { q: 'react' } },
      { tool: 'read_file', status: 'done', args: { path: 'App.jsx' } },
    ]
    render(<AgentWorkflowStepper trace={trace} defaultExpanded={false} />)
    expect(screen.getByText('Agent Workflow')).toBeDefined()
    expect(screen.getByText('2 actions')).toBeDefined()
    expect(screen.getByText('Completed')).toBeDefined()
  })

  it('toggles expansion and shows timeline steps when clicked', () => {
    const trace = [
      { tool: 'search_web', status: 'done', args: { q: 'react' } },
    ]
    render(<AgentWorkflowStepper trace={trace} defaultExpanded={false} />)
    const header = screen.getByRole('button')
    fireEvent.click(header)
    expect(screen.getByText('search_web')).toBeDefined()
    expect(screen.getByText('✓ Completed')).toBeDefined()
  })
})
