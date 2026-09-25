import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { TagModal } from './TagModal'

describe('TagModal', () => {
  it('renders nothing without conv', () => {
    const { container } = render(<TagModal conv={null} onChange={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders active tags and suggestions from allTags', () => {
    render(
      <TagModal
        conv={{ idx: 0, conv: { title: 'Test chat' }, tags: ['ai'] }}
        onChange={() => {}}
        allTags={['ai', 'bug']}
        setConvTags={() => {}}
        showToast={() => {}}
      />
    )
    expect(screen.getByText('Manage Chat Tags')).toBeTruthy()
    expect(screen.getByText('#ai')).toBeTruthy()
    expect(screen.getByText('+ #bug')).toBeTruthy()
  })
})