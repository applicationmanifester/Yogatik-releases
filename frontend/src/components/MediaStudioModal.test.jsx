import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MediaStudioModal } from './MediaStudioModal'
import { saveStoredStudioRun } from '../mediaStudioCatalog'

describe('MediaStudioModal Component', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<MediaStudioModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders header, model picker, parameter pills, and prompt box when isOpen is true', () => {
    render(<MediaStudioModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByText('Creative Media Studio')).toBeDefined()
    expect(screen.getByText(/38 Models/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/Describe your video scene/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Render Video/i })).toBeDefined()
  })

  it('toggles model category filters between All, Video, and Image', () => {
    const { container } = render(<MediaStudioModal isOpen={true} onClose={() => {}} />)

    const catPills = container.querySelector('.studio-cat-pills')
    const buttons = catPills.querySelectorAll('button')

    expect(buttons.length).toBe(3)
    const [allBtn, videoBtn, imageBtn] = buttons

    fireEvent.click(imageBtn)
    expect(imageBtn.classList.contains('active')).toBe(true)

    fireEvent.click(videoBtn)
    expect(videoBtn.classList.contains('active')).toBe(true)
  })

  it('allows typing a prompt and toggling settings', () => {
    const { container } = render(<MediaStudioModal isOpen={true} onClose={() => {}} />)

    const textarea = screen.getByPlaceholderText(/Describe your video scene/i)
    fireEvent.change(textarea, { target: { value: 'A golden retriever playing in neon rain 8k' } })
    expect(textarea.value).toBe('A golden retriever playing in neon rain 8k')

    // Change aspect ratio dropdown
    const select = container.querySelector('.studio-select')
    if (select) {
      fireEvent.change(select, { target: { value: '9:16' } })
      expect(select.value).toBe('9:16')
    }
  })

  it('renders existing runs from storage in the gallery and opens viewer on click', () => {
    const mockRun = {
      id: 'run_test_1',
      modelId: 'kling-3-turbo',
      modelName: 'Kling 3 Turbo',
      kind: 'video',
      prompt: 'Cinematic hyperlapse of cyberpunk city',
      settings: { aspectRatio: '16:9', duration: '5s', resolution: '720p', motion: 6 },
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      timestamp: Date.now(),
      favorite: false,
      aspectRatio: '16:9',
      isLiveKey: false,
    }

    saveStoredStudioRun(mockRun)

    render(<MediaStudioModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByText('Cinematic hyperlapse of cyberpunk city')).toBeDefined()
    expect(screen.getByText('Kling 3 Turbo')).toBeDefined()

    // Click the card to open the viewer
    const promptEl = screen.getByText('Cinematic hyperlapse of cyberpunk city')
    const cardEl = promptEl.closest('.studio-media-card')
    fireEvent.click(cardEl)

    // Viewer overlay should now be open
    expect(screen.getByText('PROMPT')).toBeDefined()
    expect(screen.getByText(/Aspect: 16:9/i)).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(<MediaStudioModal isOpen={true} onClose={handleClose} />)

    const closeBtn = screen.getByTitle('Close Studio')
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
