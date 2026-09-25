import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { FolderModal } from './FolderModal'

describe('FolderModal', () => {
  it('renders nothing without conv', () => {
    const { container } = render(<FolderModal conv={null} onChange={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders existing folders as selectable chips', () => {
    render(
      <FolderModal
        conv={{ idx: 0, conv: { title: 'C' }, folder: '' }}
        onChange={() => {}}
        allFolders={['Work', 'Research']}
        setConvFolder={() => {}}
        showToast={() => {}}
      />
    )
    expect(screen.getByText('Organize Chat into Folder')).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('Research')).toBeTruthy()
  })

  it('shows Clear Folder only when a folder is already set', () => {
    render(
      <FolderModal
        conv={{ idx: 0, conv: { title: 'C', folder: 'Work' }, folder: 'Work' }}
        onChange={() => {}}
        allFolders={['Work']}
        setConvFolder={() => {}}
        showToast={() => {}}
      />
    )
    expect(screen.getByText('Clear Folder')).toBeTruthy()
  })
})