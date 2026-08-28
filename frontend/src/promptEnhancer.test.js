import { describe, it, expect, vi } from 'vitest'
import { enhancePromptText } from './promptEnhancer'

describe('promptEnhancer', () => {
  it('returns short inputs directly without modification', async () => {
    const res = await enhancePromptText('hi')
    expect(res).toBe('hi')
  })

  it('appends fallback requirements if LLM call is unavailable', async () => {
    const res = await enhancePromptText('create a rest api for books')
    expect(res).toContain('create a rest api for books')
    expect(res).toContain('Key Requirements:')
  })
})
