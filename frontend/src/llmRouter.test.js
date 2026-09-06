import { describe, it, expect } from 'vitest'
import { classifyQueryIntent, getSuggestedRoute } from './llm'

describe('Smart Intent Router', () => {
  describe('classifyQueryIntent', () => {
    it('classifies attachments as vision', () => {
      expect(classifyQueryIntent('explain this', [{ file: 'foo.png' }])).toBe('vision')
    })

    it('classifies code questions as code', () => {
      expect(classifyQueryIntent('Write a React component with useState and useEffect')).toBe('code')
      expect(classifyQueryIntent('```js\nconst x = 10;\n```')).toBe('code')
      expect(classifyQueryIntent('git commit -m "update build"')).toBe('code')
    })

    it('classifies deep math or logic questions as reasoning', () => {
      expect(classifyQueryIntent('Prove that the square root of 2 is irrational step-by-step')).toBe('reasoning')
      expect(classifyQueryIntent('What are the architectural trade-offs of Raft consensus?')).toBe('reasoning')
    })

    it('classifies short greetings and quick lookups as speed', () => {
      expect(classifyQueryIntent('Hello! How are you doing?')).toBe('speed')
      expect(classifyQueryIntent('Translate this to French')).toBe('speed')
    })

    it('defaults general knowledge to general', () => {
      expect(classifyQueryIntent('What are the historical origins of the Silk Road across Eurasia?')).toBe('general')
    })
  })

  describe('getSuggestedRoute', () => {
    it('recommends fast models for speed intent when groq is ready', () => {
      const keys = { groq: 'gsk_test' }
      const route = getSuggestedRoute('speed', keys, 'openai', 'gpt-4o')
      expect(route.shouldSwitch).toBe(true)
      expect(route.recommended.provider).toBe('groq')
    })

    it('recommends premier coding models for code intent', () => {
      const keys = { anthropic: 'sk-ant-test', groq: 'gsk_test' }
      const route = getSuggestedRoute('code', keys, 'anthropic', 'claude-3-7-sonnet-20250219')
      expect(route.isAlreadyUsing).toBe(true)
      expect(route.shouldSwitch).toBe(false)
    })
  })
})
