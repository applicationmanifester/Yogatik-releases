import { describe, it, expect } from 'vitest'
import {
  assessResponse,
  visibleContent,
  repetitionRatio,
  hasUnclosedCodeBlock,
  endsMidThought,
  hitsTokenBoundary,
  isRefusal,
  isErrorContent,
  startsIncoherent,
  isRetryableError,
  retryDelay,
  continuationPrompt,
  regenerationPrompt,
} from './responseWatchdog'

// ── Helpers ──────────────────────────────────────────────────────────

describe('visibleContent', () => {
  it('strips <think> blocks and trims', () => {
    expect(visibleContent('<think>reasoning here</think>Hello world')).toBe('Hello world')
  })
  it('returns empty for think-only content', () => {
    expect(visibleContent('<think>long reasoning\nmore lines</think>')).toBe('')
  })
  it('handles null/undefined gracefully', () => {
    expect(visibleContent(null)).toBe('')
    expect(visibleContent(undefined)).toBe('')
    expect(visibleContent('')).toBe('')
  })
})

describe('repetitionRatio', () => {
  it('returns 0 for short text', () => {
    expect(repetitionRatio('hello')).toBe(0)
  })
  it('returns low ratio for varied text', () => {
    const varied = 'The quick brown fox jumps over the lazy dog and then runs across the wide open green field toward the distant hills'
    expect(repetitionRatio(varied)).toBeLessThan(0.2)
  })
  it('returns high ratio for degenerate repetition', () => {
    const repeated = Array(20).fill('the cat sat on the mat').join(' ')
    expect(repetitionRatio(repeated)).toBeGreaterThan(0.5)
  })
})

describe('hasUnclosedCodeBlock', () => {
  it('detects odd code fences', () => {
    expect(hasUnclosedCodeBlock('```js\nconst x = 1')).toBe(true)
  })
  it('passes even code fences', () => {
    expect(hasUnclosedCodeBlock('```js\nconst x = 1\n```')).toBe(false)
  })
  it('handles no fences', () => {
    expect(hasUnclosedCodeBlock('plain text')).toBe(false)
  })
})

describe('endsMidThought', () => {
  it('detects trailing colon', () => {
    expect(endsMidThought('Here are the steps to follow:')).toBe(true)
  })
  it('detects transitional phrase', () => {
    expect(endsMidThought("Now let's check the configuration"  )).toBe(true)
  })
  it('detects trailing conjunction', () => {
    expect(endsMidThought('This works well because')).toBe(true)
  })
  it('passes complete sentences', () => {
    expect(endsMidThought('The task is complete.')).toBe(false)
  })
  it('passes short text', () => {
    expect(endsMidThought('OK')).toBe(false)
  })
})

describe('isRefusal', () => {
  it('catches "I\'m sorry, I cannot"', () => {
    expect(isRefusal("I'm sorry, I cannot assist with that request.")).toBe(true)
  })
  it('catches "As an AI language model"', () => {
    expect(isRefusal('As an AI language model, I cannot provide medical advice.')).toBe(true)
  })
  it('does NOT flag long substantive responses with a disclaimer prefix', () => {
    const long = "I'm sorry, but " + 'x'.repeat(600)
    expect(isRefusal(long)).toBe(false)
  })
  it('passes normal answers', () => {
    expect(isRefusal('Here is the code you requested:\n```js\nconsole.log("hi")\n```')).toBe(false)
  })
})

describe('isErrorContent', () => {
  it('catches JSON error objects', () => {
    expect(isErrorContent('{"error": "rate limit exceeded"}')).toBe(true)
  })
  it('catches "Error:" prefix', () => {
    expect(isErrorContent('Error: Connection refused')).toBe(true)
  })
  it('catches HTTP status codes', () => {
    expect(isErrorContent('503 Service Unavailable')).toBe(true)
  })
  it('passes normal content', () => {
    expect(isErrorContent('The error handling in this code is well designed.')).toBe(false)
  })
})

describe('startsIncoherent', () => {
  it('catches broken UTF-8', () => {
    expect(startsIncoherent('\uFFFDsome text')).toBe(true)
  })
  it('passes normal text', () => {
    expect(startsIncoherent('Hello, here is your answer.')).toBe(false)
  })
  it('does not flag common short words', () => {
    expect(startsIncoherent('a quick solution is...')).toBe(false)
  })
})

// ── Main assessResponse ──────────────────────────────────────────────

describe('assessResponse', () => {
  it('accepts a good, complete response', () => {
    const v = assessResponse('Here is a well-structured answer to your question. It covers multiple aspects in detail.', { userMessage: 'Explain X' })
    expect(v.quality).toBe('good')
    expect(v.action).toBe('accept')
  })

  it('flags empty response for regeneration', () => {
    const v = assessResponse('', { userMessage: 'Tell me about X' })
    expect(v.quality).toBe('failed')
    expect(v.action).toBe('regenerate')
    expect(v.check).toBe('empty')
  })

  it('flags think-only response for regeneration', () => {
    const v = assessResponse('<think>I should answer the question...</think>', { userMessage: 'What is 2+2?' })
    expect(v.quality).toBe('failed')
    expect(v.action).toBe('regenerate')
    expect(v.check).toBe('empty')
  })

  it('accepts partial after max regenerations on empty', () => {
    const v = assessResponse('', { userMessage: 'X', regenerations: 2 })
    expect(v.action).toBe('accept_partial')
  })

  it('flags error-as-content for regeneration', () => {
    const v = assessResponse('Error: Connection timeout', { userMessage: 'How do I...' })
    expect(v.action).toBe('regenerate')
    expect(v.check).toBe('error_content')
  })

  it('flags degenerate repetition for regeneration', () => {
    const repeated = Array(25).fill('the cat sat on the mat and looked around').join(' ')
    const v = assessResponse(repeated, { userMessage: 'Write something' })
    expect(v.action).toBe('regenerate')
    expect(v.check).toBe('repetition')
  })

  it('flags refusal for escalation', () => {
    const v = assessResponse("I'm sorry, I cannot help with that.", { userMessage: 'Help me' })
    expect(v.action).toBe('escalate')
    expect(v.check).toBe('refusal')
  })

  it('flags unclosed code block for continuation', () => {
    const v = assessResponse('Here is the code:\n```js\nconst x = 1\nconst y = 2', { userMessage: 'Write code' })
    expect(v.action).toBe('continue')
    expect(v.check).toBe('unclosed_code')
  })

  it('flags mid-thought ending for continuation', () => {
    const v = assessResponse('The solution involves the following steps:', { userMessage: 'How to fix X' })
    expect(v.action).toBe('continue')
    expect(v.check).toBe('mid_thought')
  })

  it('accepts short response in voice mode', () => {
    const v = assessResponse('Yes.', { userMessage: 'Is it ready?', mode: 'voice' })
    expect(v.action).toBe('accept')
  })

  it('flags suspiciously short response in chat mode', () => {
    const v = assessResponse('OK', { userMessage: 'Explain the theory of relativity in detail' })
    expect(v.action).toBe('regenerate')
    expect(v.check).toBe('too_short')
  })

  it('does NOT flag short response for a short prompt', () => {
    const v = assessResponse('Done.', { userMessage: 'Hi' })
    // userMessage.length <= 20, so minLength check is skipped
    expect(v.action).toBe('accept')
  })

  it('accepts code-heavy responses that are NOT repetitive', () => {
    const code = '```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    a, b = 0, 1\n    for i in range(2, n + 1):\n        a, b = b, a + b\n    return b\n\nprint(fibonacci(10))\n```\nThis prints 55.'
    const v = assessResponse(code, { userMessage: 'Write fibonacci' })
    expect(v.action).toBe('accept')
  })

  it('handles the forced-final flag for mid-thought', () => {
    const v = assessResponse('The answer involves:', { userMessage: 'Explain', forcedFinal: true })
    expect(v.action).toBe('accept_partial')
  })
})

// ── Retry helpers ────────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('recognizes 429 rate limit', () => {
    expect(isRetryableError('429 Too Many Requests')).toBe(true)
  })
  it('recognizes timeout', () => {
    expect(isRetryableError('Request timed out after 30s')).toBe(true)
  })
  it('recognizes 502 bad gateway', () => {
    expect(isRetryableError('502 Bad Gateway')).toBe(true)
  })
  it('does NOT flag auth errors', () => {
    expect(isRetryableError('401 Unauthorized')).toBe(false)
  })
  it('does NOT flag model-not-found', () => {
    expect(isRetryableError('Model gpt-5 does not exist')).toBe(false)
  })
  it('handles null', () => {
    expect(isRetryableError(null)).toBe(false)
  })
})

describe('retryDelay', () => {
  it('returns 500ms for first attempt', () => {
    expect(retryDelay(0)).toBe(500)
  })
  it('doubles each attempt', () => {
    expect(retryDelay(1)).toBe(1000)
    expect(retryDelay(2)).toBe(2000)
  })
  it('caps at 8000ms', () => {
    expect(retryDelay(10)).toBe(8000)
  })
})

describe('continuationPrompt', () => {
  it('mentions code block when one is unclosed', () => {
    const p = continuationPrompt('```js\nconst x')
    expect(p).toMatch(/code/i)
  })
  it('gives a generic continuation otherwise', () => {
    const p = continuationPrompt('The steps are:')
    expect(p).toMatch(/continue/i)
  })
})

describe('regenerationPrompt', () => {
  it('includes the reason', () => {
    const p = regenerationPrompt('empty response')
    expect(p).toMatch(/empty response/)
  })
})
