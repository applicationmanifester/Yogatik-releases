/**
 * driveCycleTool — Exposes the proactive autonomous drive cycle to the agent.
 * Allows the agent to manage goals, run cycles manually, and review history.
 */

import {
  createGoal,
  updateGoal,
  getActiveGoals,
  runDriveCycle,
  getCycleHistory,
  generateAwaySummary,
  scheduleDriveCycle,
  stopDriveCycle,
  scoreGoal,
  GOAL_STATUS,
} from '../driveCycle'

export const driveCycleTool = {
  schema: {
    description:
      'Proactive autonomous agency: manage long-term goals that Yogatik works on in the background. ' +
      'Create goals, run drive cycles manually, review what was accomplished while away, and schedule/unschedule automatic cycles.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_goal', 'update_goal', 'list_goals', 'run_cycle', 'history', 'away_summary', 'schedule', 'unschedule', 'score_goal'],
          description: 'What to do',
        },
        // For create_goal
        title: { type: 'string', description: 'Goal title' },
        description: { type: 'string', description: 'Goal description' },
        priority: { type: 'number', description: 'Priority 1-10 (default 5)' },
        deadline: { type: 'string', description: 'ISO date string for deadline' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for filtering' },
        recurrence: { type: 'string', description: 'Recurrence: daily, weekly, monthly, or cron expression' },
        // For update_goal
        goalId: { type: 'string', description: 'Goal ID' },
        updates: { type: 'object', description: 'Fields to update' },
        // For list_goals
        status: { type: 'string', description: 'Filter by status: active, paused, completed, failed, archived' },
        // For score_goal
        goalId: { type: 'string', description: 'Goal ID to score' },
        context: { type: 'object', description: 'Scoring context (feasibilityBoost, etc.)' },
      },
      required: ['action'],
    },
  },

  async execute(args = {}) {
    const { action } = args

    switch (action) {
      case 'create_goal': {
        const { title, description, priority = 5, deadline, tags = [], recurrence } = args
        if (!title || !description) {
          return { success: false, error: 'title and description required' }
        }
        const id = await createGoal({ title, description, priority, deadline, tags, recurrence })
        return { success: true, goalId: id }
      }

      case 'update_goal': {
        const { goalId, updates } = args
        if (!goalId || !updates) {
          return { success: false, error: 'goalId and updates required' }
        }
        return await updateGoal(goalId, updates)
      }

      case 'list_goals': {
        const { status } = args
        const goals = await getActiveGoals()
        const filtered = status ? goals.filter(g => g.status === status) : goals
        return { success: true, goals: filtered, count: filtered.length }
      }

      case 'run_cycle': {
        const { context = {} } = args
        const result = await runDriveCycle(context)
        return result
      }

      case 'history': {
        const { limit = 20 } = args
        const cycles = await getCycleHistory(limit)
        return { success: true, cycles, count: cycles.length }
      }

      case 'away_summary': {
        const summary = await generateAwaySummary()
        return { success: true, summary }
      }

      case 'schedule': {
        const { intervalMinutes = 30 } = args
        await scheduleDriveCycle(intervalMinutes)
        return { success: true, message: `Drive cycle scheduled every ${intervalMinutes} minutes` }
      }

      case 'unschedule': {
        await stopDriveCycle()
        return { success: true, message: 'Drive cycle unscheduled' }
      }

      case 'score_goal': {
        const { goalId, context = {} } = args
        if (!goalId) return { success: false, error: 'goalId required' }
        const goals = await getActiveGoals()
        const goal = goals.find(g => g.id === goalId)
        if (!goal) return { success: false, error: 'Goal not found' }
        const score = scoreGoal(goal, context)
        return { success: true, goalId, score, breakdown: { priority: goal.priority * 5, deadline: goal.deadline ? 'calculated' : 'none' } }
      }

      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
