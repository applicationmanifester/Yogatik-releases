import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { LiveView } from './LiveView'

// Mock dependencies that require full browser APIs
vi.mock('../live/session', () => ({
  createLiveSession: vi.fn().mockReturnValue({ start: vi.fn().mockReturnValue(Promise.resolve()), stop: vi.fn() }),
}))
vi.mock('../live/cascade', () => ({
  createCascadeSession: vi.fn().mockReturnValue({ start: vi.fn().mockReturnValue(Promise.resolve()), stop: vi.fn() }),
}))
vi.mock('../live/devices', () => ({
  enumerate: vi.fn().mockResolvedValue({ cameras: [], mics: [] }),
  canFlipCamera: vi.fn().mockReturnValue(false),
}))
vi.mock('../vision/detect', () => ({
  detectObjects: vi.fn().mockResolvedValue([]),
}))
vi.mock('../vision/source', () => ({
  captureProfile: vi.fn(),
  describeWithoutModel: vi.fn(),
  getSharedVisualSource: vi.fn(),
  needsMotion: vi.fn(),
}))

describe('LiveView mount and render', () => {
  it('renders without throwing TDZ reference errors', () => {
    expect(() => {
      render(
        <LiveView
          provider="gemini"
          apiKey="test-key"
          model="gemini-2.5-flash"
          onEnd={vi.fn()}
        />
      )
    }).not.toThrow()
  })
})

// RTL has no auto-cleanup in this vitest config (no globals) — do it here so
// each test starts with an empty container.
afterEach(() => {
  cleanup()
})

// [live-redesign] Cockpit presentation tests. Logic wiring (gemini/cascade
// session creation, metrics, guards) is untouched by the redesign — these
// only pin the NEW chrome contract: one command bar, one "more" sheaf, and
// the transcript drawer as its own surface.
describe('LiveView cockpit', () => {
  const baseProps = {
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    onEnd: vi.fn(),
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the bottom command bar with mic / cam / screen / end + the hub', () => {
    render(<LiveView {...baseProps} />)
    // Four primary call controls (labels carried by aria-label)
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn camera on' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'End call' })).toBeTruthy()
    // The "more" hub exposes dialog semantics + its target id
    const hub = screen.getByRole('button', { name: 'More live controls' })
    expect(hub.getAttribute('aria-haspopup')).toBe('dialog')
    expect(hub.getAttribute('aria-expanded')).toBe('false')
    expect(hub.getAttribute('aria-controls')).toBe('live-cockpit-sheaf')
  })

  it('toggles the sheaf via the hub (aria-expanded + aria-hidden mirror)', () => {
    render(<LiveView {...baseProps} />)
    const hub = screen.getByRole('button', { name: 'More live controls' })

    fireEvent.click(hub)
    const sheaf = document.getElementById('live-cockpit-sheaf')
    expect(sheaf).toBeTruthy()
    expect(sheaf.getAttribute('aria-hidden')).toBe('false')
    expect(hub.getAttribute('aria-expanded')).toBe('true')
    // The hub renames itself to "Close more controls" when open — scope this
    // query to the sheaf so only the panel's own close button matches.
    expect(within(sheaf).getByRole('button', { name: 'Close more controls' })).toBeTruthy()

    // Transcript row announces its target drawer instead of hidden chrome
    const row = screen.getByRole('button', { name: /Transcript & activity/i })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(row.getAttribute('aria-controls')).toBe('live-transcript-drawer')

    fireEvent.click(within(sheaf).getByRole('button', { name: 'Close more controls' }))
    expect(hub.getAttribute('aria-expanded')).toBe('false')
    expect(sheaf.getAttribute('aria-hidden')).toBe('true')
  })

  it('Escape closes the sheaf and returns focus to the hub', async () => {
    render(<LiveView {...baseProps} />)
    const hub = screen.getByRole('button', { name: 'More live controls' })

    fireEvent.click(hub)
    expect(hub.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(hub))
    expect(hub.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the transcript drawer from the sheaf row; sheaf yields to it', async () => {
    render(<LiveView {...baseProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'More live controls' }))
    fireEvent.click(screen.getByRole('button', { name: /Transcript & activity/i }))

    const drawer = await waitFor(() => {
      const el = document.getElementById('live-transcript-drawer')
      if (!el) throw new Error('drawer not mounted yet')
      return el
    })
    expect(drawer.getAttribute('role')).toBe('complementary')
    // One-surface intent: the sheaf closed when the drawer took over
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'More live controls' }).getAttribute('aria-expanded')
      ).toBe('false')
    )

    // Closing the drawer (its own close button) unmounts it…
    fireEvent.click(screen.getByRole('button', { name: 'Close transcript drawer' }))
    await waitFor(() => expect(document.getElementById('live-transcript-drawer')).toBeNull())
    // …and focus lands back on the command-bar hub
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More live controls' })))
  })
})
