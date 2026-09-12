import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enhancePromptText } from './api'
import * as llm from './llm'

describe('enhancePromptText', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty string if given empty or whitespace prompt', async () => {
    expect(await enhancePromptText('')).toBe('')
    expect(await enhancePromptText('   ')).toBe('   ')
  })

  it('returns full enhanced prompt when stream completes normally', async () => {
    vi.spyOn(llm, 'streamChat').mockImplementation(async ({ onToken, onDone }) => {
      onToken('Write a production-ready Python script ')
      onToken('that validates email addresses using regex.')
      onDone()
    })

    const res = await enhancePromptText('python email check', {
      provider: 'ollama',
      model: 'llama3',
      apiKey: 'test-key',
    })

    expect(res).toBe('Write a production-ready Python script that validates email addresses using regex.')
  })

  it('strips <think> tags from thinking models cleanly', async () => {
    vi.spyOn(llm, 'streamChat').mockImplementation(async ({ onToken, onDone }) => {
      onToken('<think>Let me ponder the best prompt...</think>')
      onToken('Generate a responsive React navbar component with Tailwind.')
      onDone()
    })

    const res = await enhancePromptText('react navbar', {
      provider: 'groq',
      model: 'deepseek-r1-distill-llama-70b',
      apiKey: 'test-key',
    })

    expect(res).toBe('Generate a responsive React navbar component with Tailwind.')
  })

  it('falls back to deterministic directives if stream is cut off mid-thought without completing', async () => {
    vi.spyOn(llm, 'streamChat').mockImplementation(async ({ onToken, onError }) => {
      onToken('Please write code for the following:')
      // Aborted before onDone
      onError('Connection dropped')
    })

    const res = await enhancePromptText('build a snake game', {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
      timeoutMs: 500,
    })

    // Because it ended mid-thought with ':' and did not complete, it must not return broken fragment
    expect(res).toContain('build a snake game')
    expect(res).toContain('Key Directives & Requirements:')
  })

  it('falls back to deterministic directives on timeout without returning cut-off fragment', async () => {
    vi.spyOn(llm, 'streamChat').mockImplementation(async ({ onToken }) => {
      onToken('Here is a draft and')
      // Stream stalls, does not call onDone
    })

    const res = await enhancePromptText('create a website', {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
      timeoutMs: 50, // fast timeout for test
    })

    expect(res).toContain('create a website')
    expect(res).toContain('Key Directives & Requirements:')
    expect(res).not.toBe('Here is a draft and')
  })

  it('falls back to deterministic directives on stream error', async () => {
    vi.spyOn(llm, 'streamChat').mockImplementation(async ({ onError }) => {
      onError('Rate limit exceeded')
    })

    const res = await enhancePromptText('create a rest api', {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      apiKey: 'test-key',
    })

    expect(res).toContain('create a rest api')
    expect(res).toContain('Key Directives & Requirements:')
  })
})
