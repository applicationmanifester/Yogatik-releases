import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LiveModelSearchModal } from './LiveModelSearchModal'

afterEach(cleanup)

describe('LiveModelSearchModal', () => {
  const sampleProviders = {
    gemini: {
      name: 'Google Gemini',
      available: true,
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    },
    groq: {
      name: 'Groq Cloud',
      available: true,
      models: ['llama-3.3-70b-versatile', 'deepseek-r1-distill-llama-70b'],
    },
    nvidia: {
      name: 'NVIDIA NIM',
      available: false,
      models: ['llama-3.1-nemotron-70b-instruct'],
    },
  }

  const sampleKeyInfo = {
    gemini: { configured: true, key: 'fake-gemini-key' },
    groq: { configured: true, key: 'fake-groq-key' },
    nvidia: { configured: false, key: '' },
  }

  it('renders modal when open is true and shows model list with high contrast styling', () => {
    render(
      <LiveModelSearchModal
        open={true}
        onClose={vi.fn()}
        allProviders={sampleProviders}
        keyInfo={sampleKeyInfo}
        activeProvider="gemini"
        activeModel="gemini-2.5-flash"
        onSelectModel={vi.fn()}
      />
    )

    // Strings pinned to the component as it exists at HEAD ("Select Model",
    // guidance-in-placeholder, "API key needed" chip) — the old copy
    // ("Search & Switch AI Model" / "Search by model name" / "Needs Key")
    // does not exist anywhere in the shipped component.
    expect(screen.getByText('Select Model')).toBeDefined()
    expect(screen.getByPlaceholderText(/Search models/i)).toBeDefined()
    expect(screen.getByText('gemini-2.5-flash')).toBeDefined()
    expect(screen.getByText('llama-3.1-nemotron-70b-instruct')).toBeDefined()
    expect(screen.getByText(/API key needed/i)).toBeDefined()
  })

  it('filters models by multi-term search query', () => {
    render(
      <LiveModelSearchModal
        open={true}
        onClose={vi.fn()}
        allProviders={sampleProviders}
        keyInfo={sampleKeyInfo}
        activeProvider="gemini"
        activeModel="gemini-2.5-flash"
        onSelectModel={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText(/Search models/i)
    fireEvent.change(input, { target: { value: 'groq r1' } })

    expect(screen.getByText('deepseek-r1-distill-llama-70b')).toBeDefined()
    expect(screen.queryByText('gemini-2.5-flash')).toBeNull()
  })

  it('calls onSelectModel when clicking a model item', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <LiveModelSearchModal
        open={true}
        onClose={onClose}
        allProviders={sampleProviders}
        keyInfo={sampleKeyInfo}
        activeProvider="gemini"
        activeModel="gemini-2.5-flash"
        onSelectModel={onSelect}
      />
    )

    const item = screen.getByText('llama-3.3-70b-versatile')
    fireEvent.click(item)

    expect(onSelect).toHaveBeenCalledWith('groq', 'llama-3.3-70b-versatile')
    expect(onClose).toHaveBeenCalled()
  })
})
