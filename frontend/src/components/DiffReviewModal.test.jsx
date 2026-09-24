import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DiffReviewModal } from './DiffReviewModal'

afterEach(cleanup)

describe('DiffReviewModal Component', () => {
  it('renders diff additions and deletions correctly', () => {
    const original = 'const a = 1\nconst b = 2'
    const modified = 'const a = 1\nconst b = 3\nconst c = 4'

    render(
      <DiffReviewModal
        isOpen={true}
        filePath="src/test.js"
        originalCode={original}
        modifiedCode={modified}
        onClose={vi.fn()}
        onAccept={vi.fn()}
      />
    )

    expect(screen.getByText(/Review Diff/i)).toBeDefined()
    expect(screen.getByText('+2')).toBeDefined() // +const b = 3, +const c = 4
    expect(screen.getByText('-1')).toBeDefined() // -const b = 2
  })

  it('triggers onAccept when Accept & Apply button is clicked', async () => {
    const onAccept = vi.fn()
    const onClose = vi.fn()

    render(
      <DiffReviewModal
        isOpen={true}
        filePath="src/test.js"
        originalCode="old"
        modifiedCode="new"
        onClose={onClose}
        onAccept={onAccept}
      />
    )

    const acceptBtn = screen.getByText(/Accept & Apply/i)
    fireEvent.click(acceptBtn)

    expect(onAccept).toHaveBeenCalledWith('new', 'src/test.js')
  })
})
