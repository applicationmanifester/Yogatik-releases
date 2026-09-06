import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GeminiDock } from './GeminiDock'

afterEach(() => {
  cleanup()
})

vi.mock('../tools/localFs', () => ({
  isDesktop: vi.fn(() => true),
  wsFindFiles: vi.fn(async () => ['src/App.jsx', 'src/llm.js']),
  wsRead: vi.fn(async () => 'console.log("hello gemini")'),
  wsWrite: vi.fn(async () => ({ success: true })),
  gitDiff: vi.fn(async () => 'diff --git a/test b/test'),
  gitStatus: vi.fn(async () => ({ branch: 'main', clean: true })),
  listRoots: vi.fn(async () => [{ path: '/Users/test/workspace' }]),
}))

vi.mock('../tools/geminiBridge', () => ({
  injectTextIntoGemini: vi.fn(async () => ({ success: true })),
  extractLatestCodeFromGemini: vi.fn(async () => ({
    blocks: [
      { id: 0, code: 'def solve(): return 42', language: 'python', lines: 1, filename: 'solution.py' }
    ]
  })),
  buildWorkspaceContextPrompt: vi.fn(() => 'Mock Gemini Workspace Context'),
}))

describe('GeminiDock Component', () => {
  it('renders header, title, and local file bridge actions', () => {
    render(<GeminiDock onClose={() => {}} />)

    expect(screen.getByText('Gemini.com Studio')).toBeTruthy()
    expect(screen.getByText(/Send File/)).toBeTruthy()
    expect(screen.getByText(/Send Workspace Context/)).toBeTruthy()
    expect(screen.getByText(/Send Git Diff/)).toBeTruthy()
    expect(screen.getByText(/Pull Code from Gemini/)).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<GeminiDock onClose={onClose} />)

    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens file picker modal when Send File is clicked', async () => {
    render(<GeminiDock onClose={() => {}} />)

    const sendFileBtn = screen.getByText(/Send File/)
    fireEvent.click(sendFileBtn)

    expect(await screen.findByText(/Select Workspace File to Send/)).toBeTruthy()
  })

  it('pulls code blocks and displays code drawer', async () => {
    render(<GeminiDock onClose={() => {}} />)

    const pullBtn = screen.getByText(/Pull Code from Gemini/)
    fireEvent.click(pullBtn)

    expect(await screen.findByText(/Extracted Code Blocks/)).toBeTruthy()
    expect(screen.getByText(/def solve\(\): return 42/)).toBeTruthy()
  })
})
