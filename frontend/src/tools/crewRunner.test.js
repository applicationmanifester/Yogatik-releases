import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runSequentialCrew,
  runHierarchicalCrew,
  runReflexionCrew,
  crewOrchestratorTool,
} from './crewRunner'

vi.mock('../api', () => ({
  streamMessage: vi.fn((opts, onToken, _onSources, onDone, _onError) => {
    const message = opts?.message || ''
    const system_prompt = opts?.system_prompt || ''
    const isCritic = (system_prompt || '').toLowerCase().includes('qa') || message.includes('Critically evaluate')
    const isSynth = message.includes('synthesizing')
    let reply = `[Completed task]: ${message.slice(0, 40)}`
    if (isCritic) reply = `[Critic evaluation]: Code looks good, but add edge case handling for null inputs.`
    if (isSynth) reply = `[Executive Synthesis]: Unified deliverable combining all specialist findings.`
    if (onToken) onToken(reply)
    if (onDone) onDone()
  }),
}))

vi.mock('../agents', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAgentById: vi.fn(async (id) => actual.PRESET_AGENTS.find(p => p.id === id || p.role === id) || null),
  }
})

describe('crewRunner (Open-Source Multi-Agent Orchestration)', () => {
  describe('Sequential Crew Pipeline', () => {
    it('executes pipeline steps and accumulates context', async () => {
      const steps = [
        { agent: 'agent_product_manager', task: 'Draft user stories for login feature' },
        { agent: 'agent_architect', task: 'Design authentication flow diagram' },
        { agent: 'agent_coder', task: 'Write auth handler functions' },
      ]

      const res = await runSequentialCrew(steps)
      expect(res.success).toBe(true)
      expect(res.workflow).toBe('sequential')
      expect(res.total_steps).toBe(3)
      expect(res.results.length).toBe(3)
      expect(res.results[0].agent).toBe('Product Manager')
      expect(res.results[1].agent).toBe('Software Architect')
      expect(res.results[2].agent).toBe('Coder')
    })
  })

  describe('Hierarchical Crew Workflow', () => {
    it('runs specialist subtasks in parallel and synthesizes final deliverable', async () => {
      const specialists = [
        { agent: 'agent_researcher', task: 'Research battery chemistry breakthroughs' },
        { agent: 'agent_analyst', task: 'Analyze market adoption curves' },
      ]

      const res = await runHierarchicalCrew('Next-Gen Energy Strategy', specialists)
      expect(res.success).toBe(true)
      expect(res.workflow).toBe('hierarchical')
      expect(res.specialist_count).toBe(2)
      expect(res.final_synthesis).toContain('Executive Synthesis')
    })
  })

  describe('Reflexion / Self-Correction Workflow', () => {
    it('runs generator -> critic -> refined generator loop', async () => {
      const res = await runReflexionCrew(
        'Implement binary search tree in TypeScript',
        'agent_coder',
        'agent_qa_engineer',
        2
      )
      expect(res.success).toBe(true)
      expect(res.workflow).toBe('reflexion')
      expect(res.history.length).toBe(3) // initial draft, critique, refined output
      expect(res.history[1].type).toBe('critique')
      expect(res.history[2].type).toBe('refined_output')
    })
  })

  describe('crewOrchestratorTool execute', () => {
    it('dispatches to sequential workflow', async () => {
      const res = await crewOrchestratorTool.execute({
        workflow: 'sequential',
        steps: [{ agent: 'agent_writer', task: 'Write email blast' }],
      })
      expect(res.success).toBe(true)
      expect(res.workflow).toBe('sequential')
    })
  })
})
