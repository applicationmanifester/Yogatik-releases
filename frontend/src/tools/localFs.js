/**
 * Local filesystem tools — Cowork-style read/write/edit over a user-granted
 * folder. Desktop-only: they bridge to Rust commands exposed by the Tauri v2
 * shell (src-tauri). In the browser build window.__TAURI__ is absent, so every
 * tool returns an honest "desktop only" note instead of failing silently.
 *
 * Scope safety: the main process keeps a registry of user-granted directories and
 * a per-chat binding. Every call carries an opaque ctx {conversationId, projectId}
 * injected HERE, never a tool parameter — model output influences this module, so
 * a model-supplied root would make the grant meaningless. Paths may be absolute;
 * safety is the realpath containment check against that chat's folders.
 *
 * Electron: several folders per chat (Claude Code's /add-dir model), inherited
 * from the project then the global default. Tauri: still ONE root, served by the
 * fs_grant/fs_granted_root/fs_clear_grant compatibility aliases.
 */

export function isDesktop() {
  return typeof window !== 'undefined' &&
    (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__)
}

// The active chat supplies the context for every call. It is injected here, NOT
// exposed as a tool parameter — the model must never be able to name another
// chat's folders. App.jsx installs a getter that reads from a ref, because
// reading React state directly here would capture a stale closure.
let ctxProvider = () => ({ conversationId: null, projectId: null })

export function setWorkspaceContext(fn) {
  ctxProvider = typeof fn === 'function' ? fn : () => ({ conversationId: null, projectId: null })
}

function workspaceCtx() {
  try { return ctxProvider() || {} } catch { return {} }
}

export function getWorkspaceCtx() { return workspaceCtx() }

async function invoke(cmd, args) {
  // withGlobalTauri:true in tauri.conf.json exposes window.__TAURI__.core.invoke,
  // so no npm dependency is bundled into the web build.
  const core = window.__TAURI__?.core
  if (!core?.invoke) throw new Error('Tauri bridge unavailable')
  return core.invoke(cmd, { ...(args || {}), ctx: workspaceCtx() })
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
      return { success: false, error: 'No working folder for this chat. Call fs_add_folder so the user can pick one.' }
    }
    return fail(msg)
  }
}

/** Shape a bare path (Tauri's single-root reply) like a roots_* entry. */
function asRoot(p, source) {
  if (!p) return null
  return { id: p, path: p, label: String(p).split(/[/\\]/).filter(Boolean).pop() || p, primary: true, source }
}

/** UI helpers (desktop only) — manage THIS chat's working folders.
 *  The Tauri shell has no roots_* commands and REJECTS unknown ones, so each
 *  falls back to the single-root fs_* command rather than silently doing nothing. */
export async function addRoot() {
  if (!isDesktop()) return null
  try { return await invoke('roots_add') }
  catch {
    try { return asRoot(await invoke('fs_grant'), 'chat') } catch { return null }
  }
}
export async function listRoots() {
  if (!isDesktop()) return []
  try { return (await invoke('roots_list')) || [] }
  catch {
    try {
      const one = asRoot(await invoke('fs_granted_root'), 'default')
      return one ? [one] : []
    } catch { return [] }
  }
}
export async function removeRoot(rootId) {
  if (!isDesktop()) return []
  try { return (await invoke('roots_remove', { rootId })) || [] } catch { return [] }
}
export async function setPrimaryRoot(rootId) {
  if (!isDesktop()) return []
  try { return (await invoke('roots_set_primary', { rootId })) || [] } catch { return [] }
}
/** A draft chat has no DB id; move its folders across once it is saved. */
export async function rebindChatRoots(oldId, newId) {
  if (!isDesktop() || oldId == null || newId == null) return
  try { await invoke('roots_rebind', { oldId, newId }) } catch { /* ignore */ }
}

// Legacy single-root helpers, kept one release for the Tauri shell.
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

/** Undo journal (Electron only) — every fs mutation is snapshotted first. */
export async function listJournal() {
  if (!isDesktop()) return []
  try { return (await invoke('journal_list')) || [] } catch { return [] }
}
export async function revertJournalEntry(id) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('journal_revert', { id }) } catch (e) { return fail(e) }
}

export const fsUndoTool = {
  schema: {
    description:
      'Undo a previous file change made in this chat (write, edit, delete, move). ' +
      'Call with no id to list what can be undone, then call again with the id. ' +
      'Restores the file or directory exactly as it was before that change. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Journal entry id to revert. Omit to list recent changes.' },
      },
      required: [],
    },
  },
  async execute({ id } = {}) {
    if (!isDesktop()) return DESKTOP_ONLY
    try {
      if (!id) {
        const entries = await listJournal()
        return ok({
          tool: 'fs_undo',
          count: entries.length,
          entries: entries.slice(0, 25).map(e => ({ id: e.id, op: e.op, target: e.target, at: e.ts })),
          message: entries.length ? 'Call fs_undo again with one of these ids.' : 'Nothing to undo in this chat.',
        })
      }
      const res = await revertJournalEntry(id)
      if (!res?.success) return { success: false, error: res?.error || 'Could not undo that change.' }
      return ok({ tool: 'fs_undo', restored: res.restored, message: `Restored ${res.restored}` })
    } catch (e) { return fail(e) }
  },
}

export const fsAddFolderTool = {
  schema: {
    description:
      'Open a native folder picker so the user grants this chat access to a folder on their computer. ' +
      'A chat may hold several folders. Call this when no folder is granted yet, or when the user ' +
      'asks to work somewhere new. Reads and writes are confined to this chat’s folders. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    if (!isDesktop()) return DESKTOP_ONLY
    try {
      const root = await addRoot()
      if (!root) return { success: false, error: 'User cancelled the folder picker.' }
      const p = typeof root === 'string' ? root : root.path
      return ok({ tool: 'fs_add_folder', root: p, message: `Added working folder ${p}` })
    } catch (e) { return fail(e) }
  },
}

// Kept so existing callers and the Tauri shell keep working for one release.
export const fsGrantTool = fsAddFolderTool

export const fsListTool = {
  schema: {
    description: 'List files and folders under a path in this chat’s folders. Returns names, sizes and type (file/dir). Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or relative to this chat’s primary folder. "" or "." for the primary folder.' },
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
    description: 'Read a UTF-8 text file inside this chat’s folders. Returns its contents. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or relative to this chat’s primary folder.' },
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
    description: 'Create or overwrite a text file in this chat’s folders. Creates parent folders as needed. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or relative to this chat’s primary folder.' },
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
        path: { type: 'string', description: 'Absolute path, or relative to this chat’s primary folder.' },
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
    description: 'Search file contents across every folder bound to this chat for a substring or regex. Returns matching files with line numbers. Desktop app only.',
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
      'Delete a file or directory inside this chat’s folders. ' +
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
    description: 'Create a directory (and any missing parent directories) inside this chat’s folders. Desktop app only.',
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
    description: 'Move or rename a file or directory inside this chat’s folders. Both src and dest must resolve inside them. Desktop app only.',
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

