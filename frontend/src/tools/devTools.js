/**
 * Desktop development tools: git, background processes, file watching.
 *
 * All three run in the Electron main process, scoped to the calling chat's
 * working folders. In the browser (and under the Tauri shell, which does not
 * implement these commands) they return an honest "desktop only" note.
 */

import { isDesktop, getWorkspaceCtx } from './localFs'

const DESKTOP_ONLY = {
  success: false,
  error: 'This tool runs only in the Yogatik desktop app (Electron build).',
}

function ok(extra) { return { success: true, ...extra } }
function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }

async function invoke(cmd, args) {
  const core = window.__TAURI__?.core
  if (!core?.invoke) throw new Error('Desktop bridge unavailable')
  return core.invoke(cmd, { ...(args || {}), ctx: getWorkspaceCtx() })
}

async function guard(fn) {
  if (!isDesktop()) return DESKTOP_ONLY
  try { return await fn() } catch (e) { return fail(e) }
}

// ── git ─────────────────────────────────────────────────────────────────────

export const gitStatusTool = {
  schema: {
    description:
      'Show git status for this chat’s working folder: current branch, and which files are ' +
      'staged, modified or untracked. Use it before editing to see what has already changed, ' +
      'and after editing to confirm what you touched. Read-only. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    return guard(async () => {
      const r = await invoke('git_status')
      return r?.success ? ok({ tool: 'git_status', ...r }) : fail(r?.error || 'git status failed')
    })
  },
}

export const gitLogTool = {
  schema: {
    description: 'Show recent git commits (hash, author, date, subject) for this chat’s working folder. Read-only. Desktop app only.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many commits (default 20, max 200).' } },
      required: [],
    },
  },
  async execute({ limit = 20 } = {}) {
    return guard(async () => {
      const r = await invoke('git_log', { limit })
      return r?.success ? ok({ tool: 'git_log', ...r }) : fail(r?.error || 'git log failed')
    })
  },
}

export const gitDiffTool = {
  schema: {
    description:
      'Show the git diff for this chat’s working folder — what has actually changed, line by line. ' +
      'Read-only. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Diff staged changes instead of unstaged (default false).' },
        path: { type: 'string', description: 'Optional single file to diff.' },
      },
      required: [],
    },
  },
  async execute({ staged = false, path } = {}) {
    return guard(async () => {
      const r = await invoke('git_diff', { staged, path })
      return r?.success ? ok({ tool: 'git_diff', diff: r.diff || '(no changes)' }) : fail(r?.error || 'git diff failed')
    })
  },
}

// ── background processes ────────────────────────────────────────────────────

export const procStartTool = {
  schema: {
    description:
      'Start a LONG-RUNNING command in the background (dev server, watch-mode tests, a build that ' +
      'streams output) and return immediately with a process id. Use terminal_run instead for ' +
      'commands that finish quickly. Read the output later with proc_output. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command line to run.' },
        cwd: { type: 'string', description: 'Optional working directory inside this chat’s folders.' },
      },
      required: ['command'],
    },
  },
  async execute({ command, cwd } = {}) {
    if (!command) return fail('command is required')
    return guard(async () => {
      const r = await invoke('proc_start', { command, cwd })
      return r?.success
        ? ok({ tool: 'proc_start', id: r.id, command: r.command, message: `Started ${r.id}. Read output with proc_output.` })
        : fail(r?.error || 'Could not start the process.')
    })
  },
}

export const procOutputTool = {
  schema: {
    description:
      'Read the output of a background process started with proc_start, and whether it is still ' +
      'running. Pass the cursor from a previous call to get only what is new. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Process id from proc_start.' },
        cursor: { type: 'number', description: 'Optional cursor from a previous proc_output call.' },
      },
      required: ['id'],
    },
  },
  async execute({ id, cursor } = {}) {
    if (!id) return fail('id is required')
    return guard(async () => {
      const r = await invoke('proc_output', { id, cursor })
      return r?.success ? ok({ tool: 'proc_output', ...r }) : fail(r?.error || 'No such process.')
    })
  },
}

export const procStopTool = {
  schema: {
    description: 'Stop a background process started with proc_start. Desktop app only.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Process id to stop.' } },
      required: ['id'],
    },
  },
  async execute({ id } = {}) {
    if (!id) return fail('id is required')
    return guard(async () => {
      const r = await invoke('proc_stop', { id })
      return r?.success ? ok({ tool: 'proc_stop', id, message: `Stopped ${id}` }) : fail(r?.error || 'No such process.')
    })
  },
}

export const procListTool = {
  schema: {
    description: 'List the background processes running for this chat. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    return guard(async () => {
      const list = await invoke('proc_list')
      return ok({ tool: 'proc_list', count: (list || []).length, processes: list || [] })
    })
  },
}

// ── file watching ───────────────────────────────────────────────────────────

export const watchTool = {
  schema: {
    description:
      'Watch this chat’s working folders for changes made outside the app, or read which files ' +
      'have changed since the last check. action: "start" | "changes" | "stop". Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '"start", "changes" (default) or "stop".' },
      },
      required: [],
    },
  },
  async execute({ action = 'changes' } = {}) {
    return guard(async () => {
      const cmd = action === 'start' ? 'watch_start' : action === 'stop' ? 'watch_stop' : 'watch_changes'
      const r = await invoke(cmd)
      return r?.success ? ok({ tool: 'watch', action, ...r }) : fail(r?.error || 'Watch failed.')
    })
  },
}
