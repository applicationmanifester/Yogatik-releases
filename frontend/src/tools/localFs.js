/**
 * Local filesystem tools — Cowork-style read/write/edit over a user-granted
 * folder. Desktop-only: they bridge to Rust commands exposed by the Tauri v2
 * shell (src-tauri). In the browser build window.__TAURI__ is absent, so every
 * tool returns an honest "desktop only" note instead of failing silently.
 *
 * Scope safety: the Rust side stores ONE granted root (chosen via fs_grant's
 * native folder picker) and rejects any path outside it — the model cannot
 * wander the disk. Grant is required once per session before any read/write.
 */

export function isDesktop() {
  return typeof window !== 'undefined' &&
    (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__)
}

async function invoke(cmd, args) {
  // withGlobalTauri:true in tauri.conf.json exposes window.__TAURI__.core.invoke,
  // so no npm dependency is bundled into the web build.
  const core = window.__TAURI__?.core
  if (!core?.invoke) throw new Error('Tauri bridge unavailable')
  return core.invoke(cmd, args)
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Local file access runs only in the Yogatik desktop app. Download it from the app’s Platforms page, or grant a folder there first.',
}

function ok(extra) { return { success: true, ...extra } }
function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }

// A single grant guards every op; surfaces a clear prompt to run fs_grant first.
async function guard(fn) {
  if (!isDesktop()) return DESKTOP_ONLY
  try { return await fn() }
  catch (e) {
    const msg = e?.message || String(e)
    if (/no folder granted|not granted/i.test(msg)) {
      return { success: false, error: 'No folder is granted yet. Call fs_grant first so the user can pick a working folder.' }
    }
    return fail(msg)
  }
}

/** UI helpers (desktop only) — manage the granted working folder outside the agent loop. */
export async function grantFolder() {
  if (!isDesktop()) return null
  try { return await invoke('fs_grant') } catch { return null }
}
export async function getGrantedRoot() {
  if (!isDesktop()) return null
  try { return await invoke('fs_granted_root') } catch { return null }
}
export async function clearGrantedFolder() {
  if (!isDesktop()) return
  try { await invoke('fs_clear_grant') } catch { /* ignore */ }
}

export const fsGrantTool = {
  schema: {
    description:
      'Open a native folder picker so the user grants Yogatik access to ONE working folder on their computer. ' +
      'Must be called before any other fs_* tool. All later reads/writes are confined to this folder. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    if (!isDesktop()) return DESKTOP_ONLY
    try {
      const root = await invoke('fs_grant')
      if (!root) return { success: false, error: 'User cancelled the folder picker.' }
      return ok({ tool: 'fs_grant', root, message: `Working folder set to ${root}` })
    } catch (e) { return fail(e) }
  },
}

export const fsListTool = {
  schema: {
    description: 'List files and folders under a path inside the granted folder. Returns names, sizes and type (file/dir). Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path inside the granted folder. "" or "." for the root.' },
        recursive: { type: 'boolean', description: 'Recurse into subfolders (default false).' },
      },
      required: [],
    },
  },
  async execute({ path = '', recursive = false } = {}) {
    return guard(async () => {
      const entries = await invoke('fs_list', { path, recursive: !!recursive })
      return ok({ tool: 'fs_list', path: path || '.', count: entries.length, entries })
    })
  },
}

export const fsReadTool = {
  schema: {
    description: 'Read a UTF-8 text file inside the granted folder. Returns its contents. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file inside the granted folder.' },
        max_bytes: { type: 'number', description: 'Optional cap (default 500000).' },
      },
      required: ['path'],
    },
  },
  async execute({ path, max_bytes } = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      const content = await invoke('fs_read', { path, maxBytes: max_bytes || 500000 })
      return ok({ tool: 'fs_read', path, bytes: content.length, content })
    })
  },
}

export const fsWriteTool = {
  schema: {
    description: 'Create or overwrite a text file inside the granted folder. Creates parent folders as needed. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to write inside the granted folder.' },
        content: { type: 'string', description: 'Full UTF-8 text to write.' },
      },
      required: ['path', 'content'],
    },
  },
  async execute({ path, content } = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      await invoke('fs_write', { path, content: content ?? '' })
      return ok({ tool: 'fs_write', path, bytes: (content ?? '').length, message: `Wrote ${path}` })
    })
  },
}

export const fsEditTool = {
  schema: {
    description:
      'Edit an existing text file by exact string replacement (like a targeted patch). ' +
      'old_string must appear exactly once unless replace_all is true. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file inside the granted folder.' },
        old_string: { type: 'string', description: 'Exact text to find.' },
        new_string: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence (default false).' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  async execute({ path, old_string, new_string, replace_all = false } = {}) {
    if (!path || old_string == null) return fail('path and old_string are required')
    return guard(async () => {
      const replaced = await invoke('fs_edit', {
        path, oldString: old_string, newString: new_string ?? '', replaceAll: !!replace_all,
      })
      return ok({ tool: 'fs_edit', path, replacements: replaced, message: `Edited ${path} (${replaced} change${replaced === 1 ? '' : 's'})` })
    })
  },
}

export const fsSearchTool = {
  schema: {
    description: 'Search file contents inside the granted folder for a substring or regex. Returns matching files with line numbers. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring or regular expression to search for.' },
        glob: { type: 'string', description: 'Optional filename glob filter, e.g. "*.js".' },
        regex: { type: 'boolean', description: 'Treat query as a regex (default false).' },
        max_results: { type: 'number', description: 'Cap on matches returned (default 100).' },
      },
      required: ['query'],
    },
  },
  async execute({ query, glob = '', regex = false, max_results = 100 } = {}) {
    if (!query) return fail('query is required')
    return guard(async () => {
      const matches = await invoke('fs_search', {
        query, glob, regex: !!regex, maxResults: max_results || 100,
      })
      return ok({ tool: 'fs_search', query, count: matches.length, matches })
    })
  },
}

export const fsDeleteTool = {
  schema: {
    description:
      'Delete a file or directory inside the granted folder. ' +
      'Set recursive=true to remove a non-empty directory tree. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file or directory to delete.' },
        recursive: { type: 'boolean', description: 'Delete directory and all its contents (default false).' },
      },
      required: ['path'],
    },
  },
  async execute({ path, recursive = false } = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      await invoke('fs_delete', { path, recursive: !!recursive })
      return ok({ tool: 'fs_delete', path, message: `Deleted ${path}` })
    })
  },
}

export const fsMkdirTool = {
  schema: {
    description: 'Create a directory (and any missing parent directories) inside the granted folder. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path of the directory to create.' },
      },
      required: ['path'],
    },
  },
  async execute({ path } = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      await invoke('fs_mkdir', { path })
      return ok({ tool: 'fs_mkdir', path, message: `Created directory ${path}` })
    })
  },
}

export const fsMoveTool = {
  schema: {
    description: 'Move or rename a file or directory inside the granted folder. Both src and dest must be inside the granted folder. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'Relative path of the source file or directory.' },
        dest: { type: 'string', description: 'Relative destination path (including new name if renaming).' },
      },
      required: ['src', 'dest'],
    },
  },
  async execute({ src, dest } = {}) {
    if (!src || !dest) return fail('src and dest are required')
    return guard(async () => {
      await invoke('fs_move', { src, dest })
      return ok({ tool: 'fs_move', src, dest, message: `Moved ${src} → ${dest}` })
    })
  },
}

