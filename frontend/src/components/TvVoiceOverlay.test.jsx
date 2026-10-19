import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { TvVoiceOverlay, tvVoiceMachine, tvStatusText, TV_VOICE_IDLE } from './TvVoiceOverlay'

/**
 * The mic hook is replaced wholesale: no real SpeechRecognition, no real
 * audio in this suite. `useCompanionVoice` is the Live pipeline the overlay
 * reuses in production; the mock only records that the overlay asked it to
 * start/stop and lets tests feed utterances back through the same
 * `onUtterance` seam the hook would.
 */
const { useCompanionVoice } = vi.hoisted(() => ({ useCompanionVoice: vi.fn() }))
vi.mock('../companion/useCompanionVoice', () => ({ useCompanionVoice }))

function stubMicVoice(overrides = {}) {
  const api = {
    available: true,
    listening: false,
    heard: '',
    voiceError: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    ...overrides,
  }
  useCompanionVoice.mockImplementation(() => api)
  return api
}

// Fallback for renders that never care about the mic (the hook runs on every
// render, including the hidden gate cases); stubMicVoice() overrides per test.
beforeEach(() => {
  stubMicVoice()
})

function mount(props = {}) {
  return render(
    <TvVoiceOverlay
      features={{ tvVoice: true }}
      onCommit={vi.fn()}
      {...props}
    />,
  )
}

afterEach(() => {
  cleanup()
  document.documentElement.dataset.device = ''
  vi.clearAllMocks()
})

describe('TvVoiceOverlay rendering gate', () => {
  it('renders only when data-device="tv" AND the tvVoice feature is on', () => {
    document.documentElement.dataset.device = 'laptop'
    const { container } = mount()
    expect(container.firstChild).toBeNull()
  })

  it('stays hidden on a TV while the feature is off (default OFF — never auto-listen)', () => {
    document.documentElement.dataset.device = 'tv'
    const { container } = mount({ features: { tvVoice: false } })
    expect(container.firstChild).toBeNull()
  })

  it('appears on a TV with the feature on: wake, status, mic toggle', () => {
    document.documentElement.dataset.device = 'tv'
    stubMicVoice()
    const { container } = mount()
    expect(screen.getByRole('button', { name: 'Listen' })).toBeDefined()
    expect(screen.getByText('Voice paused — press Enter to listen')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeDefined()
    // Never steals focus on mount — the D-pad must arrive here by choice.
    expect(document.activeElement).toBe(document.body)
    expect(container.querySelector('.tv-voice-overlay')).not.toBeNull()
  })

  it('reports the browser as voiceless when Live reports no recognition', () => {
    document.documentElement.dataset.device = 'tv'
    stubMicVoice({ available: false })
    mount()
    expect(screen.getByText('Voice recognition is not available in this browser')).toBeDefined()
  })
})

describe('TvVoiceOverlay d-pad flow', () => {
  beforeEach(() => { document.documentElement.dataset.device = 'tv' })

  it('Enter on the wake button toggles listening; status follows', () => {
    const voice = stubMicVoice()
    mount()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Listen' }), { key: 'Enter' })
    expect(voice.startListening).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Listening — say a message')).toBeDefined()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Stop listening' }), { key: 'Enter' })
    expect(screen.getByText('Voice paused — press Enter to listen')).toBeDefined()
  })

  it('Space toggles listening too', () => {
    const voice = stubMicVoice()
    mount()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Listen' }), { key: ' ' })
    expect(voice.startListening).toHaveBeenCalledTimes(1)
  })

  it('the mute toggle is a standing privacy stop: it silences the live mic', () => {
    const voice = stubMicVoice()
    const onCommit = vi.fn()
    const { rerender } = mount({ onCommit })
    // Wake, acknowledge the hook's live ack, and confirm the mic rests.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Listen' }), { key: 'Enter' })
    voice.listening = true
    rerender(<TvVoiceOverlay features={{ tvVoice: true }} onCommit={onCommit} />)
    expect(voice.stopListening).not.toHaveBeenCalled() // live mic intact so far
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }))
    expect(screen.getByText('Mic muted — press the button to unmute')).toBeDefined()
    expect(voice.stopListening).toHaveBeenCalledTimes(1) // live mic cut immediately
    // Re-enabling listening from the wake button: unmute-and-listen in one press.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Listen' }), { key: 'Enter' })
    expect(screen.getByText('Listening — say a message')).toBeDefined()
  })

  it('Escape closes the overlay and stops a live mic', () => {
    const voice = stubMicVoice()
    const onCommit = vi.fn()
    const { container, rerender } = mount({ onCommit })
    // Wake, then acknowledge the live mic the way the hook would.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Listen' }), { key: 'Enter' })
    voice.listening = true
    rerender(<TvVoiceOverlay features={{ tvVoice: true }} onCommit={onCommit} />)
    expect(voice.stopListening).not.toHaveBeenCalled() // live mic intact so far
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.firstChild).toBeNull()
    expect(voice.stopListening).toHaveBeenCalledTimes(1)
  })

  it('wake button works by click too (air-mouse TVs)', () => {
    const voice = stubMicVoice()
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }))
    expect(voice.startListening).toHaveBeenCalledTimes(1)
  })
})

describe('TvVoiceOverlay transcript commit', () => {
  beforeEach(() => { document.documentElement.dataset.device = 'tv' })

  it('a committed utterance reaches the onCommit prop (composer → send path)', () => {
    stubMicVoice()
    const onCommit = vi.fn()
    mount({ onCommit })

    const hookArgs = useCompanionVoice.mock.calls.at(-1)[0]
    act(() => { hookArgs.onUtterance('  turn up the volume  ') })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('turn up the volume')
  })

  it('an empty utterance commits nothing', () => {
    stubMicVoice()
    const onCommit = vi.fn()
    mount({ onCommit })
    const hookArgs = useCompanionVoice.mock.calls.at(-1)[0]
    act(() => { hookArgs.onUtterance('   ') })
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('tvVoiceMachine (pure listening state machine)', () => {
  it('wake pauses on a second wake, and sleep stops without flipping the mute preference', () => {
    const on = tvVoiceMachine(TV_VOICE_IDLE, { type: 'wake' })
    expect(on).toEqual({ listening: true, muted: false })

    const off = tvVoiceMachine(on, { type: 'sleep' })
    expect(off).toEqual({ listening: false, muted: false })
  })

  it('mute is transport AND preference: listening off, muted standing', () => {
    const on = { listening: true, muted: false }
    expect(tvVoiceMachine(on, { type: 'mute' })).toEqual({ listening: false, muted: true })
    expect(tvVoiceMachine(on, { type: 'sleep' })).toEqual({ listening: false, muted: false })
  })

  it('waking a muted mic unmutes and listens in one press', () => {
    const muted = { listening: false, muted: true }
    expect(tvVoiceMachine(muted, { type: 'wake' })).toEqual({ listening: true, muted: false })
  })

  it('unmute clears the preference but does not start listening', () => {
    const muted = { listening: false, muted: true }
    expect(tvVoiceMachine(muted, { type: 'unmute' })).toEqual({ listening: false, muted: false })
  })

  it('unknown actions are a no-op', () => {
    expect(tvVoiceMachine(TV_VOICE_IDLE, { type: 'nonsense' })).toEqual(TV_VOICE_IDLE)
    expect(tvVoiceMachine()).toEqual(TV_VOICE_IDLE)
  })
})

describe('tvStatusText (pure)', () => {
  it('errors win, then mute, then unavailability, then live vs paused', () => {
    expect(tvStatusText({ available: true, muted: false, listening: false, error: 'no mic' })).toBe('no mic')
    expect(tvStatusText({ available: true, muted: true })).toBe('Mic muted — press the button to unmute')
    expect(tvStatusText({ available: false })).toBe('Voice recognition is not available in this browser')
    expect(tvStatusText({ available: true, listening: true })).toBe('Listening — say a message')
    expect(tvStatusText({ available: true, listening: true, heard: ' hello ' })).toBe('Heard: “hello”')
    expect(tvStatusText({ available: true })).toBe('Voice paused — press Enter to listen')
  })
})
