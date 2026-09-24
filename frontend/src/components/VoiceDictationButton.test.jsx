import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { VoiceDictationButton } from './VoiceDictationButton'

afterEach(cleanup)

describe('VoiceDictationButton Component', () => {
  let startMock
  let stopMock

  beforeEach(() => {
    startMock = vi.fn()
    stopMock = vi.fn()

    class MockSpeechRecognition {
      constructor() {
        this.start = startMock
        this.stop = stopMock
        this.continuous = false
        this.interimResults = false
        this.lang = ''
        this.onresult = null
        this.onerror = null
        this.onend = null
      }
    }

    window.SpeechRecognition = MockSpeechRecognition
  })

  it('renders button and toggles listening state on click', () => {
    render(<VoiceDictationButton onTranscript={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDefined()

    fireEvent.click(btn)
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('returns null if SpeechRecognition is not supported', () => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    const { container } = render(<VoiceDictationButton onTranscript={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
