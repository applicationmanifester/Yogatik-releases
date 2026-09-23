import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { RagDocumentsModal } from './RagDocumentsModal'

describe('RagDocumentsModal component', () => {
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

  const sampleDocs = [
    {
      id: 1,
      name: 'annual_report.pdf',
      size: 10240,
      chars: 2500,
      chunks: ['Passage 1 content from the annual report.', 'Passage 2 financial tables.'],
      createdAt: Date.now() - 3600000,
    },
    {
      id: 2,
      name: 'notes.txt',
      size: 512,
      chars: 300,
      chunks: ['Meeting notes and action items.'],
      createdAt: Date.now(),
    },
  ]

  it('renders indexed documents and storage location details', async () => {
    await mount(
      <RagDocumentsModal
        docs={sampleDocs}
        activeProject={{ id: 'p1', name: 'Finance Project' }}
        onClose={vi.fn()}
      />,
    )

    expect(host.textContent).toContain('Local RAG Knowledge & Document Index')
    expect(host.textContent).toContain('Project: Finance Project')
    expect(host.textContent).toContain('annual_report.pdf')
    expect(host.textContent).toContain('notes.txt')
    expect(host.textContent).toContain('2 files')
  })

  it('allows viewing extracted passages and previewing chunk content', async () => {
    await mount(
      <RagDocumentsModal
        docs={sampleDocs}
        activeProject={{ id: 'p1', name: 'Finance Project' }}
        onClose={vi.fn()}
      />,
    )

    // Click "View" on the first doc
    const viewButtons = host.querySelectorAll('button[title*="View extracted passages"]')
    expect(viewButtons.length).toBeGreaterThan(0)

    await act(async () => {
      viewButtons[0].click()
    })

    expect(host.textContent).toContain('Viewing Passages: annual_report.pdf')
    expect(host.textContent).toContain('Passage 1 content from the annual report.')
  })

  it('triggers onDeleteDoc when deleting a document', async () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await mount(
      <RagDocumentsModal
        docs={sampleDocs}
        onDeleteDoc={onDelete}
        onClose={vi.fn()}
      />,
    )

    const deleteButtons = host.querySelectorAll('button[title="Delete from RAG index"]')
    expect(deleteButtons.length).toBe(2)

    await act(async () => {
      deleteButtons[0].click()
    })

    expect(onDelete).toHaveBeenCalledWith(1)
  })

  it('renders empty state when no documents are indexed', async () => {
    await mount(
      <RagDocumentsModal
        docs={[]}
        activeProject={null}
        onClose={vi.fn()}
      />,
    )

    expect(host.textContent).toContain('No documents indexed in this project yet')
    expect(host.textContent).toContain('Select File to Index')
  })
})
