/**
 * watch_folder — watch a path inside the granted folder for file changes and
 * report the currently active watchers. Desktop app only (browsers have no
 * filesystem-watch API). Change events stream to the UI via the watcher bridge;
 * this tool starts/stops/lists watchers for the agent.
 */

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_WATCHER__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Folder watching runs only in the Yogatik desktop app, and needs a granted folder (fs_grant).',
}

export const watchFolderTool = {
  schema: {
    description:
      'Start, stop, or list file-system watchers on a path inside the granted folder. ' +
      'Use when the user wants to be notified when files change, or to auto-react to edits on disk. ' +
      'Change events are delivered to the app UI. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop', 'list', 'stop_all'], description: 'start a watcher, stop one by id, list active watchers, or stop all.' },
        path: { type: 'string', description: 'Relative path inside the granted folder to watch (action "start"). "" or "." for the root.' },
        recursive: { type: 'boolean', description: 'Watch subfolders too (default true).' },
        id: { type: 'string', description: 'Watcher id to stop (action "stop").' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'list', path = '.', recursive = true, id } = {}) {
    const w = bridge()
    if (!w) return DESKTOP_ONLY
    try {
      if (action === 'start') {
        // ctx is injected here, never a tool parameter — the model must not be
        // able to name another chat's folder.
        const { getWorkspaceCtx } = await import('./localFs')
        return { tool: 'watch_folder', ...(await w.start(path, { recursive, ctx: getWorkspaceCtx() })) }
      }
      if (action === 'stop') {
        if (!id) return { success: false, error: 'id is required to stop a watcher' }
        return { tool: 'watch_folder', ...(await w.stop(id)) }
      }
      if (action === 'stop_all') return { tool: 'watch_folder', ...(await w.stopAll()) }
      return { tool: 'watch_folder', ...(await w.list()) }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
