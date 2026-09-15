import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ArtifactPanel } from './ArtifactPanel'

describe('ArtifactPanel Component', () => {
  afterEach(() => {
    cleanup()
  })

  const sampleArtifact = {
    title: 'Dashboard Widget',
    language: 'html',
    code: '<div class="card"><h1>Hello Yogatik</h1><style>.card{padding:20px;}</style></div>',
  }

  it('renders artifact title and live preview tab by default', () => {
    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)
    expect(screen.getByText('Dashboard Widget')).toBeDefined()
    expect(screen.getByText('Live Preview')).toBeDefined()
  })

  it('toggles verification inspector on clicking sparkles button', () => {
    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)
    const verifyBtn = screen.getByLabelText('Inspect layout')
    expect(verifyBtn).toBeDefined()

    fireEvent.click(verifyBtn)
    expect(screen.getByText('Valid Structure')).toBeDefined()
    expect(screen.getByText('Ask AI to Refine Layout')).toBeDefined()
  })

  it('copies verification report to clipboard on button click', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Inspect layout'))

    const copyReportBtn = screen.getByText('Copy Report')
    fireEvent.click(copyReportBtn)
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('Artifact Layout Report'))
  })

  it('supports responsive viewport switching between desktop, tablet, and mobile', () => {
    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)

    const tabletBtn = screen.getByLabelText('Tablet viewport')
    const mobileBtn = screen.getByLabelText('Mobile viewport')
    const desktopBtn = screen.getByLabelText('Desktop viewport')
    const reloadBtn = screen.getByLabelText('Reload preview')

    expect(tabletBtn).toBeDefined()
    expect(mobileBtn).toBeDefined()
    expect(desktopBtn).toBeDefined()
    expect(reloadBtn).toBeDefined()

    fireEvent.click(mobileBtn)
    fireEvent.click(tabletBtn)
    fireEvent.click(desktopBtn)
    fireEvent.click(reloadBtn)
  })
})
