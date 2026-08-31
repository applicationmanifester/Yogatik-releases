/**
 * crewRunner.js — Open-source Multi-Agent Orchestration & Workflow Engine.
 * Inspired by CrewAI, AutoGen, LangGraph, and Reflexion (github.com/topics/agents).
 *
 * Core execution patterns:
 * 1. Sequential Pipeline (Step A → Step B → Step C with context handoff)
 * 2. Hierarchical Crew (Manager decomposes goal → Dispatches to parallel specialists → Synthesizes)
 * 3. Reflexion / Self-Correction Loop (Generator → Critic/Evaluator → Refinement)
 *
 * 100% independent, runs in browser and desktop with zero external server dependencies.
 */

import { PRESET_AGENTS, getAgentById } from '../agents'
import { getToolNames } from './index'
import { streamMessage } from '../api'
import { runAgentPool } from '../agentPool'
import { getSessionBlackboard } from '../agentBlackboard'

function findPresetAgent(idOrRole) {
  if (!idOrRole) return null
  const q = String(idOrRole).toLowerCase().trim()
  return PRESET_AGENTS.find(a => a.id.toLowerCase() === q) ||
    PRESET_AGENTS.find(a => (a.role || '').toLowerCase() === q) ||
    PRESET_AGENTS.find(a => a.name.toLowerCase() === q) ||
    PRESET_AGENTS.find(a => a.name.toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q)) ||
    null
}

async function streamAgent(agentId, prompt, priorContext = '', sessionId = 'default') {
  let def = findPresetAgent(agentId)
  if (!def) {
    try { def = await getAgentById(agentId) } catch { def = null }
  }
  const allNames = getToolNames()
  const blackboard = getSessionBlackboard(sessionId)

  const disabled = new Set(['spawn_agents', 'crew_orchestrator'])
  if (def?.tools?.length) {
    const allow = new Set(def.tools)
    for (const n of allNames) if (!allow.has(n)) disabled.add(n)
  }

  const bbContext = blackboard.formatContextPrompt()
  let combinedContext = priorContext
  if (bbContext && !combinedContext.includes(bbContext)) {
    combinedContext = combinedContext ? `${combinedContext}\n\n${bbContext}` : bbContext
  }

  let text = ''
  const fullPrompt = combinedContext
    ? `### Prior Context / Input Data:\n${combinedContext}\n\n### Your Specific Task:\n${prompt}`
    : prompt

  const startTime = Date.now()
  await new Promise((resolve) => {
    streamMessage(
      {
        message: fullPrompt,
        messages: [],
        provider: def?.provider || undefined,
        model: def?.model || undefined,
        system_prompt: def?.system || `You are an expert specialist agent. Complete your task thoroughly and concisely.`,
        use_tools: true,
        use_web_search: true,
        disabledTools: [...disabled],
        agent_override: def || undefined,
        channel: `crew-${Math.random().toString(36).slice(2, 8)}`,
      },
      (t) => { text += t },
      null,
      () => resolve(),
      (err) => {
        if (!text.trim()) text = `[Agent execution notice: ${err?.message || err}]`
        resolve()
      },
    )
  })

  const durationMs = Date.now() - startTime
  const trimmed = text.trim() || '(Completed with no output)'

  if (trimmed.length > 0 && !trimmed.startsWith('[Agent execution notice')) {
    blackboard.appendNote(trimmed.slice(0, 240).replace(/\n+/g, ' '), def?.name || agentId)
  }

  return {
    agentId: def?.id || agentId,
    agentName: def?.name || agentId,
    role: def?.role || agentId,
    output: trimmed,
    durationMs,
  }
}

/**
 * Sequential Pipeline: executes agents in order, passing cumulative context forward.
 */
export async function runSequentialCrew(steps = [], scope = null) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { success: false, error: 'Provide at least one step in steps array.' }
  }

  const results = []
  let cumulativeContext = ''

  for (let i = 0; i < steps.length; i++) {
    const { agent, task } = steps[i]
    const stepOutput = await streamAgent(agent, task, cumulativeContext)
    results.push({
      step: i + 1,
      agent: stepOutput.agentName,
      role: stepOutput.role,
      task,
      output: stepOutput.output,
    })
    cumulativeContext += `\n\n[Output from Step ${i + 1} (${stepOutput.agentName})]:\n${stepOutput.output}`
  }

  return {
    success: true,
    workflow: 'sequential',
    total_steps: steps.length,
    results,
    final_output: results[results.length - 1]?.output,
  }
}

/**
 * Hierarchical Crew: dispatches subtasks in parallel, then uses a synthesizer agent.
 */
export async function runHierarchicalCrew(goal, specialists = [], synthesizer = 'agent_writer', scope = null) {
  if (!goal) return { success: false, error: 'goal is required' }
  const tasks = specialists.length ? specialists : [
    { agent: 'agent_researcher', task: `Research foundational facts and background for: ${goal}` },
    { agent: 'agent_analyst', task: `Analyze data points, key metrics, and implications for: ${goal}` },
  ]

  // Run specialists concurrently under the shared global agent budget.
  const specialistOutputs = await runAgentPool(tasks, ({ agent, task }) => streamAgent(agent, task), scope)

  // Synthesize with manager/writer
  const mergedContext = specialistOutputs.map((s, idx) =>
    `### Specialist ${idx + 1}: ${s.agentName} (${s.role})\n${s.output}`
  ).join('\n\n')

  const synthesisPrompt = `You are the lead synthesizing agent. Consolidate and unify these specialist reports into a single, cohesive, high-impact final deliverable for the goal: "${goal}".`
  const finalSummary = await streamAgent(synthesizer, synthesisPrompt, mergedContext)

  return {
    success: true,
    workflow: 'hierarchical',
    goal,
    specialist_count: specialistOutputs.length,
    specialist_reports: specialistOutputs,
    final_synthesis: finalSummary.output,
  }
}

/**
 * Reflexion / Self-Correction: Generator creates output, Critic reviews and scores it, Generator refines.
 */
export async function runReflexionCrew(task, generatorAgent = 'agent_coder', criticAgent = 'agent_qa_engineer', maxIterations = 2, scope = null) {
  if (!task) return { success: false, error: 'task is required' }

  let currentDraft = (await streamAgent(generatorAgent, task)).output
  const history = [{ iteration: 1, type: 'initial_draft', content: currentDraft }]

  for (let iter = 1; iter < maxIterations; iter++) {
    const critiquePrompt = `Critically evaluate this work against best practices, edge cases, correctness, and completeness. List specific flaws or confirm it is optimal.\n\nTask:\n${task}`
    const critique = (await streamAgent(criticAgent, critiquePrompt, currentDraft)).output

    history.push({ iteration: iter, type: 'critique', content: critique })

    const refinementPrompt = `Refine and improve your previous work based on this critique.\n\nOriginal Task:\n${task}\n\nCritique Feedback:\n${critique}`
    currentDraft = (await streamAgent(generatorAgent, refinementPrompt, currentDraft)).output

    history.push({ iteration: iter + 1, type: 'refined_output', content: currentDraft })
  }

  return {
    success: true,
    workflow: 'reflexion',
    iterations: maxIterations,
    history,
    final_output: currentDraft,
  }
}

/**
 * Map-Reduce: run MANY instances of one agent in parallel — one per item —
 * then a reducer agent merges the mapped outputs. This is the pattern that most
 * cuts wall-clock time on embarrassingly-parallel work (e.g. "summarise each of
 * these 8 documents", "classify each row"). Concurrency is bounded by the shared
 * global agent budget.
 */
export async function runMapReduceCrew(goal, items = [], mapper = 'agent_analyst', reducer = 'agent_writer', scope = null) {
  if (!goal) return { success: false, error: 'goal is required' }
  if (!Array.isArray(items) || items.length === 0) return { success: false, error: 'items[] is required for map_reduce' }

  const mapped = await runAgentPool(items, (item, i) =>
    streamAgent(mapper, `Task (item ${i + 1} of ${items.length}) for the overall goal "${goal}":\n${typeof item === 'string' ? item : JSON.stringify(item)}`),
    scope
  )

  const mergedContext = mapped.map((m, idx) =>
    `### Item ${idx + 1} — ${m.agentName || mapper}\n${m.output || m.error || '(no output)'}`
  ).join('\n\n')

  const reducePrompt = `Combine the per-item results below into one coherent deliverable for the goal: "${goal}". De-duplicate, resolve conflicts, and present a unified answer.`
  const reduced = await streamAgent(reducer, reducePrompt, mergedContext)

  return {
    success: true,
    workflow: 'map_reduce',
    goal,
    item_count: items.length,
    mapped_results: mapped,
    final_output: reduced.output,
  }
}

/**
 * Pull a JSON array out of a planner reply. Models wrap JSON in prose and
 * fenced code blocks more often than they return it bare, so this looks for a
 * ```json fence first, then falls back to the outermost [ ... ] span, and
 * strips trailing commas before parsing — the single most common way a model
 * breaks otherwise-valid JSON. Never throws; the caller decides what an empty
 * result means.
 */
function parsePlanJson(text) {
  const raw = String(text || '')
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const candidate = fenced ? fenced[1] : raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)
  if (!candidate || !candidate.trim()) return null
  const cleaned = candidate.trim().replace(/,\s*([\]}])/g, '$1')
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Auto Crew: ONE planning call decomposes the goal into a specialist task
 * list, grounded in the REAL roster (id/role/description of every available
 * agent) so the plan names agents that exist rather than inventing roles —
 * then delegates into runHierarchicalCrew, the same parallel-execute +
 * synthesize machinery every other workflow already shares. This is the
 * "auto-plan" gap the hand-authored workflows leave: today the CALLER
 * decomposes the goal (steps[]/specialists[]); this is for when the caller
 * wants ONE goal in and has no opinion on how to split the work.
 */
export async function runAutoCrew(goal, scope = null, synthesizer = 'agent_writer') {
  if (!goal) return { success: false, error: 'goal is required' }

  const roster = PRESET_AGENTS
    .filter(a => a.id !== 'agent_orchestrator')
    .map(a => `- ${a.id} (${a.role}): ${a.description || a.name}`)
    .join('\n')

  const plannerPrompt =
    `Decompose this goal into 2-5 independent specialist subtasks that can run IN PARALLEL ` +
    `(no subtask should depend on another's output — that is what the synthesis step is for). ` +
    `Pick each "agent" from this exact roster by its id:\n${roster}\n\n` +
    `Goal: "${goal}"\n\n` +
    `Reply with ONLY a JSON array, no prose, no markdown fence: ` +
    `[{"agent": "agent_id", "task": "self-contained instruction for that specialist"}, ...]`

  const planned = await streamAgent('agent_planner', plannerPrompt)
  const steps = parsePlanJson(planned.output)
    ?.filter(s => s && typeof s.task === 'string' && s.task.trim())
    ?.map(s => ({ agent: findPresetAgent(s.agent) ? s.agent : 'agent_analyst', task: s.task }))
    ?.slice(0, 5)

  if (!steps?.length) {
    // A planner that returns nothing usable must not fail the whole call —
    // fall back to the same default split runHierarchicalCrew already uses
    // when the caller supplies no specialists at all.
    const fallback = await runHierarchicalCrew(goal, [], synthesizer, scope)
    return { ...fallback, workflow: 'auto', plan_source: 'fallback', planner_raw: planned.output.slice(0, 500) }
  }

  const result = await runHierarchicalCrew(goal, steps, synthesizer, scope)
  return { ...result, workflow: 'auto', plan_source: 'planned', plan: steps }
}

/**
 * Best-of-N: run N instances of one generator agent on the SAME task in parallel
 * (diverse attempts), then a critic agent evaluates all candidates and returns
 * the strongest — or a merge of their best parts. Trades tokens for quality.
 */
export async function runBestOfNCrew(task, generator = 'agent_writer', n = 3, critic = 'agent_auditor', scope = null) {
  if (!task) return { success: false, error: 'task is required' }
  const count = Math.max(2, Math.min(5, Number(n) || 3))

  const candidates = await runAgentPool(
    Array.from({ length: count }, (_, i) => i),
    (i) => streamAgent(generator, `${task}\n\n(Attempt ${i + 1} of ${count} — aim for a distinct, high-quality take.)`),
    scope
  )

  const candidateBlock = candidates.map((c, idx) =>
    `### Candidate ${idx + 1}\n${c.output || c.error || '(no output)'}`
  ).join('\n\n')

  const critiquePrompt = `You are judging ${count} candidate answers to the same task. Pick the single best one, or synthesize the strongest parts into one superior final answer. Return only that final answer, then a one-line note on why it wins.\n\nTask:\n${task}`
  const verdict = await streamAgent(critic, critiquePrompt, candidateBlock)

  return {
    success: true,
    workflow: 'best_of_n',
    n: count,
    candidates,
    final_output: verdict.output,
  }
}

/**
 * Crew Orchestrator Tool definition for Yogatik AI toolchain.
 */
export const crewOrchestratorTool = {
  schema: {
    description:
      'Execute multi-agent autonomous crew workflows inspired by CrewAI, AutoGen, and LangGraph. ' +
      'Supports 6 workflow patterns: ' +
      '1. "auto" (give ONLY a goal — a planning pass decomposes it into specialist subtasks itself, ' +
      'runs them in parallel, and synthesizes; use this when you have not already decided how to split the work) ' +
      '2. "sequential" (Pipeline of agents passing context forward) ' +
      '3. "hierarchical" (Parallel specialist agents you name yourself + Lead synthesizer) ' +
      '4. "reflexion" (Generator agent + Critic/QA evaluator refinement loop) ' +
      '5. "map_reduce" (run one agent on MANY items in parallel, then a reducer merges — fastest for per-item work) ' +
      '6. "best_of_n" (run N instances of one agent on the SAME task in parallel, then a critic picks/merges the best — higher quality). ' +
      'Use for complex multi-agent engineering, research pipelines, per-item batch work, and quality-critical answers.',
    parameters: {
      type: 'object',
      properties: {
        workflow: {
          type: 'string',
          enum: ['auto', 'sequential', 'hierarchical', 'reflexion', 'map_reduce', 'best_of_n'],
          description: 'Orchestration workflow pattern',
        },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'The list of items to process in parallel, one agent instance per item (workflow "map_reduce").',
        },
        n: { type: 'number', description: 'How many parallel instances to race (workflow "best_of_n", 2–5, default 3).' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Agent ID or role (e.g. agent_researcher, agent_coder, agent_architect, agent_qa_engineer, agent_writer)' },
              task: { type: 'string', description: 'Task instruction for this step' },
            },
            required: ['agent', 'task'],
          },
          description: 'Steps for sequential pipeline',
        },
        goal: { type: 'string', description: 'Overall goal for hierarchical or reflexion workflow' },
        generator: { type: 'string', description: 'Generator agent for reflexion (default: agent_coder or agent_writer)' },
        critic: { type: 'string', description: 'Critic/Evaluator agent for reflexion (default: agent_qa_engineer or agent_auditor)' },
      },
      required: ['workflow'],
    },
  },
  async execute({ workflow, steps = [], goal = '', items = [], n = 3, generator = 'agent_coder', critic = 'agent_qa_engineer' }, opts = {}) {
    const startedAt = Date.now()
    const traceLabel = goal || steps?.[0]?.task || null
    try {
      // The chat that ordered this crew. It scopes the pool's fair queue, so a
      // 40-item map_reduce here cannot starve another conversation's agents.
      const { getWorkspaceCtx } = await import('./localFs')
      const scope = getWorkspaceCtx(opts?.ctx)?.conversationId ?? null

      let result
      if (workflow === 'auto') {
        result = await runAutoCrew(goal, scope)
      } else if (workflow === 'sequential') {
        result = await runSequentialCrew(steps, scope)
      } else if (workflow === 'hierarchical') {
        result = await runHierarchicalCrew(goal, steps, 'agent_writer', scope)
      } else if (workflow === 'reflexion') {
        result = await runReflexionCrew(goal, generator, critic, 2, scope)
      } else if (workflow === 'map_reduce') {
        result = await runMapReduceCrew(goal, items, generator || 'agent_analyst', critic || 'agent_writer', scope)
      } else if (workflow === 'best_of_n') {
        result = await runBestOfNCrew(goal, generator || 'agent_writer', n, critic || 'agent_auditor', scope)
      } else {
        result = { success: false, error: `Unknown workflow: ${workflow}` }
      }

      // Single choke point for trace recording — every workflow returns
      // through here, so a new workflow can never ship without a trace the
      // way a new IPC channel can never ship ungated past installGate.
      const { recordCrewRun } = await import('../crewTrace')
      recordCrewRun({ workflow, goal: traceLabel, durationMs: Date.now() - startedAt, result })
      return result
    } catch (e) {
      const { recordCrewRun } = await import('../crewTrace')
      recordCrewRun({ workflow, goal: traceLabel, durationMs: Date.now() - startedAt, error: e.message })
      return { success: false, error: e.message }
    }
  },
}
