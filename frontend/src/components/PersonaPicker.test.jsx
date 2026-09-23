import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PersonaPicker } from './PersonaPicker'

afterEach(() => {
  cleanup()
})

const mockPersonas = [
  { id: 'default', name: 'Default', icon: '🤖', system_prompt: 'Helpful AI' },
  { id: 'coder', name: 'Coder', icon: '💻', system_prompt: 'Write clean code' },
  { id: 'writer', name: 'Writer', icon: '✍️', system_prompt: 'Creative writer' },
]

describe('PersonaPicker Component', () => {
  it('renders active persona and edit/create buttons', () => {
    render(
      <PersonaPicker
        personas={mockPersonas}
        activePersonaId="coder"
      />
    )
    expect(screen.getByText('Coder')).toBeDefined()
    expect(screen.getByTitle(/Edit Coder persona/i)).toBeDefined()
    expect(screen.getByTitle(/Create new persona/i)).toBeDefined()
  })

  it('opens popover when trigger button is clicked and lists personas', () => {
    render(
      <PersonaPicker
        personas={mockPersonas}
        activePersonaId="default"
      />
    )
    const trigger = screen.getByRole('button', { name: /Current Persona: Default/i })
    fireEvent.click(trigger)

    expect(screen.getByText('Writer')).toBeDefined()
    expect(screen.getByText('Creative writer')).toBeDefined()
  })

  it('calls onSelect when a persona in the list is clicked', () => {
    const onSelect = vi.fn()
    render(
      <PersonaPicker
        personas={mockPersonas}
        activePersonaId="default"
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Current Persona: Default/i }))
    fireEvent.click(screen.getByText('Writer'))

    expect(onSelect).toHaveBeenCalledWith('writer')
  })

  it('calls onEdit when active persona edit button is clicked', () => {
    const onEdit = vi.fn()
    render(
      <PersonaPicker
        personas={mockPersonas}
        activePersonaId="coder"
        onEdit={onEdit}
      />
    )
    const editBtn = screen.getByTitle(/Edit Coder persona/i)
    fireEvent.click(editBtn)

    expect(onEdit).toHaveBeenCalledWith(mockPersonas[1])
  })

  it('calls onCreate when plus button is clicked', () => {
    const onCreate = vi.fn()
    render(
      <PersonaPicker
        personas={mockPersonas}
        activePersonaId="default"
        onCreate={onCreate}
      />
    )
    const createBtn = screen.getByTitle(/Create new persona/i)
    fireEvent.click(createBtn)

    expect(onCreate).toHaveBeenCalled()
  })
})
