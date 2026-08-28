/**
 * Sub-Agent Runner tool — manage isolated sub-agents with their own terminals and Python RPC
 * Only works in the Electron desktop build (uses __YOGATIK_SUBAGENT__ bridge).
 */

import { isDesktop } from './localFs'

export const subAgentRunnerTool = {
  schema: {
    description:
      'Manage isolated, persistent Python worker processes. Each worker has private workspace files and persistent Python state (imports and variables) across executions. ' +
      'Use python_execute for computation and code experiments. For natural-language AI delegation use spawn_agents or crew_orchestrator instead: those run the active model with the correct tool policy. ' +
      'Actions: spawn, execute (only with options.pythonCode), status, list, kill, python_execute, python_install, python_reset, python_namespace.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['spawn', 'execute', 'status', 'list', 'kill', 'python_execute', 'python_install', 'python_reset', 'python_namespace'],
          description: 'What to do',
        },
        // For spawn
        agentId: { type: 'string', description: 'Unique ID for this sub-agent (required for spawn)' },
        config: {
          type: 'object',
          description: 'Sub-agent configuration',
          properties: {
            name: { type: 'string' },
            role: { type: 'string' },
            systemPrompt: { type: 'string' },
            tools: { type: 'array', items: { type: 'string' } },
            model: { type: 'string' },
            provider: { type: 'string' },
          },
        },
        // For execute/status/kill
        id: { type: 'string', description: 'Sub-agent ID (required for execute/status/kill)' },
        // For execute
        task: { type: 'string', description: 'Task to execute (required for execute)' },
        options: {
          type: 'object',
          description: 'Execution options. `execute` requires pythonCode; natural-language tasks are delegated with spawn_agents or crew_orchestrator.',
          properties: {
            timeout: { type: 'number' },
            pythonPackages: { type: 'array', items: { type: 'string' } },
            pythonCode: { type: 'string', description: 'Python code to run in this worker’s persistent private workspace.' },
            files: { type: 'object', additionalProperties: { type: 'string' }, description: 'Relative workspace files to create before running pythonCode.' },
          },
        },
        // For python_execute
        code: { type: 'string', description: 'Python code to execute (required for python_execute)' },
        files: {
          type: 'object',
          description: 'Files to write before execution (filename -> content)',
          additionalProperties: { type: 'string' },
        },
        // For python_install
        packages: { type: 'array', items: { type: 'string' }, description: 'Packages to install via micropip' },
      },
      required: ['action'],
    },
  },

  async execute({ action, agentId, config, id, task, options, code, files, packages }) {
    // Check if we're in Electron desktop
    if (!isDesktop()) {
      return {
        success: false,
        error: 'Sub-agent runner is only available in the Yogatik desktop app (Electron build).',
        desktopOnly: true,
      }
    }

    // Check if sub-agent bridge exists
    if (!window.__YOGATIK_SUBAGENT__) {
      return {
        success: false,
        error: 'Sub-agent bridge not available. Restart the desktop app.',
      }
    }

    const subAgent = window.__YOGATIK_SUBAGENT__

    try {
      switch (action) {
        case 'spawn': {
          if (!agentId || !config) {
            return { success: false, error: 'spawn requires agentId and config' }
          }
          const result = await subAgent.spawn(agentId, config)
          return result
        }

        case 'execute': {
          if (!id || !task) {
            return { success: false, error: 'execute requires id and task' }
          }
          const result = await subAgent.execute(id, task, options || {})
          return result
        }

        case 'status': {
          if (!id) {
            return { success: false, error: 'status requires id' }
          }
          const result = await subAgent.status(id)
          return result
        }

        case 'list': {
          const result = await subAgent.list()
          return result
        }

        case 'kill': {
          if (!id) {
            return { success: false, error: 'kill requires id' }
          }
          const result = await subAgent.kill(id)
          return result
        }

        case 'python_execute': {
          if (!id || !code) {
            return { success: false, error: 'python_execute requires id and code' }
          }
          const result = await subAgent.python.execute(id, code, files || {})
          return result
        }

        case 'python_install': {
          if (!id || !packages || !packages.length) {
            return { success: false, error: 'python_install requires id and packages array' }
          }
          const result = await subAgent.python.install(id, packages)
          return result
        }

        case 'python_reset': {
          if (!id) {
            return { success: false, error: 'python_reset requires id' }
          }
          const result = await subAgent.python.reset(id)
          return result
        }

        case 'python_namespace': {
          if (!id) {
            return { success: false, error: 'python_namespace requires id' }
          }
          const result = await subAgent.python.namespace(id)
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
