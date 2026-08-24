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

import { globalFsCache } from './fsCache'
import { globalWorkspaceTrie } from './workspaceTrie'

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
      // In-memory cache hit for full-file reads (<0.01ms)
      const offset = start_line > 0 ? start_line : 0
      const limit = offset && end_line >= offset ? (end_line - offset + 1) : 0
      if (!offset && !limit && !max_bytes) {
        const cached = globalFsCache.get(path)
        if (cached && typeof cached === 'string') {
          return ok({ tool: 'fs_read', path, bytes: cached.length, content: cached, cached: true })
        }
      }

      const res = await invoke('fs_read', {
        path,
        maxBytes: max_bytes || 500000,
        offset,
        limit,
      })
      if (typeof res === 'string') {
        globalFsCache.set(path, res)
        return ok({ tool: 'fs_read', path, bytes: res.length, content: res })
      }
      if (res?.content && !offset && !limit && !res.truncated) {
        globalFsCache.set(path, res.content)
      }
      return ok({
        tool: 'fs_read',
        path,
        bytes: res.bytes,
        lines: res.lines,
        content: res.content,
        truncated: res.truncated,
        binary: res.binary,
        encoding: res.encoding,
        eol: res.eol,
        hash: res.hash,
        range: res.range,
        note: res.note || undefined,
      })
    })
  },
}


export const fsCopyTool = {
  schema: {
    description: 'Copy a file or directory inside this chat’s folders. Refuses to replace an existing destination unless overwrite is true. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'Source path.' },
        dest: { type: 'string', description: 'Destination path.' },
        overwrite: { type: 'boolean', description: 'Replace the destination if it exists (its current contents are journalled first).' },
      },
      required: ['src', 'dest'],
    },
  },
  async execute({ src, dest, overwrite } = {}) {
    if (!src) return fail('src is required')
    if (!dest) return fail('dest is required')
    return guard(async () => {
      const r = await invoke('fs_copy', { src, dest, overwrite: !!overwrite })
      return ok({ tool: 'fs_copy', ...r, message: `Copied ${src} → ${dest}${r.replaced ? ' (replaced)' : ''}` })
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
        content: { type: 'string', description: 'Full text to write. The file’s existing encoding and line endings are preserved automatically.' },
        expected_hash: { type: 'string', description: 'The hash returned by fs_read. If the file changed on disk since then, the result says so and the previous content is recoverable with fs_undo.' },
      },
      required: ['path', 'content'],
    },
  },
  async execute(args = {}) {
    const path = args.path || args.file || args.filepath || args.target_file || args.TargetFile || args.filename
    const content = args.content ?? args.text ?? args.code ?? args.data ?? args.body ?? args.file_content ?? args.CodeContent ?? ''
    const expected_hash = args.expected_hash ?? args.hash ?? args.expectedHash
    if (!path) return fail('path is required (e.g. { path: "src/file.js", content: "..." })')
    return guard(async () => {
      const r = await invoke('fs_write', { path, content: String(content ?? ''), expectedHash: expected_hash || null })
      const res = r && typeof r === 'object' ? r : {}
      globalFsCache.set(path, String(content ?? ''))
      globalWorkspaceTrie.insert(path)
      return ok({
        tool: 'fs_write',
        path,
        bytes: res.bytes ?? String(content ?? '').length,
        hash: res.hash,
        encoding: res.encoding,
        stale: res.stale || false,
        warning: res.warning || undefined,
        message: `Wrote ${path}${res.stale ? ' (it had changed on disk — see warning)' : ''}`,
      })
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
        expected_hash: { type: 'string', description: 'The hash returned by fs_read. If the file changed on disk since then, the result says so.' },
        start_line: { type: 'number', description: 'Optional 1-indexed start line to limit search scope.' },
        end_line: { type: 'number', description: 'Optional 1-indexed end line to limit search scope.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  async execute(args = {}) {
    const path = args.path || args.file || args.filepath || args.target_file || args.TargetFile || args.filename
    const old_string = args.old_string ?? args.old ?? args.old_str ?? args.find ?? args.target ?? args.old_text ?? args.search ?? args.original ?? args.TargetContent ?? args.target_content ?? args.before
    const new_string = args.new_string ?? args.new ?? args.new_str ?? args.replace ?? args.replacement ?? args.new_text ?? args.content ?? args.ReplacementContent ?? args.replacement_content ?? args.after
    const replace_all = args.replace_all ?? args.replaceAll ?? args.all ?? args.AllowMultiple ?? args.allow_multiple ?? false
    const expected_hash = args.expected_hash ?? args.hash ?? args.expectedHash
    const start_line = args.start_line ?? args.StartLine ?? args.startLine ?? 0
    const end_line = args.end_line ?? args.EndLine ?? args.endLine ?? 0

    if (!path) return fail('path is required (e.g. { path: "src/file.js", old_string: "...", new_string: "..." })')
    if (old_string == null || new_string == null) {
      return fail('old_string and new_string are required (e.g. { path: "src/file.js", old_string: "...", new_string: "..." })')
    }
    return guard(async () => {
      const r = await invoke('fs_edit', {
        path,
        oldString: String(old_string),
        newString: String(new_string),
        replaceAll: !!replace_all,
        expectedHash: expected_hash || null,
        startLine: Number(start_line) || 0,
        endLine: Number(end_line) || 0,
      })
      globalFsCache.invalidate(path)
      const res = r && typeof r === 'object' ? r : {}
      return ok({
        tool: 'fs_edit',
        path,
        replaced: res.replaced ?? 1,
        hash: res.hash,
        stale: res.stale || false,
        warning: res.warning || undefined,
        message: `Edited ${path} (${res.replaced ?? 1} replacement(s))`,
      })
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
        start_line: { type: 'integer', description: 'Optional 1-based start line to constrain search window.' },
        end_line: { type: 'integer', description: 'Optional 1-based end line to constrain search window.' },
      },
      required: ['path', 'target_content', 'replacement_content'],
    },
  },
  async execute({ path, target_content, replacement_content, allow_multiple = false, start_line = 0, end_line = 0 } = {}) {
    if (!path || target_content == null || replacement_content == null) {
      return fail('path, target_content, and replacement_content are required')
    }
    if (target_content === '') return fail('target_content must be a non-empty string.')
    return guard(async () => {
      // Was: fs_read(maxBytes 5MB) -> replace in memory -> fs_write. On a file
      // larger than the cap that wrote the TRUNCATED text back and deleted the
      // remainder of the user's file. It goes through the fs_edit handler now,
      // which never materialises the whole file in the renderer, preserves the
      // encoding and line endings, and writes atomically.
      const r = await invoke('fs_edit', {
        path,
        oldString: target_content,
        newString: replacement_content,
        replaceAll: !!allow_multiple,
        startLine: start_line || 0,
        endLine: end_line || 0,
      })
      const replaced = typeof r === 'number' ? r : (r?.replaced ?? 0)
      return ok({
        tool: 'fs_replace_content',
        path,
        replaced: replaced > 0,
        replacements: replaced,
        hash: r?.hash,
        message: `Successfully modified ${path} (${replaced} replacement${replaced === 1 ? '' : 's'})`,
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
              start_line: { type: 'integer', description: 'Optional 1-based start line.' },
              end_line: { type: 'integer', description: 'Optional 1-based end line.' },
            },
            required: ['target', 'replacement'],
          },
          description: 'Array of { target, replacement, start_line, end_line } replacement chunks.',
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
      // The description promised "a single atomic transaction" while doing
      // fs_read(5MB cap) -> replace -> fs_write, which on a larger file wrote
      // back the truncated head. fs_multi_edit applies every chunk in the main
      // process and writes ONCE, or fails having touched nothing.
      const r = await invoke('fs_multi_edit', {
        path,
        edits: chunks.map(c => ({
          oldString: c.target,
          newString: c.replacement,
          startLine: c.start_line || 0,
          endLine: c.end_line || 0,
        })),
      })
      const appliedCount = r?.edits?.length ?? 0
      return ok({
        tool: 'fs_multi_replace',
        path,
        appliedChunks: appliedCount,
        replacements: r?.replaced ?? appliedCount,
        hash: r?.hash,
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
      // Reading up to 5MB of a file to report its size was absurd, and it
      // reported CHARACTERS as bytes. One stat() answers the metadata; the
      // text-only counts come from a read that is honest about truncation.
      const st = await invoke('fs_stat', { path })
      const ext = path.includes('.') ? path.split('.').pop().toLowerCase() : ''
      if (st.is_dir) {
        return ok({ tool: 'fs_file_info', path, is_dir: true, bytes: st.size, mtimeMs: st.mtimeMs, mode: st.mode })
      }
      const res = await invoke('fs_read', { path, maxBytes: 2000000 })
      const text = typeof res === 'string' ? res : (res?.content || '')
      return ok({
        tool: 'fs_file_info',
        path,
        extension: ext,
        bytes: st.size,
        mtimeMs: st.mtimeMs,
        mode: st.mode,
        readonly: st.readonly,
        binary: res?.binary || false,
        encoding: res?.encoding,
        eol: res?.eol,
        linesCount: res?.lines ?? text.split('\n').length,
        wordsCount: res?.truncated ? undefined : text.split(/\s+/).filter(Boolean).length,
        truncated: res?.truncated || false,
        isEmpty: st.size === 0,
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
      // A throw part-way through used to escape the loop, so `guard` returned a
      // bare failure and the caller had no idea WHICH files had already been
      // written — the worst possible answer for a half-applied batch. Every
      // file is now reported individually, and the batch reports itself as
      // partial rather than as a success or a total failure.
      const written = []
      const failed = []
      for (const f of files) {
        if (!f?.path) { failed.push({ path: null, error: 'entry has no path' }); continue }
        try {
          const r = await invoke('fs_write', { path: f.path, content: f.content ?? '' })
          written.push({
            path: f.path,
            bytes: (r && typeof r === 'object' ? r.bytes : null) ?? (f.content ?? '').length,
            hash: r?.hash,
          })
        } catch (e) {
          failed.push({ path: f.path, error: e?.message || String(e) })
        }
      }
      return {
        success: failed.length === 0,
        tool: 'fs_batch_write',
        count: written.length,
        written,
        failed,
        partial: failed.length > 0 && written.length > 0,
        error: failed.length
          ? `${failed.length} of ${files.length} file${files.length === 1 ? '' : 's'} could not be written: `
            + failed.map(f => `${f.path} (${f.error})`).join('; ')
          : undefined,
      }
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

