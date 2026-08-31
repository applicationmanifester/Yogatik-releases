/**
 * `todo` tool — the model's own task list for the current chat.
 *
 * Persisted per conversation in settings so it survives reloads, and injected
 * into the system prompt each turn by agent.js (see todoBlock).
 */

import { getSetting, setSetting } from '../db'
import { normalizeTodos, applyTodoOps, summarizeTodos } from '../todos'
import { getWorkspaceCtx } from './localFs'

function keyFor(ctx) {
  const id = ctx?.conversationId ?? 'global'
  return `todos_${id}`
}

// ctx is resolved INSIDE, not as a default parameter value. A default is
// evaluated at call time either way, but writing it here keeps one rule true
// across the file: the ambient chat is only ever a fallback for a caller that
// supplied nothing (the UI, where a single chat is active). The tool itself
// always passes the calling chat explicitly.
export async function getTodos(ctx) {
  const scope = getWorkspaceCtx(ctx)
  try { return normalizeTodos(await getSetting(keyFor(scope), [])) } catch { return [] }
}

export async function saveTodos(list, ctx) {
  const scope = getWorkspaceCtx(ctx)
  try { await setSetting(keyFor(scope), list) } catch { /* memory only */ }
  return list
}

export const todoTool = {
  schema: {
    description:
      'Track the steps of a multi-step task for this conversation. Use it whenever work has ' +
      'three or more steps: write the plan once with `replace`, then mark each item in_progress ' +
      'when you start it and completed as soon as it is finished. Call with no arguments to read ' +
      'the current list.',
    parameters: {
      type: 'object',
      properties: {
        replace: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace the whole list with these task descriptions.',
        },
        add: {
          type: 'array',
          items: { type: 'string' },
          description: 'Append these tasks to the list.',
        },
        update: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id of the task to change.' },
              status: { type: 'string', description: 'pending | in_progress | completed' },
              text: { type: 'string', description: 'Optional new wording.' },
            },
            required: ['id'],
          },
          description: 'Change the status or text of existing tasks.',
        },
        remove: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids of tasks to drop.',
        },
      },
      required: [],
    },
  },
  async execute(args = {}, opts = {}) {
    try {
      // Todos are stored under `todos_<conversationId>`. Reading the ambient
      // chat instead of the calling one would write chat A's plan into chat B's
      // list whenever both are streaming.
      const ctx = getWorkspaceCtx(opts?.ctx)
      const current = await getTodos(ctx)
      const hasOps = !!(args.replace || args.add || args.update || args.remove)
      if (!hasOps) {
        return { success: true, tool: 'todo', tasks: current, summary: summarizeTodos(current) }
      }
      const next = applyTodoOps(current, args)
      await saveTodos(next, ctx)
      return { success: true, tool: 'todo', tasks: next, summary: summarizeTodos(next) }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
