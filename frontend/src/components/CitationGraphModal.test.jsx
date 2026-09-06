import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CitationGraphModal } from './CitationGraphModal'

let host = null
let root = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('CitationGraphModal Component', () => {
  it('renders nothing when closed', () => {
    act(() => {
      root.render(<CitationGraphModal isOpen={false} onClose={() => {}} />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders semantic memory nodes and graph when open', () => {
    act(() => {
      root.render(<CitationGraphModal isOpen={true} onClose={() => {}} />)
    })
    expect(host.textContent).toContain('Interactive Knowledge & Memory Graph')
    expect(host.textContent).toContain('Semantic Memory')
    expect(host.textContent).toContain('SEMANTIC CLUSTER')
  })

  it('switches between semantic memory and research citations modes', () => {
    act(() => {
      root.render(<CitationGraphModal isOpen={true} onClose={() => {}} />)
    })

    const buttons = host.querySelectorAll('button')
    const citationsBtn = Array.from(buttons).find(b => b.textContent.includes('Research Citations'))
    expect(citationsBtn).toBeDefined()

    act(() => {
      citationsBtn.click()
    })

    expect(host.textContent).toContain('RESEARCH CLUSTER')
    expect(host.textContent).toContain('Federated RAG Graph')
  })

  it('allows clicking a node to inspect and copy details', () => {
    act(() => {
      root.render(<CitationGraphModal isOpen={true} onClose={() => {}} />)
    })

    const nodeElement = host.querySelector('svg g')
    expect(nodeElement).not.toBeNull()

    act(() => {
      nodeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host.textContent).toContain('Confidence:')
    expect(host.textContent).toContain('Copy Text')
    expect(host.textContent).toContain('Prune from Memory')
  })
})
