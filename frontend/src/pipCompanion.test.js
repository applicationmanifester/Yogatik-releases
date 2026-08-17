import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isDocumentPipSupported,
  isScreenCaptureSupported,
  openDocumentPip,
  closeDocumentPip,
  getActivePipWindow,
} from './pipCompanion'

describe('pipCompanion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.documentPictureInPicture
  })

  it('detects documentPictureInPicture capability correctly', () => {
    expect(isDocumentPipSupported()).toBe(false)
    window.documentPictureInPicture = { requestWindow: vi.fn() }
    expect(isDocumentPipSupported()).toBe(true)
  })

  it('detects screen capture capability correctly', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getDisplayMedia: vi.fn() },
      configurable: true,
      writable: true,
    })
    expect(isScreenCaptureSupported()).toBe(true)
  })

  it('opens and closes Document PiP window cleanly', async () => {
    const mockPipDoc = {
      createElement: vi.fn(() => ({ appendChild: vi.fn() })),
      head: { appendChild: vi.fn() },
      body: { appendChild: vi.fn() },
    }
    const mockPipWin = {
      document: mockPipDoc,
      addEventListener: vi.fn(),
      close: vi.fn(),
      closed: false,
      focus: vi.fn(),
    }

    window.documentPictureInPicture = {
      requestWindow: vi.fn().mockResolvedValue(mockPipWin),
    }

    const win = await openDocumentPip()
    expect(win).toBe(mockPipWin)
    expect(getActivePipWindow()).toBe(mockPipWin)

    closeDocumentPip()
    expect(mockPipWin.close).toHaveBeenCalled()
  })
})
