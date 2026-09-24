import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ArtifactCanvas } from './ArtifactCanvas'

describe('ArtifactCanvas Component', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ArtifactCanvas isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders title, language badge, preview, and tabs when open', () => {
    render(
      <ArtifactCanvas
        isOpen={true}
        onClose={() => {}}
        title="Sample App"
        code="<h1>Hello World</h1>"
        language="html"
      />
    )
    expect(screen.getByText('Sample App')).toBeDefined()
    expect(screen.getByText('html')).toBeDefined()
    expect(screen.getByText('Preview')).toBeDefined()
    expect(screen.getByText('Edit Code')).toBeDefined()
  })

  it('switches to code editor tab and allows direct typing', () => {
    render(
      <ArtifactCanvas
        isOpen={true}
        onClose={() => {}}
        title="Sample App"
        code="<h1>Hello World</h1>"
        language="html"
      />
    )
    const editBtn = screen.getByText('Edit Code')
    fireEvent.click(editBtn)
    const textarea = screen.getByPlaceholderText('Edit code directly here...')
    expect(textarea).toBeDefined()
    fireEvent.change(textarea, { target: { value: '<h2>Updated</h2>' } })
    expect(textarea.value).toBe('<h2>Updated</h2>')
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<ArtifactCanvas isOpen={true} onClose={handleClose} />)
    const closeBtn = screen.getByTitle('Close Canvas')
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalled()
  })
})
