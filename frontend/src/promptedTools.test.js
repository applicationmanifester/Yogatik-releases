import { describe, it, expect } from 'vitest'
import { parseToolCalls } from './promptedTools'
import { classifyQuery } from './api'

// Regression harness: the weak-model outputs prompted tool-calling must survive.
describe('prompted tool-call parsing (repair harness)', () => {
  const cases = [
    ['clean fenced', '```json\n{"tool_calls":[{"name":"web_search","arguments":{"query":"x"}}]}\n```', 'web_search'],
    ['trailing comma', '```json\n{"tool_calls":[{"name":"weather","arguments":{"location":"Paris",},}]}\n```', 'weather'],
    ['python literals', '```json\n{"tool_calls":[{"name":"code_execute","arguments":{"reset":True}}]}\n```', 'code_execute'],
    ['reasoning then block', '<think>I should search</think>\n```json\n{"tool_calls":[{"name":"deep_research","arguments":{"query":"y"}}]}\n```', 'deep_research'],
    ['bare no fence', 'sure: {"tool_calls":[{"name":"calculator","arguments":{"expression":"2+2"}}]}', 'calculator'],
    ['args as string', '```json\n{"tool_calls":[{"name":"translate","arguments":"{\\"text\\":\\"hi\\"}"}]}\n```', 'translate'],
    ['smart quotes', '```json\n{“tool_calls”:[{“name”:“ocr”,“arguments”:{}}]}\n```', 'ocr'],
  ]
  for (const [label, reply, expected] of cases) {
    it(`parses: ${label}`, () => {
      const { calls } = parseToolCalls(reply)
      expect(calls[0]?.name).toBe(expected)
    })
  }

  it('flags a malformed block for reprompt', () => {
    const { calls, malformed } = parseToolCalls('```json\n{"tool_calls":[{"name" "web_search"]}\n```')
    expect(calls).toHaveLength(0)
    expect(malformed).toBe(true)
  })

  it('plain prose is not malformed', () => {
    const { calls, malformed, text } = parseToolCalls('The capital of France is Paris.')
    expect(calls).toHaveLength(0)
    expect(malformed).toBe(false)
    expect(text).toMatch(/Paris/)
  })
})

// Query classification must stay stable — routing depends on it.
describe('query classification fixtures', () => {
  const cases = [
    ['fix the bug in my python function', 'code'],
    ['derive the quadratic formula step by step', 'reasoning'],
    ['write a blog post about cats', 'writing'],
    ['what time is it', 'quick'],
  ]
  for (const [q, expected] of cases) {
    it(`${q} → ${expected}`, () => expect(classifyQuery(q)).toBe(expected))
  }
})
