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
    (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__ || !!window.__YOGATIK_ELECTRON__ || !!window.__YOGATIK_DESKTOP__)
}

export const DESKTOP_ONLY_TOOLS = new Set([
  'fs_add_folder', 'fs_list', 'fs_read', 'fs_write', 'fs_edit', 'fs_replace_content',
  'fs_multi_replace', 'fs_patch', 'code_outline', 'fs_outline', 'fs_smart_read',
  'fs_file_info', 'fs_copy', 'fs_batch_write', 'fs_search', 'fs_find_files',
  'fs_delete', 'fs_mkdir', 'fs_move', 'fs_batch_read', 'fs_file_tree', 'fs_undo', 'fs_git',
  'terminal_run', 'clipboard_access', 'watch_folder', 'system_state', 'process_manager',
  'file_dialog', 'git_status', 'git_log', 'git_diff', 'proc_start', 'proc_output',
  'proc_stop', 'proc_list', 'watch', 'computer_control', 'screen_inspect', 'desktop_action',
  'local_image_generate', 'local_video_generate', 'aider_copilot',
])

// The active chat supplies the context for every call. It is injected here, NOT
// exposed as a tool parameter — the model must never be able to name another
// chat's folders. App.jsx installs a getter that reads from a ref, because
// reading React state directly here would capture a stale closure.
let ctxProvider = () => ({ conversationId: null, projectId: null })
let ambientCtx = null

export function setWorkspaceContext(fn) {
  ctxProvider = typeof fn === 'function' ? fn : () => ({ conversationId: null, projectId: null })
}

// Every tool call currently in flight, by conversationId. A single ambient slot
// CANNOT be correct when two chats overlap: `aborters` and `loadingMap` are both
// keyed by clientId, so two turns genuinely run at once, and a save/restore
// around an `await` leaves the slot holding whichever chat entered LAST. The
// browser has no AsyncLocalStorage to bind a value to an async frame, so the
// only sound answer is an EXPLICIT ctx threaded from executeTool — which every
// tool now does. This set exists to catch the ones that stop doing it.
const inFlight = new Map()   // conversationId -> depth

export async function withWorkspaceContext(ctx, fn) {
  const prev = ambientCtx
  const id = ctx?.conversationId || null
  ambientCtx = ctx || null
  if (id) inFlight.set(id, (inFlight.get(id) || 0) + 1)
  try {
    return await fn()
  } finally {
    ambientCtx = prev
    if (id) {
      const n = (inFlight.get(id) || 1) - 1
      if (n > 0) inFlight.set(id, n); else inFlight.delete(id)
    }
  }
}

/** How many DISTINCT chats have a tool call in flight right now. */
export function concurrentChats() { return inFlight.size }

function workspaceCtx(override) {
  if (override?.conversationId || override?.projectId) return override

  // An ambient read while two different chats are mid-call is provably
  // ambiguous — the slot is whichever entered last, not the caller. Rather than
  // pick one and silently write into the wrong chat's folder, say so. Every
  // caller that could be ambiguous is a tool, and every tool threads its ctx;
  // a hit here means a new one forgot to, which is precisely the drift the
  // grep in workspaceIsolation.test.js is there to stop shipping.
  if (inFlight.size > 1 && typeof console !== 'undefined') {
    console.warn(
      '[workspace] ambient context read while %d chats are running. ' +
      'The result may belong to another conversation — thread opts.ctx through ' +
      'to getWorkspaceCtx(opts?.ctx) at this call site.', inFlight.size,
    )
  }

  if (ambientCtx?.conversationId || ambientCtx?.projectId) return ambientCtx
  try { return ctxProvider() || {} } catch { return {} }
}

export function getWorkspaceCtx(override) { return workspaceCtx(override) }

export async function invoke(cmd, args, ctxOverride) {
  const core = window.__TAURI__?.core
  if (!core?.invoke) throw new Error('Tauri bridge unavailable')
  return core.invoke(cmd, { ...(args || {}), ctx: workspaceCtx(ctxOverride) })
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Local file access runs only in the Yogatik desktop app. Download it from the app’s Platforms page, or grant a folder there first.',
}

export function ok(extra) { return { success: true, ...extra } }
export function fail(e) { return { success: false, error: typeof e === 'string' ? e : (e?.message || String(e)) } }

// A single grant guards every op; surfaces a clear prompt to run fs_grant first.
export async function guard(fn) {
  if (!isDesktop()) return DESKTOP_ONLY
  try { return await fn() }
  catch (e) {
    const msg = e?.message || String(e)
    if (/no folder granted|not granted/i.test(msg)) {
      return { success: false, error: 'No working folder for this chat. Call fs_add_folder so the user can pick one.' }
    }
    if (/ENOENT|no such file or directory/i.test(msg)) {
      const match = msg.match(/stat '([^']+)'|open '([^']+)'|'([^']+)'/i)
      const target = match ? (match[1] || match[2] || match[3]) : ''
      return { success: false, error: target ? `File not found: ${target} (no such file or directory)` : 'File not found (no such file or directory)' }
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
  try {
    const list = await invoke('roots_list')
    return Array.isArray(list) ? list.filter(r => r && (r.path || r.label)) : []
  }
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
/** Unbind a deleted chat so its roots don't leak or linger */
export async function unbindChatRoots(chatId) {
  if (!isDesktop() || chatId == null) return
  try { await invoke('roots_unbind', { chatId: String(chatId) }) } catch { /* ignore */ }
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

/* ── Explorer / Source Control API ──────────────────────────────────────────
 * The workspace UI calls these, NOT the agent tools above. The tools shape
 * their replies for a language model (prose errors, truncation notes, capped
 * result counts); a file tree needs the raw rows and needs to distinguish
 * "empty folder" from "failed to read", which a tool's `{success:false, error}`
 * string cannot express usefully. Same bridge, different contract.
 *
 * Every one of these goes through `invoke`, so the chat's ctx is injected and
 * the renderer never names a filesystem root. That rule is what makes the whole
 * grant model meaningful — see the note on workspaceCtx.
 */

/** Direct children of one directory. Throws on failure; the panel shows it. */
export async function wsList(path = '', { recursive = false, includeIgnored = true } = {}) {
  return invoke('fs_list', { path, recursive, includeIgnored })
}

export async function wsRead(path, opts = {}) {
  return invoke('fs_read', { path, ...opts })
}

export async function wsWrite(path, content, { expectedHash = null } = {}) {
  return invoke('fs_write', { path, content, expectedHash })
}

export async function wsStat(path) { return invoke('fs_stat', { path }) }
export async function wsMkdir(path) { return invoke('fs_mkdir', { path }) }
export async function wsDelete(path, { recursive = false } = {}) {
  return invoke('fs_delete', { path, recursive })
}
export async function wsMove(src, dest, { overwrite = false } = {}) {
  return invoke('fs_move', { src, dest, overwrite })
}

/**
 * Content search. Returns either an array of { path, line, text } or, when the
 * pattern was refused as catastrophically backtracking, an object carrying
 * `pattern_rejected` and the literal-search results — the panel MUST surface
 * that, because silently showing literal results for a regex the user wrote
 * looks like the regex simply did not match.
 */
export async function wsSearch(query, { glob = '', regex = false, maxResults = 200 } = {}) {
  return invoke('fs_search', { query, glob, regex, maxResults })
}

/** Filename/glob discovery — no file contents read. */
export async function wsFindFiles(pattern, { extension = '', maxDepth = 12, limit = 200, includeIgnored = false } = {}) {
  return invoke('fs_find_files', { pattern, extension: extension || undefined, maxDepth, limit, includeIgnored })
}

/** Undo-journal diff for one entry: what the agent overwrote, and with what. */
export async function journalDiff(id) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('journal_diff', { id }) } catch (e) { return fail(e) }
}

/* ── git ─────────────────────────────────────────────────────────────────── */

export async function gitStatus() {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('git_status') } catch (e) { return fail(e) }
}

export async function gitDiff({ staged = false, path = null, rev = null } = {}) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('git_diff', { staged, path, rev }) } catch (e) { return fail(e) }
}

/** History of ONE file, followed through renames. */
export async function gitFileHistory(path, limit = 30) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('git_file_history', { path, limit }) } catch (e) { return fail(e) }
}

/** One file as it was at one commit. */
export async function gitShowFile(rev, path) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('git_show_file', { rev, path }) } catch (e) { return fail(e) }
}

export async function gitLog(limit = 30) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('git_log', { limit }) } catch (e) { return fail(e) }
}

/**
 * Stage / unstage / commit. `op` is a NAME, never git flags — main builds the
 * argument array itself, so nothing here can turn into `reset --hard`.
 */
export async function gitWrite(op, { paths = [], message = '', name = '', amend = false, confirm = false } = {}) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try {
    return await invoke('git_write', { op, paths, message, name, amend, confirm })
  } catch (e) { return fail(e) }
}

/** Operations that require confirm:true. Kept here so the panel can ask BEFORE
 *  firing a call it knows will be refused, rather than round-tripping to learn
 *  what it already knows. */
export const GIT_CONFIRM_OPS = new Set([
  'discard', 'discard_all', 'clean', 'reset_hard', 'stash_drop', 'unstage_hard', 'checkout',
])

/** Untracked files have no git diff; this returns their contents to show as added. */
export async function gitShowUntracked(path) {
  if (!isDesktop()) return { success: false, error: 'Desktop app only.' }
  try { return await invoke('git_show_untracked', { path }) } catch (e) { return fail(e) }
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
  async execute({ path = '', recursive = false, include_ignored = false } = {}, opts = {}) {
    return guard(async () => {
      const entries = await invoke('fs_list', { path, recursive: !!recursive, includeIgnored: !!include_ignored }, opts?.ctx)
      return ok({ tool: 'fs_list', path: path || '.', count: entries.length, entries })
    })
  },
}

import { globalFsCache } from './fsCache'

/**
 * The cache partition for the chat that issued this tool call.
 *
 * Tool paths are usually RELATIVE to the chat's own folders, so the path alone
 * is not a unique key across chats — it is the single most collision-prone key
 * the app could have picked.
 */
function cacheScope(opts) {
  return getWorkspaceCtx(opts?.ctx)?.conversationId || null
}
import { globalWorkspaceTrie } from './workspaceTrie'
import { recordSnapshot } from '../workspaceTimeMachine'

export const fsReadTool = {
  schema: {
    description: 'Read a UTF-8 text file inside this chat’s folders. Supports line-range windowing (start_line/offset, end_line/limit) for reading specific sections of large files with line numbers. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path, or relative to this chat’s primary folder.' },
        max_bytes: { type: 'number', description: 'Optional byte cap (default 5000000).' },
        start_line: { type: 'number', description: 'Optional 1-indexed starting line number (or offset).' },
        offset: { type: 'number', description: 'Optional 1-indexed starting line number (alias for start_line).' },
        end_line: { type: 'number', description: 'Optional 1-indexed ending line number.' },
        limit: { type: 'number', description: 'Optional number of lines to read starting from offset/start_line.' },
      },
      required: ['path'],
    },
  },
  async execute(args = {}, opts = {}) {
    const path = args.path || args.file || args.filepath || args.target || args.target_file || args.TargetFile || args.filename
    if (!path) return fail('path is required (e.g. { path: "src/file.js" })')
    return guard(async () => {
      // Robust offset and line range parameter extraction across all model conventions
      const rawStart = args.start_line ?? args.offset ?? args.line_start ?? args.startLine ?? args.offset_lines ?? args.from_line ?? args.StartLine
      const rawEnd = args.end_line ?? args.endLine ?? args.line_end ?? args.to_line ?? args.EndLine
      const rawLimit = args.limit ?? args.length ?? args.max_lines ?? args.lines ?? args.count ?? args.Limit

      let offset = Number(rawStart) > 0 ? Number(rawStart) : 0
      let limit = 0

      if (rawLimit && Number(rawLimit) > 0) {
        limit = Number(rawLimit)
      } else if (rawEnd && Number(rawEnd) >= offset) {
        limit = offset > 0 ? (Number(rawEnd) - offset + 1) : Number(rawEnd)
      }

      // In-memory cache hit only for complete, unbounded full-file reads (<0.01ms)
      if (!offset && !limit && !args.max_bytes) {
        // Scoped to the CALLING chat: a path-only key served chat A's file to
        // chat B whenever both used the same relative path, reported as a
        // successful cached read.
        const cached = globalFsCache.get(path, null, null, cacheScope(opts))
        if (cached && typeof cached === 'string') {
          return ok({ tool: 'fs_read', path, bytes: cached.length, content: cached, cached: true })
        }
      }

      const res = await invoke('fs_read', {
        path,
        maxBytes: args.max_bytes || 5000000,
        offset,
        limit,
      }, opts?.ctx)
      if (typeof res === 'string') {
        globalFsCache.set(path, res, Date.now(), null, cacheScope(opts))
        return ok({ tool: 'fs_read', path, bytes: res.length, content: res })
      }
      if (res?.content && !offset && !limit && !res.truncated) {
        globalFsCache.set(path, res.content, Date.now(), null, cacheScope(opts))
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
        range: res.range || (offset || limit ? { offset: offset || 1, limit } : undefined),
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
  async execute({ src, dest, overwrite } = {}, opts = {}) {
    if (!src) return fail('src is required')
    if (!dest) return fail('dest is required')
    return guard(async () => {
      const r = await invoke('fs_copy', { src, dest, overwrite: !!overwrite }, opts?.ctx)
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
  async execute({ paths = [], max_bytes_per_file = 250000 } = {}, opts = {}) {
    if (!Array.isArray(paths) || !paths.length) return fail('paths array is required and must not be empty')
    return guard(async () => {
      const files = await invoke('fs_batch_read', { paths, maxBytesPerFile: max_bytes_per_file }, opts?.ctx)
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
  async execute({ path = '', max_depth = 3, include_ignored = false } = {}, opts = {}) {
    return guard(async () => {
      const tree = await invoke('fs_file_tree', {
        path,
        maxDepth: max_depth || 3,
        includeIgnored: !!include_ignored,
      }, opts?.ctx)
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
  async execute(args = {}, opts = {}) {
    const path = args.path || args.file || args.filepath || args.target_file || args.TargetFile || args.filename
    const content = args.content ?? args.text ?? args.code ?? args.data ?? args.body ?? args.file_content ?? args.CodeContent ?? ''
    const expected_hash = args.expected_hash ?? args.hash ?? args.expectedHash
    if (!path) return fail('path is required (e.g. { path: "src/file.js", content: "..." })')
    return guard(async () => {
      // Record Workspace Time Machine snapshot for 1-click rollback
      try {
        const prev = globalFsCache.get(path, null, null, cacheScope(opts)) || (await invoke('fs_read', { path, maxBytes: 250000 }, opts?.ctx).catch(() => null))
        const prevText = typeof prev === 'string' ? prev : prev?.content || ''
        await recordSnapshot({
          filePath: path,
          previousContent: prevText,
          newContent: String(content ?? ''),
          toolName: 'fs_write',
          description: `AI overwritten: ${path}`,
        })
      } catch {}

      const r = await invoke('fs_write', { path, content: String(content ?? ''), expectedHash: expected_hash || null }, opts?.ctx)
      const res = r && typeof r === 'object' ? r : {}
      globalFsCache.set(path, String(content ?? ''), Date.now(), null, cacheScope(opts))
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
  async execute(args = {}, opts = {}) {
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
      }, opts?.ctx)
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
  async execute({ pattern = '', extension = '', max_depth = 10, limit = 100, include_ignored = false } = {}, opts = {}) {
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
        }, opts?.ctx)
      } catch {
        const list = await invoke('fs_list', { recursive: true, maxDepth: max_depth }, opts?.ctx).catch(() => [])
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
  async execute({ query, glob = '', regex = false, max_results = 100, case_sensitive = false, context_lines = 0 } = {}, opts = {}) {
    if (!query) return fail('query is required')
    return guard(async () => {
      const matches = await invoke('fs_search', {
        query,
        glob,
        regex: !!regex,
        maxResults: max_results || 100,
        caseSensitive: !!case_sensitive,
        contextLines: context_lines || 0,
      }, opts?.ctx)
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
  async execute({ path, recursive = false } = {}, opts = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      await invoke('fs_delete', { path, recursive: !!recursive }, opts?.ctx)
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
  async execute({ path } = {}, opts = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      await invoke('fs_mkdir', { path }, opts?.ctx)
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
  async execute({ src, dest } = {}, opts = {}) {
    if (!src || !dest) return fail('src and dest are required')
    return guard(async () => {
      await invoke('fs_move', { src, dest }, opts?.ctx)
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
  async execute({ path, target_content, replacement_content, allow_multiple = false, start_line = 0, end_line = 0 } = {}, opts = {}) {
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
      }, opts?.ctx)
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
  async execute({ path, chunks = [] } = {}, opts = {}) {
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
      }, opts?.ctx)
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
  async execute({ path } = {}, opts = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      // Reading up to 5MB of a file to report its size was absurd, and it
      // reported CHARACTERS as bytes. One stat() answers the metadata; the
      // text-only counts come from a read that is honest about truncation.
      const st = await invoke('fs_stat', { path }, opts?.ctx)
      const ext = path.includes('.') ? path.split('.').pop().toLowerCase() : ''
      if (st.is_dir) {
        return ok({ tool: 'fs_file_info', path, is_dir: true, bytes: st.size, mtimeMs: st.mtimeMs, mode: st.mode })
      }
      const res = await invoke('fs_read', { path, maxBytes: 2000000 }, opts?.ctx)
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
  async execute({ files = [] } = {}, opts = {}) {
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
          const r = await invoke('fs_write', { path: f.path, content: f.content ?? '' }, opts?.ctx)
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

export const fsGitTool = {
  schema: {
    description:
      'Perform Git version control operations on this chat’s primary workspace folder. ' +
      'Supports status, diff, log, stage, unstage, and commit. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'diff', 'log', 'stage', 'unstage', 'commit', 'file_history'],
          description: 'The Git operation to perform.',
        },
        path: { type: 'string', description: 'File path to target for diff or file history.' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to stage or unstage.' },
        message: { type: 'string', description: 'Commit message for action="commit".' },
        staged: { type: 'boolean', description: 'Show staged diffs instead of working tree diffs.' },
        limit: { type: 'number', description: 'Max log entries to return (default 20).' },
      },
      required: ['action'],
    },
  },
  async execute({ action = 'status', path = null, paths = [], message = '', staged = false, limit = 20 } = {}, opts = {}) {
    return guard(async () => {
      const act = String(action || 'status').toLowerCase().trim()
      if (act === 'status') {
        const res = await invoke('git_status', {}, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'status', ...res })
      }
      if (act === 'diff') {
        const res = await invoke('git_diff', { staged, path }, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'diff', staged, path, ...res })
      }
      if (act === 'log') {
        const res = await invoke('git_log', { limit }, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'log', limit, ...res })
      }
      if (act === 'file_history') {
        if (!path) return fail('path is required for file_history')
        const res = await invoke('git_file_history', { path, limit }, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'file_history', path, ...res })
      }
      if (act === 'stage') {
        const targetPaths = Array.isArray(paths) && paths.length > 0 ? paths : (path ? [path] : ['.'])
        const res = await invoke('git_write', { op: 'stage', paths: targetPaths }, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'stage', paths: targetPaths, ...res })
      }
      if (act === 'unstage') {
        const targetPaths = Array.isArray(paths) && paths.length > 0 ? paths : (path ? [path] : ['.'])
        const res = await invoke('git_write', { op: 'unstage', paths: targetPaths }, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'unstage', paths: targetPaths, ...res })
      }
      if (act === 'commit') {
        if (!message) return fail('message is required for commit')
        const res = await invoke('git_write', { op: 'commit', message }, opts?.ctx)
        return ok({ tool: 'fs_git', action: 'commit', message, ...res })
      }
      return fail(`Unknown git action: ${action}. Valid actions: status, diff, log, stage, unstage, commit, file_history`)
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

