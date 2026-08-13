/**
 * Scheduler tool — manage background cron jobs from the agent.
 * Only works in the Electron desktop build (uses __YOGATIK_SCHEDULER__ bridge).
 * In browser builds, returns an honest "desktop only" message.
 */

import { isDesktop } from './localFs'

export const schedulerTool = {
  schema: {
    description:
      'Manage background scheduled jobs (cron daemon) that run unattended in the Electron desktop app. ' +
      'Create, list, update, delete, or run jobs now. Jobs persist across restarts. ' +
      'Schedule uses natural language: "every day at 9am", "weekly on monday at 10:30", "every 30 minutes", "monthly on the 1st at 8am", or a 5-field cron expression. ' +
      'Job types: workflow (run a saved workflow), skill (run with a skill), agent (run with an agent), backup (export data), briefing (generate a report), custom (arbitrary prompt).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'update', 'delete', 'toggle', 'run_now', 'parse_schedule', 'get_logs'],
          description: 'What to do',
        },
        // For create
        name: { type: 'string', description: 'Job name (required for create)' },
        schedule: { type: 'string', description: 'Natural language schedule or cron (required for create)' },
        type: {
          type: 'string',
          enum: ['workflow', 'skill', 'agent', 'backup', 'briefing', 'custom'],
          description: 'Job type (required for create)',
        },
        description: { type: 'string', description: 'Job description' },
        payload: {
          type: 'object',
          description: 'Job-specific payload. For workflow: {workflowId, variables}. For skill: {skillId, prompt}. For agent: {agentId, task}. For briefing: {topic, format}. For custom: {prompt, model, provider}.',
        },
        // For update/toggle/delete/run_now/get_logs
        id: { type: 'string', description: 'Job ID (required for update/delete/toggle/run_now/get_logs)' },
        // For update
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            schedule: { type: 'string' },
            description: { type: 'string' },
            payload: { type: 'object' },
            enabled: { type: 'boolean' },
          },
          description: 'Fields to update',
        },
        // For parse_schedule
        natural: { type: 'string', description: 'Natural language to parse (required for parse_schedule)' },
      },
      required: ['action'],
    },
  },

  async execute({ action, name, schedule, type, description, payload, id, updates, natural }) {
    // Check if we're in Electron desktop
    if (!isDesktop()) {
      return {
        success: false,
        error: 'Scheduler is only available in the Yogatik desktop app (Electron build).',
        desktopOnly: true,
      }
    }

    // Check if scheduler bridge exists
    if (!window.__YOGATIK_SCHEDULER__) {
      return {
        success: false,
        error: 'Scheduler bridge not available. Restart the desktop app.',
      }
    }

    const scheduler = window.__YOGATIK_SCHEDULER__

    try {
      switch (action) {
        case 'list': {
          const result = await scheduler.getJobs()
          return { success: true, jobs: result }
        }

        case 'create': {
          if (!name || !schedule || !type) {
            return { success: false, error: 'create requires name, schedule, and type' }
          }
          const result = await scheduler.createJob({ name, schedule, type, description, payload })
          return result
        }

        case 'update': {
          if (!id || !updates) {
            return { success: false, error: 'update requires id and updates' }
          }
          const result = await scheduler.updateJob(id, updates)
          return result
        }

        case 'delete': {
          if (!id) {
            return { success: false, error: 'delete requires id' }
          }
          const result = await scheduler.deleteJob(id)
          return result
        }

        case 'toggle': {
          if (!id) {
            return { success: false, error: 'toggle requires id' }
          }
          const result = await scheduler.toggleJob(id)
          return result
        }

        case 'run_now': {
          if (!id) {
            return { success: false, error: 'run_now requires id' }
          }
          const result = await scheduler.runJobNow(id)
          return result
        }

        case 'parse_schedule': {
          if (!natural) {
            return { success: false, error: 'parse_schedule requires natural' }
          }
          const result = await scheduler.parseSchedule(natural)
          return result
        }

        case 'get_logs': {
          if (!id) {
            return { success: false, error: 'get_logs requires id' }
          }
          const result = await scheduler.getJobLogs(id)
          return result
        }

        default:
          return { success: false, error: `Unknown action: ${action}` }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}