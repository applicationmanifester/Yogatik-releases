import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GrokDock } from './GrokDock'

afterEach(() => {
  cleanup()
})

vi.mock('../tools/localFs', () => ({
  isDesktop: vi.fn(() => true),
  wsFindFiles: vi.fn(async () => ['src/App.jsx', 'src/llm.js']),
  wsRead: vi.fn(async () => 'console.log("hello")'),
  wsWrite: vi.fn(async () => ({ success: true })),
  gitDiff: vi.fn(async () => 'diff --git a/test b/test'),
  gitStatus: vi.fn(async () => ({ branch: 'main', clean: true })),
  listRoots: vi.fn(async () => [{ path: '/Users/test/workspace' }]),
}))

vi.mock('../tools/grokBridge', () => ({
  injectTextIntoGrok: vi.fn(async () => ({ success: true })),
  extractLatestCodeFromGrok: vi.fn(async () => ({
    blocks: [
      { id: 0, code: 'function add(a, b) { return a + b }', language: 'javascript', lines: 1, filename: 'calc.js' }
    ]
  })),
  buildWorkspaceContextPrompt: vi.fn(() => 'Mock Workspace Context'),
}))

describe('GrokDock Component', () => {
  it('renders header, title, and local file bridge actions', () => {
    render(<GrokDock onClose={() => {}} />)

    expect(screen.getByText('Grok.com Studio')).toBeTruthy()
    expect(screen.getByText(/Send File/)).toBeTruthy()
    expect(screen.getByText(/Send Workspace Context/)).toBeTruthy()
    expect(screen.getByText(/Send Git Diff/)).toBeTruthy()
    expect(screen.getByText(/Pull Code from Grok/)).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<GrokDock onClose={onClose} />)

    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens file picker modal when Send File is clicked', async () => {
    render(<GrokDock onClose={() => {}} />)

    const sendFileBtn = screen.getByText(/Send File/)
    fireEvent.click(sendFileBtn)

    expect(await screen.findByText(/Select Workspace File to Send/)).toBeTruthy()
  })

  it('pulls code blocks and displays code drawer', async () => {
    render(<GrokDock onClose={() => {}} />)

    const pullBtn = screen.getByText(/Pull Code from Grok/)
    fireEvent.click(pullBtn)

    expect(await screen.findByText(/Extracted Code Blocks/)).toBeTruthy()
    expect(screen.getByText(/function add\(a, b\)/)).toBeTruthy()
  })
})
