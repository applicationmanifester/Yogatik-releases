import { describe, it, expect, vi } from 'vitest'

// The heuristic is pure; its module's storage/network edges are not needed here.
vi.mock('../db', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }))
vi.mock('../llm', () => ({ chatComplete: vi.fn() }))

const { looksVisionCapable } = await import('./capability')

describe('vision name heuristic', () => {
  it('recognises the families that actually take images', () => {
    for (const m of [
      'gpt-4o', 'gpt-4.1-mini', 'gemini-2.5-flash',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'qwen/qwen2.5-vl-72b-instruct', 'mistralai/pixtral-12b',
      'llava-hf/llava-1.5-7b', 'microsoft/phi-3.5-vision-instruct',
      'nvidia/nemotron-nano-vl-8b',
    ]) expect(looksVisionCapable(m), m).toBe(true)
  })

  it('rejects text-only and non-chat models', () => {
    for (const m of [
      'llama-3.3-70b-instruct', 'mixtral-8x7b', 'deepseek-r1',
      'text-embedding-3-large', 'baai/bge-m3', 'whisper-large-v3',
      'llama-guard-4-12b', 'qwen2.5-coder-32b',
    ]) expect(looksVisionCapable(m), m).toBe(false)
  })

  it('lets the exclusion list win over a matching keyword', () => {
    // "guard" and "embed" beat "vision"/"vl" — these never accept chat images.
    expect(looksVisionCapable('llama-guard-vision-11b')).toBe(false)
    expect(looksVisionCapable('nomic-embed-vision-v1.5')).toBe(false)
  })

  it('handles empty input', () => {
    expect(looksVisionCapable('')).toBe(false)
    expect(looksVisionCapable(undefined)).toBe(false)
  })
})
