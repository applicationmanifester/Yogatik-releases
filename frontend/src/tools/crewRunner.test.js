import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runSequentialCrew,
  runHierarchicalCrew,
  runReflexionCrew,
  runAutoCrew,
  crewOrchestratorTool,
} from './crewRunner'
import { _resetCrewTraces, subscribeCrewTraces } from '../crewTrace'

// Swapped per-test so the auto-crew tests can control what the "planner" call
// returns without changing the default reply every other workflow depends on.
let plannerReply = '[{"agent": "agent_researcher", "task": "Research X"}, {"agent": "agent_analyst", "task": "Analyze Y"}]'

vi.mock('../api', () => ({
  streamMessage: vi.fn((opts, onToken, _onSources, onDone, _onError) => {
    const message = opts?.message || ''
    const system_prompt = opts?.system_prompt || ''
    const isCritic = (system_prompt || '').toLowerCase().includes('qa') || message.includes('Critically evaluate')
    const isSynth = message.includes('synthesizing')
    const isPlanner = message.includes('Decompose this goal')
    let reply = `[Completed task]: ${message.slice(0, 40)}`
    if (isCritic) reply = `[Critic evaluation]: Code looks good, but add edge case handling for null inputs.`
    if (isSynth) reply = `[Executive Synthesis]: Unified deliverable combining all specialist findings.`
    if (isPlanner) reply = plannerReply
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
  beforeEach(() => {
    plannerReply = '[{"agent": "agent_researcher", "task": "Research X"}, {"agent": "agent_analyst", "task": "Analyze Y"}]'
    _resetCrewTraces()
  })

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

    it('requires a workflow name it recognises', async () => {
      const res = await crewOrchestratorTool.execute({ workflow: 'nonsense' })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/Unknown workflow/)
    })
  })

  describe('Auto Crew Workflow (plan → parallel specialists → synthesis)', () => {
    it('parses the planner\'s JSON plan and delegates into the hierarchical machinery', async () => {
      const res = await runAutoCrew('Launch plan for a coffee app')
      expect(res.success).toBe(true)
      expect(res.workflow).toBe('auto')
      expect(res.plan_source).toBe('planned')
      expect(res.plan).toEqual([
        { agent: 'agent_researcher', task: 'Research X' },
        { agent: 'agent_analyst', task: 'Analyze Y' },
      ])
      // It really did delegate — the hierarchical fields are present, not
      // reimplemented, so this pins there is exactly ONE execution engine.
      expect(res.specialist_count).toBe(2)
      expect(res.final_synthesis).toContain('Executive Synthesis')
    })

    it('unwraps a JSON plan the model fenced in ```json, and drops trailing commas', async () => {
      plannerReply = '```json\n[{"agent": "agent_coder", "task": "Build X",}]\n```'
      const res = await runAutoCrew('Ship a feature')
      expect(res.plan_source).toBe('planned')
      expect(res.plan).toEqual([{ agent: 'agent_coder', task: 'Build X' }])
    })

    it('falls back to the default hierarchical split — never fails the call — when the planner returns unusable output', async () => {
      plannerReply = 'Sure, here is my plan: first we should research, then analyze.'
      const res = await runAutoCrew('Launch plan for a coffee app')
      expect(res.success).toBe(true)
      expect(res.workflow).toBe('auto')
      expect(res.plan_source).toBe('fallback')
      expect(res.specialist_count).toBeGreaterThan(0)
    })

    it('substitutes a real agent for one the planner invented, rather than crashing the run', async () => {
      plannerReply = '[{"agent": "agent_totally_made_up", "task": "Do the thing"}]'
      const res = await runAutoCrew('Some goal')
      expect(res.success).toBe(true)
      expect(res.plan[0].agent).toBe('agent_analyst') // the safe substitute
    })

    it('requires a goal', async () => {
      const res = await runAutoCrew('')
      expect(res).toEqual({ success: false, error: 'goal is required' })
    })
  })

  describe('Crew trace recording (crewTrace.js)', () => {
    it('records a trace for every run through the ONE choke point, success and failure alike', async () => {
      const seen = []
      const unsub = subscribeCrewTraces((list) => { seen.push(list) })

      await crewOrchestratorTool.execute({
        workflow: 'sequential',
        steps: [{ agent: 'agent_writer', task: 'Write email blast' }],
      })
      await crewOrchestratorTool.execute({ workflow: 'nonsense' })

      unsub()
      const latest = seen[seen.length - 1]
      expect(latest.length).toBe(2)
      // Newest first.
      expect(latest[0].success).toBe(false)
      expect(latest[0].workflow).toBe('nonsense')
      expect(latest[1].success).toBe(true)
      expect(latest[1].workflow).toBe('sequential')
      expect(latest[1].steps.length).toBe(1)
      expect(latest[1].steps[0].agent).toBe('Writer')
      expect(typeof latest[1].durationMs).toBe('number')
    })
  })
})
