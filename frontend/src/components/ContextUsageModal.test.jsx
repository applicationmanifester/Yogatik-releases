import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ContextUsageModal } from './ContextUsageModal'

describe('ContextUsageModal component', () => {
  let host = null
  let root = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  const mount = async (el) => {
    await act(async () => { root.render(el) })
  }

  const sampleMessages = [
    { role: 'user', content: 'Explain quantum computing in simple terms.' },
    { role: 'assistant', content: 'Quantum computing uses qubits that can exist in superpositions of 0 and 1.' },
  ]

  it('renders model, provider, token metrics, and breakdown', async () => {
    await mount(
      <ContextUsageModal
        messages={sampleMessages}
        systemPrompt="You are an expert physics tutor."
        input="Tell me more"
        provider="nvidia"
        model="nvidia/nemotron-3-nano-omni-30b-a3b-rea"
        docs={[{ id: 1, name: 'paper.pdf', chars: 4000, chunks: ['Quantum notes'] }]}
        onClose={vi.fn()}
      />,
    )

    expect(host.textContent).toContain('AI Context Window & Token Breakdown')
    expect(host.textContent).toContain('nvidia/nemotron-3-nano-omni-30b-a3b-rea')
    expect(host.textContent).toContain('NVIDIA')
    expect(host.textContent).toContain('System Prompt & Persona')
    expect(host.textContent).toContain('Conversation History')
    expect(host.textContent).toContain('Current Composer Draft')
    expect(host.textContent).toContain('Indexed Local RAG Corpus')
  })

  it('triggers onOpenAnalytics when clicking full analytics button', async () => {
    const onOpenAnalytics = vi.fn()
    const onClose = vi.fn()

    await mount(
      <ContextUsageModal
        messages={sampleMessages}
        systemPrompt=""
        input=""
        provider="openai"
        model="gpt-4o"
        onClose={onClose}
        onOpenAnalytics={onOpenAnalytics}
      />,
    )

    const analyticsBtn = host.querySelector('button[class*="btn-primary"]')
    expect(analyticsBtn).toBeTruthy()
    expect(analyticsBtn.textContent).toContain('Open Full Usage & Cost Analytics')

    await act(async () => {
      analyticsBtn.click()
    })

    expect(onClose).toHaveBeenCalled()
    expect(onOpenAnalytics).toHaveBeenCalled()
  })

  it('shows compact history button when message history is long', async () => {
    const onCompact = vi.fn()
    const longMessages = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: '5' },
    ]

    await mount(
      <ContextUsageModal
        messages={longMessages}
        systemPrompt=""
        input=""
        provider="openai"
        model="gpt-4o"
        onClose={vi.fn()}
        onCompact={onCompact}
      />,
    )

    const compactBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent.includes('Compact History'))
    expect(compactBtn).toBeTruthy()

    await act(async () => {
      compactBtn.click()
    })

    expect(onCompact).toHaveBeenCalled()
  })
})
