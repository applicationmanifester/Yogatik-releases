import { describe, it, expect } from 'vitest'
import { agentDisabledTools, exportAgent, parseAgent, PRESET_AGENTS } from './agents'
import { getToolNames } from './tools/index'
import { parsePlan, runAutonomousAgent } from './autonomousAgent'

describe('agents', () => {
  it('allowlist disables everything else', () => {
    const agent = { tools: ['web_search', 'calculator'] }
    expect(agentDisabledTools(agent, ['web_search', 'calculator', 'weather', 'ocr'])).toEqual(['weather', 'ocr'])
  })
  it('no allowlist disables nothing', () => {
    expect(agentDisabledTools({ tools: [] }, ['a', 'b'])).toEqual([])
  })
  it('every preset references only real, registered tools', () => {
    const real = new Set(getToolNames())
    for (const a of PRESET_AGENTS) {
      expect(a.id).toMatch(/^agent_/)
      for (const t of a.tools) expect(real.has(t), `${a.name} → ${t}`).toBe(true)
    }
  })
  it('a delegating agent only names sub-agents that exist', () => {
    const ids = new Set(PRESET_AGENTS.map(a => a.id))
    for (const a of PRESET_AGENTS) {
      for (const s of a.subAgents || []) expect(ids.has(s), `${a.name} → ${s}`).toBe(true)
    }
  })
  it('round-trips export/import', () => {
    const a = {
      name: 'Researcher', role: 'researcher', description: 'd', system: 'Be rigorous',
      tools: ['web_search'], model: null, provider: null, canDelegate: false, subAgents: [],
    }
    expect(parseAgent(exportAgent(a))).toEqual(a)
  })
  it('rejects malformed import', () => {
    expect(() => parseAgent('{"nope":true}')).toThrow()
  })
})

describe('autonomous agent', () => {
  it('parses numbered and bulleted plans', () => {
    expect(parsePlan('1. First\n2) Second\n- Third\n* Fourth')).toEqual(['First', 'Second', 'Third', 'Fourth'])
  })
  it('caps runaway plans at 12 steps', () => {
    const many = Array.from({ length: 30 }, (_, i) => `${i + 1}. step`).join('\n')
    expect(parsePlan(many).length).toBe(12)
  })
  it('plans, executes each step with prior context, then reviews', async () => {
    const seen = []
    const out = await runAutonomousAgent({
      goal: 'do a thing',
      plan: async () => '1. gather\n2. build',
      runStep: async (step, i, prior) => { seen.push({ step, i, prior }); return `result${i}` },
      review: async (goal, transcript) => `FINAL(${goal}):${transcript.includes('result1')}`,
    })
    expect(out.steps).toEqual(['gather', 'build'])
    expect(seen[1].prior).toContain('result0')       // step 2 sees step 1's output
    expect(out.report).toBe('FINAL(do a thing):true')
  })
  it('a failing step does not abort the run', async () => {
    const out = await runAutonomousAgent({
      goal: 'g',
      plan: async () => '1. a\n2. b',
      runStep: async (_s, i) => { if (i === 0) throw new Error('boom'); return 'ok' },
    })
    expect(out.results[0]).toContain('boom')
    expect(out.results[1]).toBe('ok')
  })
})
