/**
 * Auto-Skills tool — manage auto-generated skills from the agent
 */

import { isDesktop } from './localFs'

export const autoSkillsTool = {
  schema: {
    description:
      'Manage auto-generated skills learned from successful problem-solving sessions. ' +
      'List pending skills, promote them to permanent skills, dismiss them, or trigger learning from recent conversations. ' +
      'Auto-skills are created by analyzing conversations where the agent successfully completed tasks using tools.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'promote', 'dismiss', 'trigger_learning', 'get_log', 'enable_learning', 'disable_learning'],
          description: 'What to do',
        },
        // For promote/dismiss
        skillId: { type: 'string', description: 'Auto-skill ID (required for promote/dismiss)' },
        // For enable/disable learning
        enabled: { type: 'boolean', description: 'Enable or disable auto-learning' },
      },
      required: ['action'],
    },
  },

  async execute({ action, skillId, enabled }) {
    // Dynamic import to avoid circular dependency
    const { 
      getPendingAutoSkills, 
      promoteAutoSkill, 
      dismissAutoSkill, 
      processConversationsForLearning,
      getLearningLog,
      setAutoSkillLearning,
      getAutoSkillLearning
    } = await import('../autoSkills')

    try {
      switch (action) {
        case 'list': {
          const pending = await getPendingAutoSkills()
          return { success: true, pending, count: pending.length }
        }

        case 'promote': {
          if (!skillId) return { success: false, error: 'promote requires skillId' }
          const saved = await promoteAutoSkill(skillId)
          return { success: true, skill: saved }
        }

        case 'dismiss': {
          if (!skillId) return { success: false, error: 'dismiss requires skillId' }
          await dismissAutoSkill(skillId)
          return { success: true }
        }

        case 'trigger_learning': {
          const candidates = await processConversationsForLearning()
          return { success: true, candidates, count: candidates.length }
        }

        case 'get_log': {
          const log = await getLearningLog()
          return { success: true, log }
        }

        case 'enable_learning': {
          await setAutoSkillLearning(true)
          return { success: true, enabled: true }
        }

        case 'disable_learning': {
          await setAutoSkillLearning(false)
          return { success: true, enabled: false }
        }

        default:
          return { success: false, error: `Unknown action: ${action}` }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}