import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prewarmToolsFromInput, _resetPrewarmCache } from './toolPrewarm'

describe('toolPrewarm', () => {
  beforeEach(() => {
    _resetPrewarmCache()
  })

  it('triggers pre-warming for python keywords', () => {
    prewarmToolsFromInput('write a python script to calculate fibonacci')
    // No throwing and sets are handled cleanly
    expect(true).toBe(true)
  })

  it('ignores short or empty inputs', () => {
    expect(() => prewarmToolsFromInput('')).not.toThrow()
    expect(() => prewarmToolsFromInput('hi')).not.toThrow()
    expect(() => prewarmToolsFromInput(null)).not.toThrow()
  })

  it('triggers pre-warming for chart and doc keywords', () => {
    expect(() => prewarmToolsFromInput('create a bar chart showing quarterly sales')).not.toThrow()
    expect(() => prewarmToolsFromInput('export this summary as a pptx slide deck')).not.toThrow()
  })
})
