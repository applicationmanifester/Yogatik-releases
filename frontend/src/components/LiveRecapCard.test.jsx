/**
 * [live-recording] tests for the post-call recap card.
 *
 * The card is the Horizon-1 item-4 leave-behind: executive summary, action
 * items, artefacts produced, cited sources — plus the two CTAs. "Save to
 * conversation" is tested against a STUB writer because the real path
 * (LiveView's onTranscript → App's saveLiveTurn → saveMessage) is precisely the
 * seam the card hands off to; the card's own contract is that onSave receives
 * the full recap markdown.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { LiveRecapCard } from './LiveRecapCard'

const RECAP = {
  markdown: '### 🎙️ Live Session Brief (1m 45s) · ENGINEERING\n* **Model / Mode:** `gemini-2.5-flash` (gemini)',
  summary: ['Explored: "Where did this regressed double-answer come from?"'],
  actions: ['Fix the double-answer bug', 'Verify the transcript drawer'],
  artefacts: ['web_search', 'Quantum primer'],
  sources: ['https://arxiv.example/vaswani'],
  recording: {
    startedAt: 0, durationSec: 8,
    turns: [{ at: 0, speaker: 'user', text: 'What changed?' }],
    toolEvents: [{ at: 3_000, name: 'web_search', kind: 'result' }],
    frames: [{ at: 0, thumb: 'data:image/jpeg;base64,AAAA', w: 320, h: 240 }],
  },
}

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

it('renders the summary, action items, artefacts and sources sections', () => {
  render(<LiveRecapCard recap={RECAP} onSave={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText('Executive summary')).toBeTruthy()
  expect(screen.getByText(/Where did this regressed double-answer come from\?/)).toBeTruthy()
  expect(screen.getByText('Action items')).toBeTruthy()
  expect(screen.getByText('Fix the double-answer bug')).toBeTruthy()
  expect(screen.getByText('Verify the transcript drawer')).toBeTruthy()
  expect(screen.getByText('Artefacts produced')).toBeTruthy()
  expect(screen.getByText('web_search')).toBeTruthy()
  expect(screen.getByText('Quantum primer')).toBeTruthy()
  expect(screen.getByText('Sources & cited links')).toBeTruthy()
  const link = screen.getByRole('link')
  expect(link.getAttribute('href')).toBe('https://arxiv.example/vaswani')
  expect(screen.getByTestId('live-recap-markdown').textContent).toMatch(/Live Session Brief/)
})

it('shows the Playback toggle only when a recording exists, and it opens the player', async () => {
  render(<LiveRecapCard recap={RECAP} onSave={vi.fn()} onClose={vi.fn()} />)
  const play = screen.getByRole('button', { name: 'Playback' })
  expect(play.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(play)
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Recording timeline' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Hide playback' })).toBeTruthy()
})

it('Save writes the FULL recap markdown through the stubbed save path, once per ask', async () => {
  const onSave = vi.fn()
  render(<LiveRecapCard recap={RECAP} onSave={onSave} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save to conversation' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave).toHaveBeenCalledWith(RECAP.markdown)
  expect(await screen.findByText('Saved ✓')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Close recap' })).toBeTruthy() // still dismissable
})

it('Copy keeps the card open (the text is the deliverable; the clipboard is a copy)', async () => {
  let written = ''
  let orig = null
  try {
    orig = navigator.clipboard || null
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t) => { written = t } },
    })
    render(<LiveRecapCard recap={{ ...RECAP, recording: null }} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull()   // no recording → no toggle

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(screen.getByText('Copied ✓')).toBeTruthy())
    expect(written).toBe(RECAP.markdown)
  } finally {
    if (orig) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: orig })
    else delete navigator.clipboard
  }
})

it('Escape (or the close button) dismisses and hands control back to the caller', () => {
  const onClose = vi.fn()
  render(<LiveRecapCard recap={RECAP} onSave={vi.fn()} onClose={onClose} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close recap' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})

it('Escape with the player open unwinds the PLAYER first, not the card', async () => {
  const onClose = vi.fn()
  render(<LiveRecapCard recap={RECAP} onSave={vi.fn()} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Playback' }))
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Recording timeline' })).toBeTruthy())

  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('slider', { name: 'Recording timeline' })).toBeNull())
  expect(onClose).not.toHaveBeenCalled()   // the card survives; the player went
})

it('empty sections degrade to an em-dash, not a crash', () => {
  render(<LiveRecapCard recap={{ markdown: '### 🎙️ brief', summary: [], actions: [], artefacts: [], sources: [], recording: null }} onSave={vi.fn()} onClose={vi.fn()} />)
  const dashes = screen.getAllByText('—')
  expect(dashes.length).toBeGreaterThanOrEqual(3)
  expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull()
})
