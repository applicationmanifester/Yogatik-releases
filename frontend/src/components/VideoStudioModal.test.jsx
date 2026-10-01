import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VideoStudioModal } from './VideoStudioModal'

describe('VideoStudioModal Component', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.__YOGATIK_DESKTOP__ = {
      openVlc: vi.fn().mockResolvedValue({ success: true, player: 'vlc' }),
      openPath: vi.fn().mockResolvedValue(true),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(<VideoStudioModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders modal dialog and empty state when opened with no source', () => {
    render(<VideoStudioModal isOpen={true} onClose={() => {}} />)
    expect(screen.getByText('Video Studio & Precision Trimmer')).toBeDefined()
    expect(screen.getByText('No video loaded')).toBeDefined()
    expect(screen.getByText('Load Demo Video')).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<VideoStudioModal isOpen={true} onClose={handleClose} />)
    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalled()
  })

  it('loads demo video when Load Demo Video button is clicked', () => {
    render(<VideoStudioModal isOpen={true} onClose={() => {}} />)
    const demoBtn = screen.getByText('Load Demo Video')
    fireEvent.click(demoBtn)
    expect(screen.getByText('Demo Sample (Blazes 1080p)')).toBeDefined()
  })

  it('allows switching aspect ratio display chips', () => {
    render(<VideoStudioModal isOpen={true} onClose={() => {}} />)
    const chip916 = screen.getByText('9:16 (Shorts/Reels)')
    fireEvent.click(chip916)
    expect(chip916.className).toContain('active')
  })

  it('triggers VLC launch when Open in VLC button is clicked with active video', async () => {
    render(<VideoStudioModal isOpen={true} onClose={() => {}} initialVideoUrl="https://example.com/test.mp4" />)
    const vlcBtn = screen.getByRole('button', { name: /Open in VLC/i })
    expect(vlcBtn.disabled).toBe(false)
    fireEvent.click(vlcBtn)
    expect(window.__YOGATIK_DESKTOP__.openVlc).toHaveBeenCalledWith('https://example.com/test.mp4')
  })

  it('triggers dedicated window pop-out when Dedicated Window button is clicked', async () => {
    window.__YOGATIK_DESKTOP__.openVideoStudio = vi.fn().mockResolvedValue({ success: true, isOpened: true })
    const handleClose = vi.fn()
    render(<VideoStudioModal isOpen={true} onClose={handleClose} initialVideoUrl="https://example.com/test.mp4" />)
    const popoutBtn = screen.getByTitle(/Pop out into a dedicated, resizable desktop window/i)
    fireEvent.click(popoutBtn)
    expect(window.__YOGATIK_DESKTOP__.openVideoStudio).toHaveBeenCalledWith(
      expect.objectContaining({ videoUrl: 'https://example.com/test.mp4' })
    )
    await vi.waitFor(() => {
      expect(handleClose).toHaveBeenCalled()
    })
  })

  it('switches to Color FX tab and renders filter presets', () => {
    render(<VideoStudioModal isOpen={true} onClose={() => {}} />)
    const colorFxTab = screen.getByText('Color FX')
    fireEvent.click(colorFxTab)
    expect(screen.getByText('Live Color Grading')).toBeDefined()
    expect(screen.getByText('Cinematic Warm')).toBeDefined()
    expect(screen.getByText('Cyberpunk Neon')).toBeDefined()
  })

  it('switches to Titles tab and toggles title overlay', () => {
    render(<VideoStudioModal isOpen={true} onClose={() => {}} />)
    const titlesTab = screen.getByText('Titles')
    fireEvent.click(titlesTab)
    expect(screen.getByText('Enable Title Overlay')).toBeDefined()
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(screen.getByText('Lower Third')).toBeDefined()
  })
})
