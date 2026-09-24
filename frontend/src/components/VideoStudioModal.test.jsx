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
})
