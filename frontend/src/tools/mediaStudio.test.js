import { describe, it, expect, beforeEach, vi } from 'vitest'
import { studioMediaGenTool } from './mediaStudio'
import { getStoredStudioRuns } from '../mediaStudioCatalog'

describe('studioMediaGenTool', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('validates schema requirements', () => {
    expect(studioMediaGenTool.schema.description).toBeDefined()
    expect(studioMediaGenTool.schema.parameters.type).toBe('object')
    expect(studioMediaGenTool.schema.parameters.required).toContain('prompt')
  })

  it('rejects calls without prompt without throwing TypeError', async () => {
    const res = await studioMediaGenTool.execute({})
    expect(res.success).toBe(false)
    expect(res.error).toBe('prompt is required')
  })

  it('generates mock media asset in preview mode and records in history', async () => {
    const res = await studioMediaGenTool.execute({
      prompt: 'A futuristic cybernetic tiger running through neon jungle',
      model: 'kling-3-turbo',
      kind: 'video',
      aspect_ratio: '16:9',
      duration: '5s',
      motion: 7,
    })

    expect(res.success).toBe(true)
    expect(res.tool).toBe('studio_media_generate')
    expect(res.model).toBe('kling-3-turbo')
    expect(res.media_url).toBeDefined()
    expect(res.settings.aspectRatio).toBe('16:9')

    const history = getStoredStudioRuns()
    expect(history.length).toBe(1)
    expect(history[0].prompt).toBe('A futuristic cybernetic tiger running through neon jungle')
  })

  it('supports image models like flux-1-dev', async () => {
    const res = await studioMediaGenTool.execute({
      prompt: 'A hyperrealistic oil painting of an ancient library',
      model: 'flux-1-dev',
      kind: 'image',
      aspect_ratio: '1:1',
      resolution: '1080p',
    })

    expect(res.success).toBe(true)
    expect(res.kind).toBe('image')
    expect(res.media_url).toContain('pollinations')
  })
})
