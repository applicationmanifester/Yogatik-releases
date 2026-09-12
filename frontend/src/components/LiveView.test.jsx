import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
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
