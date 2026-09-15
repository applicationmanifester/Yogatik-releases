/**
 * agentSwarmTool.js — Exposes the Sovereign Multi-Agent Swarm with Self-Healing Loops.
 */

import { AgentSwarm } from '../agentSwarm'
import { getSessionBlackboard } from '../agentBlackboard'

export const agentSwarmTool = {
  schema: {
    description:
      'Execute high-level objectives using an autonomous multi-agent swarm (Planner, Coder, Critic, QA Tester). ' +
      'Coordinates a DAG of tasks with parallel execution, shared blackboard memory, and automated self-healing error recovery.',
    parameters: {
      type: 'object',
      properties: {
        objective: {
          type: 'string',
          description: 'The complex goal or objective for the multi-agent swarm to plan, execute, and verify.',
        },
        concurrencyLimit: {
          type: 'number',
          description: 'Maximum parallel worker tasks to run concurrently (1 to 8, default 2).',
        },
        maxRetries: {
          type: 'number',
          description: 'Maximum self-healing retry attempts per failed task (default 2).',
        },
        sessionId: {
          type: 'string',
          description: 'Optional session identifier for blackboard persistence.',
        },
      },
      required: ['objective'],
    },
  },

  async execute({ objective, concurrencyLimit = 2, maxRetries = 2, sessionId = 'default' }) {
    if (!objective || typeof objective !== 'string') {
      return { success: false, error: 'objective is required' }
    }

    const blackboard = getSessionBlackboard(sessionId)
    const swarm = new AgentSwarm({
      sessionId,
      blackboard,
      concurrencyLimit,
      maxRetries,
    })

    await swarm.planObjective(objective)
    const summary = await swarm.run()

    return {
      success: summary.status === 'completed',
      status: summary.status,
      tasks: summary.tasks,
      results: summary.results,
      blackboardContext: blackboard.formatContextPrompt(),
    }
  },
}
