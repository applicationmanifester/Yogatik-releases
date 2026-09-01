import { describe, it, expect } from 'vitest'
import { cleanTextForSpeech } from './api'

describe('cleanTextForSpeech (Read Aloud sanitizer)', () => {
  it('strips <think> thinking and reasoning scratchwork', () => {
    const raw = '<think>I need to check the weather in London. Thinking step 1...</think>The weather in London is currently 18°C and sunny.'
    expect(cleanTextForSpeech(raw)).toBe('The weather in London is currently 18°C and sunny.')
  })

  it('strips unclosed streaming <think> blocks', () => {
    const raw = '<think>Still calculating...'
    expect(cleanTextForSpeech(raw)).toBe('')
  })

  it('strips markdown code blocks so raw code is not read aloud', () => {
    const raw = 'Here is the code you requested:\n```javascript\nconst a = 10;\nconsole.log(a);\n```\nLet me know if you have questions.'
    expect(cleanTextForSpeech(raw)).toBe('Here is the code you requested: Let me know if you have questions.')
  })

  it('strips markdown links and formatting symbols', () => {
    const raw = 'Check out [OpenAI](https://openai.com) for **important** updates and _details_.'
    expect(cleanTextForSpeech(raw)).toBe('Check out OpenAI for important updates and details.')
  })

  it('strips tool call syntax blocks', () => {
    const raw = '[TOOL_CALL: web_search({"query": "london weather"})]Here is the forecast for London.'
    expect(cleanTextForSpeech(raw)).toBe('Here is the forecast for London.')
  })
})
