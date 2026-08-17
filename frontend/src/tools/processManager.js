/**
 * process_manager — list running OS processes and (with an explicit confirm)
 * terminate one by PID. Desktop app only. Killing is guarded twice: the tool
 * refuses to kill unless `confirm:true` is passed, and the main process protects
 * critical PIDs (self, System).
 */

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_PROCESS__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Process management runs only in the Yogatik desktop app.',
}

export const processManagerTool = {
  schema: {
    description:
      'List running processes on the user’s computer, or terminate one by PID. ' +
      'Use to find a hung app or free a busy port. Killing requires confirm:true (a destructive action). Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'kill'], description: 'list processes or kill one by pid.' },
        filter: { type: 'string', description: 'Substring/name or exact PID to filter the list (action "list").' },
        pid: { type: 'number', description: 'Process ID to terminate (action "kill").' },
        confirm: { type: 'boolean', description: 'Must be true to actually kill a process. Without it the kill is refused.' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'list', filter, pid, confirm = false } = {}) {
    const p = bridge()
    if (!p) return DESKTOP_ONLY
    try {
      if (action === 'kill') {
        if (!pid) return { success: false, error: 'pid is required to kill a process' }
        if (!confirm) return { success: false, error: `Refusing to kill PID ${pid}: pass confirm:true after the user approves.`, needsConfirm: true, pid }
        return { tool: 'process_manager', ...(await p.kill(pid)) }
      }
      const r = await p.list({ filter })
      return { tool: 'process_manager', success: !!r?.success, count: r?.count || 0, processes: r?.processes || [], error: r?.error }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
