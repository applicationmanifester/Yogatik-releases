import { describe, it, expect } from 'vitest'
import { AgentBlackboard, getSessionBlackboard } from './agentBlackboard'

describe('AgentBlackboard', () => {
  it('stores and retrieves facts with source attribution', () => {
    const bb = new AgentBlackboard('test-1')
    bb.setFact('react_version', '19.0.0', 'researcher')
    expect(bb.getFact('react_version')).toBe('19.0.0')

    const prompt = bb.formatContextPrompt()
    expect(prompt).toContain('react_version')
    expect(prompt).toContain('19.0.0')
    expect(prompt).toContain('researcher')
  })

  it('records notes and code snippets and formats markdown summary', () => {
    const bb = new AgentBlackboard('test-2')
    bb.appendNote('Verified API endpoint /v1/chat', 'auditor')
    bb.setCodeSnippet('helper', 'export const add = (a, b) => a + b', 'javascript', 'coder')

    const prompt = bb.formatContextPrompt()
    expect(prompt).toContain('Verified API endpoint')
    expect(prompt).toContain('export const add')
  })

  it('provides singleton session blackboards', () => {
    const bb1 = getSessionBlackboard('session-a')
    const bb2 = getSessionBlackboard('session-a')
    expect(bb1).toBe(bb2)
  })
})
