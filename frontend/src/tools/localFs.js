/**
 * Local filesystem tools — Cowork-style read/write/edit over a user-granted
 * folder. Desktop-only: they bridge to Rust commands exposed by the Tauri v2
 * shell (src-tauri) or Electron IPC. In the browser build window.__TAURI__ is absent,
 * so every tool returns an honest "desktop only" note instead of failing silently.
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
 *
 * Performance: ignore-filtered directory walk (.git, node_modules, dist, …),
 * binary-file skipping during content search, line-windowed reads
 * (start_line / end_line), multi-file batch read and compact file-tree output.
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

/** Lifecycle hooks trust management (Electron only). */
export async function getHookTrust() {
  if (!isDesktop()) return { root: null, trusted: false }
  try { return (await invoke('hooks_trusted')) || { root: null, trusted: false } }
  catch { return { root: null, trusted: false } }
}

export async function setHookTrust(trusted) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('hooks_trust', { trusted: !!trusted }) }
  catch (e) { return fail(e) }
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
        include_ignored: { type: 'boolean', description: 'Include build/dependency folders like node_modules/.git (default false).' },
      },
      required: [],
    },
  },
  async execute({ path = '', recursive = false, include_ignored = false } = {}) {
    return guard(async () => {
      const entries = await invoke('fs_list', { path, recursive: !!recursive, includeIgnored: !!include_ignored })
      return ok({ tool: 'fs_list', path: path || '.', count: entries.length, entries })
    })
  },
}

export const fsReadTool = {
  schema: {
    description: 'Read a UTF-8 text file inside this chat’s folders. Supports line-range windowing (start_line, end_line) for token-efficient reads. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or relative to this chat’s primary folder.' },
        max_bytes: { type: 'number', description: 'Optional byte cap (default 500000).' },
        start_line: { type: 'number', description: 'Optional 1-indexed starting line number.' },
        end_line: { type: 'number', description: 'Optional 1-indexed ending line number.' },
      },
      required: ['path'],
    },
  },
  async execute({ path, max_bytes, start_line, end_line } = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      const content = await invoke('fs_read', {
        path,
        maxBytes: max_bytes || 500000,
        startLine: start_line,
        endLine: end_line,
      })
      return ok({
        tool: 'fs_read',
        path,
        bytes: content.length,
        start_line: start_line || 1,
        end_line: end_line || undefined,
        content,
      })
    })
  },
}

export const fsBatchReadTool = {
  schema: {
    description: 'Read multiple text files in parallel inside the active workspace in a single round-trip. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of relative file paths to read concurrently.',
        },
        max_bytes_per_file: { type: 'number', description: 'Maximum bytes per file (default 250000).' },
      },
      required: ['paths'],
    },
  },
  async execute({ paths = [], max_bytes_per_file = 250000 } = {}) {
    if (!Array.isArray(paths) || !paths.length) return fail('paths array is required and must not be empty')
    return guard(async () => {
      const files = await invoke('fs_batch_read', { paths, maxBytesPerFile: max_bytes_per_file })
      return ok({ tool: 'fs_batch_read', count: files.length, files })
    })
  },
}

export const fsFileTreeTool = {
  schema: {
    description: 'Generate a compact ASCII directory tree of the workspace up to a specified depth. Great for understanding project structure. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to start from ("" for workspace root).' },
        max_depth: { type: 'number', description: 'Maximum depth level to inspect (default 3).' },
        include_ignored: { type: 'boolean', description: 'Include ignored directories like node_modules (default false).' },
      },
      required: [],
    },
  },
  async execute({ path = '', max_depth = 3, include_ignored = false } = {}) {
    return guard(async () => {
      const tree = await invoke('fs_file_tree', {
        path,
        maxDepth: max_depth || 3,
        includeIgnored: !!include_ignored,
      })
      return ok({ tool: 'fs_file_tree', path: path || '.', tree })
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

export const fsFindFilesTool = {
  schema: {
    name: 'fs_find_files',
    description: 'Find files across the workspace by filename, glob pattern (e.g. "**/*.jsx", "*.test.js"), or extension. Fast path discovery without scanning file contents. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Filename, substring, or glob pattern to search for (e.g. "*.json", "src/**/*.jsx").' },
        extension: { type: 'string', description: 'Optional file extension filter (e.g. "js", "png", "md").' },
        max_depth: { type: 'number', description: 'Maximum directory recursion depth (default 10).' },
        limit: { type: 'number', description: 'Maximum number of matching file paths to return (default 100).' },
        include_ignored: { type: 'boolean', description: 'Whether to include node_modules, .git, and dist folders (default false).' },
      },
      required: ['pattern'],
    },
  },
  async execute({ pattern = '', extension = '', max_depth = 10, limit = 100, include_ignored = false } = {}) {
    if (!pattern && !extension) return fail('Either pattern or extension is required')
    return guard(async () => {
      let files = []
      try {
        files = await invoke('fs_find_files', {
          pattern: pattern || '*',
          extension: extension || undefined,
          maxDepth: max_depth,
          limit,
          includeIgnored: !!include_ignored,
        })
      } catch {
        const list = await invoke('fs_list', { recursive: true, maxDepth: max_depth }).catch(() => [])
        // fs_list returns `is_dir` (snake), not `isDir` — the old filter kept
        // every directory and reported folders as matching "files".
        files = (Array.isArray(list) ? list : [])
          .filter(f => !f.is_dir && !f.isDir)
          .map(f => f.path || f.name)
      }

      const normPattern = (pattern || '').toLowerCase()
      const normExt = extension ? extension.toLowerCase().replace(/^\./, '') : ''
      const ignoredPaths = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage']

      let matched = (files || []).filter(p => {
        const pNorm = String(p).toLowerCase().replace(/\\/g, '/')
        if (!include_ignored && ignoredPaths.some(ig => pNorm.includes(`/${ig}/`) || pNorm.startsWith(`${ig}/`))) {
          return false
        }
        if (normExt && !pNorm.endsWith(`.${normExt}`)) {
          return false
        }
        if (pattern && pattern !== '*') {
          const simpleGlob = normPattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
          try {
            const re = new RegExp(simpleGlob)
            return re.test(pNorm) || pNorm.includes(normPattern)
          } catch {
            return pNorm.includes(normPattern)
          }
        }
        return true
      })

      matched = matched.slice(0, limit)
      return ok({
        tool: 'fs_find_files',
        pattern,
        extension: extension || undefined,
        count: matched.length,
        files: matched,
      })
    })
  },
}

export const fsSearchTool = {
  schema: {
    description: 'Search file contents across every folder bound to this chat for a substring or regex. Skips binary files and ignored directories automatically. Returns matching files with line numbers and optional surrounding context lines. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring or regular expression to search for.' },
        glob: { type: 'string', description: 'Optional filename glob filter, e.g. "*.js".' },
        regex: { type: 'boolean', description: 'Treat query as a regex (default false).' },
        max_results: { type: 'number', description: 'Cap on matches returned (default 100).' },
        case_sensitive: { type: 'boolean', description: 'Match case sensitively (default false).' },
        context_lines: { type: 'number', description: 'Surrounding before/after lines of code to include with each match (default 0).' },
      },
      required: ['query'],
    },
  },
  async execute({ query, glob = '', regex = false, max_results = 100, case_sensitive = false, context_lines = 0 } = {}) {
    if (!query) return fail('query is required')
    return guard(async () => {
      const matches = await invoke('fs_search', {
        query,
        glob,
        regex: !!regex,
        maxResults: max_results || 100,
        caseSensitive: !!case_sensitive,
        contextLines: context_lines || 0,
      })
      return ok({ tool: 'fs_search', query, count: matches?.length || 0, matches: matches || [] })
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

export const fsReplaceContentTool = {
  schema: {
    name: 'fs_replace_content',
    description: 'Replace a single contiguous block of text in an existing file. Ensures exact matching and safe line replacement. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path of file to edit.' },
        target_content: { type: 'string', description: 'Exact string to be replaced.' },
        replacement_content: { type: 'string', description: 'New string to replace target_content with.' },
        allow_multiple: { type: 'boolean', description: 'Replace all occurrences if true (default false).' },
      },
      required: ['path', 'target_content', 'replacement_content'],
    },
  },
  async execute({ path, target_content, replacement_content, allow_multiple = false } = {}) {
    if (!path || target_content == null || replacement_content == null) {
      return fail('path, target_content, and replacement_content are required')
    }
    return guard(async () => {
      const readRes = await invoke('fs_read', { path, maxBytes: 5000000 })
      const original = typeof readRes === 'string' ? readRes : (readRes?.content || '')
      if (!original.includes(target_content)) {
        return fail(`target_content not found in ${path}`)
      }
      if (!allow_multiple) {
        const firstIdx = original.indexOf(target_content)
        const secondIdx = original.indexOf(target_content, firstIdx + 1)
        if (secondIdx !== -1) {
          return fail(`target_content appears multiple times in ${path}. Specify allow_multiple=true or provide a more specific chunk.`)
        }
      }
      const updated = allow_multiple
        ? original.replaceAll(target_content, replacement_content)
        : original.replace(target_content, replacement_content)

      await invoke('fs_write', { path, content: updated })
      return ok({
        tool: 'fs_replace_content',
        path,
        replaced: true,
        bytes: updated.length,
        message: `Successfully modified ${path}`,
      })
    })
  },
}

export const fsMultiReplaceTool = {
  schema: {
    name: 'fs_multi_replace',
    description: 'Perform multiple non-contiguous block replacements across a file in a single atomic transaction. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of file to modify.' },
        chunks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Exact text segment to replace.' },
              replacement: { type: 'string', description: 'New replacement text.' },
            },
            required: ['target', 'replacement'],
          },
          description: 'Array of { target, replacement } replacement chunks.',
        },
      },
      required: ['path', 'chunks'],
    },
  },
  async execute({ path, chunks = [] } = {}) {
    if (!path || !Array.isArray(chunks) || !chunks.length) {
      return fail('path and non-empty chunks array are required')
    }
    return guard(async () => {
      const readRes = await invoke('fs_read', { path, maxBytes: 5000000 })
      let content = typeof readRes === 'string' ? readRes : (readRes?.content || '')
      
      let appliedCount = 0
      for (const chunk of chunks) {
        if (!content.includes(chunk.target)) {
          return fail(`Target chunk not found in file: "${chunk.target.slice(0, 40)}..."`)
        }
        content = content.replace(chunk.target, chunk.replacement)
        appliedCount++
      }

      await invoke('fs_write', { path, content })
      return ok({
        tool: 'fs_multi_replace',
        path,
        appliedChunks: appliedCount,
        bytes: content.length,
        message: `Successfully applied ${appliedCount} edits to ${path}`,
      })
    })
  },
}

export const fsFileInfoTool = {
  schema: {
    name: 'fs_file_info',
    description: 'Inspect detailed metadata, file size, line counts, extension, and integrity stats for a file. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of file to inspect.' },
      },
      required: ['path'],
    },
  },
  async execute({ path } = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      const readRes = await invoke('fs_read', { path, maxBytes: 5000000 })
      const text = typeof readRes === 'string' ? readRes : (readRes?.content || '')
      const lines = text.split('\n')
      const ext = path.includes('.') ? path.split('.').pop().toLowerCase() : 'txt'

      return ok({
        tool: 'fs_file_info',
        path,
        extension: ext,
        bytes: text.length,
        linesCount: lines.length,
        wordsCount: text.split(/\s+/).filter(Boolean).length,
        isEmpty: text.length === 0,
      })
    })
  },
}

export const fsBatchWriteTool = {
  schema: {
    name: 'fs_batch_write',
    description: 'Create or overwrite multiple files across workspace in a single round-trip. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path of file.' },
              content: { type: 'string', description: 'Full UTF-8 content to write.' },
            },
            required: ['path', 'content'],
          },
          description: 'Array of files to write ({ path, content }).',
        },
      },
      required: ['files'],
    },
  },
  async execute({ files = [] } = {}) {
    if (!Array.isArray(files) || !files.length) return fail('files array is required and must not be empty')
    return guard(async () => {
      const written = []
      for (const f of files) {
        if (f.path) {
          await invoke('fs_write', { path: f.path, content: f.content ?? '' })
          written.push({ path: f.path, bytes: (f.content ?? '').length })
        }
      }
      return ok({ tool: 'fs_batch_write', count: written.length, written })
    })
  },
}

export function stripAnsi(str = '') {
  return typeof str === 'string'
    ? str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    : ''
}

// NOTE: terminal_exec used to live here — a second, near-identical shell tool
// competing with terminal_run for the same job and the same IPC bridge. Its
// extras (a non-interactive env, ANSI stripping, a duration) are folded into
// terminalRun.js, and `terminal_exec` survives only as an alias in the registry.
// Nothing is re-exported from here: terminalRun.js imports stripAnsi from this
// file, so an export back the other way would make the two modules circular.

