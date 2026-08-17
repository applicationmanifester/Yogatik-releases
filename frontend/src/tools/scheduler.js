/**
 * Scheduler tool — manage background cron jobs from the agent.
 * Only works in the Electron desktop build (uses __YOGATIK_SCHEDULER__ bridge).
 * In browser builds, returns an honest "desktop only" message.
 */

import { isDesktop } from './localFs'
import { timerTool } from './timer'

export const schedulerTool = {
  schema: {
    description:
      'Manage background scheduled jobs, alarms, timers, and reminders. ' +
      'In the desktop app, runs persistent background cron daemon jobs. ' +
      'In the browser, sets alarms, countdown timers, and audio reminder alerts.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'list', 'create', 'update', 'delete', 'cancel', 'toggle', 'run_now', 'parse_schedule', 'get_logs'],
          description: 'What to do',
        },
        // For create / set
        name: { type: 'string', description: 'Job/alarm name' },
        schedule: { type: 'string', description: 'Natural language schedule or duration, e.g. "every day at 9am", "in 10 minutes", "07:00 AM"' },
        duration: { type: 'string', description: 'Timer duration, e.g. "10 minutes", "30s"' },
        time: { type: 'string', description: 'Alarm time, e.g. "07:30 AM", "18:00"' },
        label: { type: 'string', description: 'Alarm or reminder label' },
        type: {
          type: 'string',
          enum: ['workflow', 'skill', 'agent', 'backup', 'briefing', 'custom', 'timer', 'alarm', 'reminder'],
          description: 'Job type',
        },
        description: { type: 'string', description: 'Job description' },
        payload: {
          type: 'object',
          description: 'Job-specific payload. For workflow: {workflowId, variables}. For skill: {skillId, prompt}. For agent: {agentId, task}. For briefing: {topic, format}. For custom: {prompt, model, provider}.',
        },
        // For update/toggle/delete/run_now/get_logs
        id: { type: 'string', description: 'Job ID' },
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
    },
  },

  async execute(args = {}) {
    const { action, name, schedule, type, description, payload, id, updates, natural, time, duration, label } = args || {}

    // In browser builds: gracefully handle alarms, timers, and reminders
    if (!isDesktop()) {
      if (action === 'create' || action === 'set' || schedule || time || duration || natural) {
        return timerTool.execute({
          action: 'set',
          duration: duration || schedule || natural,
          time: time,
          label: label || name || description || 'Scheduled reminder',
          message: payload?.prompt || payload?.topic || description || name || 'Scheduled reminder',
        })
      }
      if (action === 'list') {
        return timerTool.execute({ action: 'list' })
      }
      if (action === 'cancel' || action === 'delete') {
        return timerTool.execute({ action: 'cancel', id })
      }
      return {
        success: false,
        error: 'Background cron daemon is only available in the Yogatik desktop app (Electron build). In browser mode, timers and alarms are supported.',
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