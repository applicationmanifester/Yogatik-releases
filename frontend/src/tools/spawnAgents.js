/**
 * spawn_agents — sub-agent delegation. The main assistant hands focused
 * sub-tasks to specialist agents (Researcher, Coder, Writer, …) that each run
 * the full agent loop in parallel, then their results are merged and returned.
 *
 * Guards: sub-agents cannot spawn further agents (no infinite recursion), and
 * each is tool-scoped to its agent definition. Concurrency runs through the
 * shared global agent pool — by default as many sub-agents at once as there are
 * tasks (chat_prefs.max_parallel_agents overrides), a rolling window so a slow
 * sub-agent no longer stalls the rest, and this fan-out shares one budget with
 * crew_orchestrator so the two together can't storm the provider's rate limit.
 * Dynamic imports break the tools ↔ api ↔ agent cycle.
 */

export const spawnAgentsTool = {
  schema: {
    description:
      'Delegate focused sub-tasks to specialist sub-agents that run concurrently, then get their merged results. ' +
      'Use for complex, multi-part tasks (e.g. research + code + writing). Each sub-agent is one of: ' +
      'researcher, coder, writer, analyst, planner, or any specialist agent id/role. Do NOT use for simple single-step tasks.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'The sub-tasks to delegate, run concurrently under a shared budget. Provide as many independent sub-tasks as the work needs.',
          items: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Specialist to use: researcher | coder | writer | analyst | planner, or a custom agent id/role.' },
              task: { type: 'string', description: 'A clear, self-contained instruction for that specialist.' },
            },
            required: ['agent', 'task'],
          },
        },
        isolate_workspace: {
          type: 'boolean',
          description: 'Give each sub-agent its OWN working-folder binding so parallel agents cannot overwrite one another’s files. Off by default; an isolated agent starts with no folders until one is bound to it.',
        },
      },
      required: ['tasks'],
    },
  },

  async execute({ tasks, isolate_workspace: isolateWorkspace = false }) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { success: false, error: 'Provide a non-empty tasks array.' }
    }
    const [{ streamMessage }, { getAgentById }, { getToolNames }, { runAgentPool }, isolation, localFs] = await Promise.all([
      import('../api'), import('../agents'), import('./index'), import('../agentPool'),
      import('../agentIsolation'), import('./localFs'),
    ])
    const allNames = getToolNames()

    const parentId = localFs.getWorkspaceCtx()?.conversationId ?? 'chat'
    const plan = isolation.planIsolation(parentId, tasks.map(t => t.agent), { isolate: !!isolateWorkspace })

    const runOne = async ({ agent, task }, index) => {
      const def = (await getAgentById(agent)) || null
      // Scope tools to the agent's allowlist and forbid re-delegation.
      const slot = plan[index] || { conversationId: parentId, isolated: false }
      const disabled = new Set(isolation.mergeIsolatedDisabled([], { isolated: slot.isolated }))
      if (def?.tools?.length) {
        const allow = new Set(def.tools)
        for (const n of allNames) if (!allow.has(n)) disabled.add(n)
      }
      let text = ''
      await new Promise((resolve) => {
        streamMessage(
          {
            message: task,
            messages: [],
            provider: def?.provider || undefined,
            model: def?.model || undefined,
            system_prompt: def?.system || `You are a focused specialist. Complete this sub-task precisely and return only the result.`,
            use_tools: true,
            use_web_search: true,
            disabledTools: [...disabled],
            agent_override: def || undefined,
            channel: `subagent-${Math.random().toString(36).slice(2, 8)}`,
            workspace_id: slot.conversationId,
          },
          (t) => { text += t },
          null,
          () => resolve(),
          (err) => {
            if (!text.trim()) text = `[Sub-agent error: ${err?.message || err}]`
            resolve()
          },        // a failed sub-agent returns its error text, never rejects the batch
        )
      })
      return { agent: def?.name || agent, role: def?.role || agent, result: text.trim() || '(no output)' }
    }

    // Rolling-window concurrency under the shared global agent budget.
    // runAgentPool passes (item, index), which is exactly what runOne needs to
    // look up its isolation slot — so pooling and isolation compose directly.
    const pooled = await runAgentPool(tasks, runOne)
    // A sub-agent that throws comes back as a bare { error } slot. Left as-is the
    // card rendered an empty box (no agent, no role, no result) and the model was
    // never told which specialist failed.
    const results = pooled.map((r, i) => (r && r.error && !r.result)
      ? { agent: tasks[i]?.agent || 'agent', role: tasks[i]?.agent || 'agent', result: `(failed: ${r.error})`, error: r.error }
      : r)

    return {
      success: true,
      delegated: results.length,
      results,
      note: 'Synthesize these specialist results into one coherent answer for the user.',
    }
  },
}
