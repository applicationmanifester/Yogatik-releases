// @vitest-environment jsdom
//
// The panel exists because picking `chromeai` from the provider list used to
// have NOTHING in front of it — same "written and reached by nothing" shape
// this file's siblings (StylePicker, Tour, etc.) have hit before, except here
// the missing UI was also the missing CONSENT step ahead of a real download.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

const state = { avail: null, downloadError: null, progressSteps: [0.3, 1] }

vi.mock('../chromeAI', () => ({
  getChromeAIAvailability: vi.fn(async () => state.avail),
  triggerChromeAIDownload: vi.fn(async (onProgress) => {
    if (state.downloadError) throw new Error(state.downloadError)
    for (const p of state.progressSteps) onProgress?.(p)
  }),
}))

const { ChromeAIPanel } = await import('./ChromeAIPanel')
const chromeAI = await import('../chromeAI')

beforeEach(() => {
  state.avail = null
  state.downloadError = null
  chromeAI.getChromeAIAvailability.mockClear()
  chromeAI.triggerChromeAIDownload.mockClear()
})
afterEach(() => { cleanup() })

describe('ChromeAIPanel', () => {
  it('reports an honest reason when the Prompt API is unsupported, with no download button offered', async () => {
    state.avail = { available: false, state: 'unsupported', reason: 'This browser has no built-in AI.' }
    render(<ChromeAIPanel />)
    await waitFor(() => expect(screen.getByText(/isn.t available here/i)).toBeTruthy())
    expect(screen.getByText('This browser has no built-in AI.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
  })

  it('shows "ready" with no download step when the model is already on the device', async () => {
    state.avail = { available: true, state: 'available' }
    render(<ChromeAIPanel />)
    await waitFor(() => expect(screen.getByText(/\bready\b/i)).toBeTruthy())
    expect(screen.getByText(/Yogatik fetched nothing/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
  })

  it('asks for consent before downloading, shows live progress, and calls onReady once it lands', async () => {
    state.avail = {
      available: true, state: 'downloadable',
      reason: "The model isn't on this device yet — it downloads once.",
    }
    const onReady = vi.fn()
    render(<ChromeAIPanel onReady={onReady} />)

    const btn = await screen.findByRole('button', { name: /download and enable/i })
    // The consent text states it is a one-time, Chrome-managed download BEFORE
    // any request is made — the whole point of this panel existing at all.
    expect(screen.getByText(/downloads once, managed and cached by Chrome itself/i)).toBeTruthy()

    // Next probe (after the download) reports the model is now available.
    state.avail = { available: true, state: 'available' }
    fireEvent.click(btn)

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(chromeAI.triggerChromeAIDownload).toHaveBeenCalledTimes(1)
    // Re-probed after the download landed, not just trusted blindly.
    expect(chromeAI.getChromeAIAvailability).toHaveBeenCalledTimes(2)
  })

  it('surfaces a failed download instead of silently staying on the consent card', async () => {
    state.avail = { available: true, state: 'downloadable', reason: 'not yet downloaded' }
    state.downloadError = 'Could not start Chrome’s on-device model: boom'
    const onReady = vi.fn()
    render(<ChromeAIPanel onReady={onReady} />)

    const btn = await screen.findByRole('button', { name: /download and enable/i })
    fireEvent.click(btn)

    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy())
    expect(onReady).not.toHaveBeenCalled()
  })
})
