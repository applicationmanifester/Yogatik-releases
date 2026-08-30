import { describe, it, expect } from 'vitest'
import { askUserTool, setUserQuestionHandler } from './askUser'

describe('askUserTool', () => {
  it('validates question presence', async () => {
    const res = await askUserTool.execute({})
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/no question provided/i)
  })

  it('returns default fallback answer when no interactive handler is attached', async () => {
    setUserQuestionHandler(null)
    const res = await askUserTool.execute({ question: 'Do you prefer dark or light mode?' })
    expect(res.success).toBe(true)
    expect(res.tool).toBe('ask_user')
    expect(res.user_response).toContain('default')
  })

  it('awaits and returns user answer when interactive handler is configured', async () => {
    setUserQuestionHandler(async ({ question, options }) => {
      expect(question).toBe('Which framework?')
      expect(options).toEqual(['React', 'Vue', 'Svelte'])
      return 'React'
    })

    const res = await askUserTool.execute({
      question: 'Which framework?',
      options: ['React', 'Vue', 'Svelte'],
    })

    expect(res.success).toBe(true)
    expect(res.user_response).toBe('React')

    setUserQuestionHandler(null)
  })

  it('handles user cancellation or rejection gracefully', async () => {
    setUserQuestionHandler(async () => {
      throw new Error('User closed dialog')
    })

    const res = await askUserTool.execute({ question: 'Confirm deploy?' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('User closed dialog')

    setUserQuestionHandler(null)
  })
})
