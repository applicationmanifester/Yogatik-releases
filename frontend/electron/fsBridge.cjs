// Scoped local-filesystem bridge for the Electron main process.
// Path containment and the granted-root registry live in roots.cjs / rootsCore.cjs;
// this file is only the file OPERATIONS. Every handler takes ctx so the folders
// it may touch are the ones bound to that chat.

const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { Worker } = require('worker_threads')
const { resolvePath, rootPathsFor } = require('./roots.cjs')
// looksBinary now lives with the scan, in searchWorker.cjs.
const { createJournal } = require('./journalCore.cjs')
const {
  readFileSmart, writeFileAtomic, existingMode, applyEdit,
  decodeBuffer, encodeText, detectEol, applyEol, hashContent,
} = require('./fsCore.cjs')
const { getIndex, scanRoot, invalidate } = require('./fsIndex.cjs')
const { globToRegExp } = require('./safeRegex.cjs')

let journal = null
/** main.cjs supplies the store path (userData); absent = journalling disabled. */
function initJournal(storeDir) {
  try { journal = createJournal({ storeDir }) } catch { journal = null }
  return journal
}
/** Snapshot before a mutation. Never throws — journalling must not block an
 *  operation the user already approved. */
function snapshot(ctx, op, target) {
  try { journal?.record({ chatId: ctx?.conversationId, op, target }) } catch { /* best effort */ }
  // Every mutation goes through here, so this is the one place that has to
  // remember the cached file index is now stale. Missing it would mean a file
  // the app just created is invisible to its own next fs_find_files.
  try { invalidate() } catch { /* cache only */ }
}

/** Cap a single file's size for text search — 2 MB of one line is not source. */
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024

/** A search that has not finished by now is not going to be useful. */
const SEARCH_TIMEOUT_MS = 15_000

/**
 * Run the content scan on a worker thread and hold it to a deadline.
 *
 * terminate() is the only mechanism that actually stops a runaway regex — no
 * signal, flag or timer inside the thread will be observed while the engine is
 * backtracking. That is the entire reason this is not just a loop here.
 */
function runSearchWorker(workerData) {
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(path.join(__dirname, 'searchWorker.cjs'), { workerData })
    } catch (e) {
      // No worker (a packaging problem, say) must not mean no search. A literal
      // scan on this thread is bounded and safe; only the regex path is not.
      resolve({ ok: false, reason: e?.message, results: [], unavailable: true })
      return
    }

    const timer = setTimeout(() => {
      worker.terminate()
      resolve({ ok: false, timedOut: true, results: [] })
    }, SEARCH_TIMEOUT_MS)

    worker.once('message', (msg) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(msg || { ok: false, results: [] })
    })
    worker.once('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: e?.message, results: [] })
    })
    worker.once('exit', () => clearTimeout(timer))
  })
}

/** Register all fs_* IPC handlers. Roots IPC must be registered first. */
function registerFsBridge() {
  ipcMain.handle('fs_list', async (_e, { ctx, path: rel = '', recursive = false, includeIgnored = true }) => {
    const dir = resolvePath(ctx, rel || '.')
    // A plain listing shows everything by default — the user asked what is in
    // a folder, and hiding node_modules from that answer is a lie. Search and
    // find prune; list does not, unless asked.
    const { entries } = await scanRoot(dir, {
      maxDepth: recursive ? 40 : 0,
      includeIgnored,
      withStats: true,
    })
    return entries.slice(0, 5000).map((e) => ({
      name: e.name, path: e.path, is_dir: e.isDir, size: e.size ?? 0, mtimeMs: e.mtimeMs ?? 0,
    }))
  })

  // Returns an OBJECT, not a bare string. The old handler sliced at maxBytes
  // and returned the fragment with nothing to mark it — the model could not
  // tell a whole file from its first 500KB, and rewrote files from the half it
  // had seen. `offset`/`limit` are the supported way to page through a big one.
  ipcMain.handle('fs_read', async (_e, { ctx, path: rel, maxBytes = 500000, offset = 0, limit = 0 }) => {
    const file = resolvePath(ctx, rel)
    const res = await readFileSmart(file, { maxBytes, offset, limit })
    return { path: file, ...res }
  })

  ipcMain.handle('fs_write', async (_e, { ctx, path: rel, content, expectedHash = null, keepEol = true }) => {
    const file = resolvePath(ctx, rel)

    // What is on disk RIGHT NOW, which is not necessarily what the model read.
    let prior = null
    try {
      const buf = await fs.promises.readFile(file)
      prior = { buf, ...decodeBuffer(buf), hash: hashContent(buf) }
    } catch { /* new file */ }

    // Warn-but-proceed on a lost update. Proceeding is only defensible because
    // the journal below snapshots the CURRENT bytes first, so whatever the
    // other program wrote is recoverable with fs_undo rather than gone.
    const stale = !!(expectedHash && prior && prior.hash !== expectedHash)

    // A model emits '\n' whatever it was handed. Writing that into a CRLF file
    // rewrites every line and turns a one-line change into a whole-file diff.
    let text = String(content ?? '')
    if (keepEol && prior && !prior.binary) {
      const eol = detectEol(prior.text)
      if (eol) text = applyEol(text, eol)
    }
    const bytes = prior && !prior.binary
      ? encodeText(text, { encoding: prior.encoding, bom: prior.bom })
      : Buffer.from(text, 'utf8')

    if (prior?.readOnly) {
      throw new Error('This file is UTF-16BE, which cannot be written back without changing its encoding.')
    }

    snapshot(ctx, 'fs_write', file)
    await writeFileAtomic(file, bytes, { mode: await existingMode(file) })
    return {
      path: file, bytes: bytes.length, stale,
      hash: hashContent(bytes),
      encoding: prior?.encoding || 'utf8',
      warning: stale
        ? 'This file changed on disk after it was read — your write was applied on top. The previous content was journalled; fs_undo restores it.'
        : null,
    }
  })

  ipcMain.handle('fs_edit', async (_e, { ctx, path: rel, oldString, newString, replaceAll, expectedHash = null, startLine = 0, start_line = 0, endLine = 0, end_line = 0 }) => {
    const file = resolvePath(ctx, rel)
    const buf = await fs.promises.readFile(file)
    const { text, encoding, bom, binary, readOnly } = decodeBuffer(buf)
    if (binary) throw new Error('Refusing to edit a binary file as text.')
    if (readOnly) throw new Error('This file is UTF-16BE, which cannot be written back without changing its encoding.')

    const stale = !!(expectedHash && hashContent(buf) !== expectedHash)
    const eol = detectEol(text)

    // Match against LF-normalised text so an anchor copied from a previous
    // read still matches in a CRLF file, then put the file's own endings back.
    const { text: updatedLf, replaced } = applyEdit(
      require('./fsCore.cjs').toLf(text), oldString, newString, replaceAll,
      { startLine: startLine || start_line || 0, endLine: endLine || end_line || 0 },
    )
    const updated = applyEol(updatedLf, eol)

    snapshot(ctx, 'fs_edit', file)
    const bytes = encodeText(updated, { encoding, bom })
    await writeFileAtomic(file, bytes, { mode: await existingMode(file) })
    return {
      path: file, replaced, stale, hash: hashContent(bytes),
      warning: stale
        ? 'This file changed on disk after it was read — the edit was applied on top. The previous content was journalled; fs_undo restores it.'
        : null,
    }
  })

  /**
   * Several edits to ONE file, applied all-or-nothing.
   *
   * Running fs_edit N times leaves the file in a half-edited state the moment
   * edit K+1 fails to match — and it has already been written K times, so every
   * intermediate state hit the disk and a watcher, a dev server and git all saw
   * it. Here every edit is applied in memory and the file is written once.
   */
  ipcMain.handle('fs_multi_edit', async (_e, { ctx, path: rel, edits = [], expectedHash = null }) => {
    if (!Array.isArray(edits) || !edits.length) throw new Error('edits must be a non-empty array')
    const file = resolvePath(ctx, rel)
    const buf = await fs.promises.readFile(file)
    const { text, encoding, bom, binary } = decodeBuffer(buf)
    if (binary) throw new Error('Refusing to edit a binary file as text.')

    const stale = !!(expectedHash && hashContent(buf) !== expectedHash)
    const eol = detectEol(text)
    const { toLf } = require('./fsCore.cjs')

    let working = toLf(text)
    const applied = []
    for (let i = 0; i < edits.length; i++) {
      const { oldString, old_string, newString, new_string, replaceAll, replace_all, startLine, start_line, endLine, end_line } = edits[i] || {}
      try {
        const r = applyEdit(
          working,
          oldString ?? old_string,
          newString ?? new_string,
          replaceAll ?? replace_all ?? false,
          { startLine: startLine || start_line || 0, endLine: endLine || end_line || 0 },
        )
        working = r.text
        applied.push({ index: i, replaced: r.replaced })
      } catch (e) {
        // Nothing has touched the disk yet, so the file is exactly as it was.
        throw new Error(`Edit ${i + 1} of ${edits.length} failed: ${e.message}. No changes were written.`)
      }
    }

    snapshot(ctx, 'fs_multi_edit', file)
    const bytes = encodeText(applyEol(working, eol), { encoding, bom })
    await writeFileAtomic(file, bytes, { mode: await existingMode(file) })
    return { path: file, edits: applied, replaced: applied.reduce((n, a) => n + a.replaced, 0), stale, hash: hashContent(bytes) }
  })

  ipcMain.handle('fs_stat', async (_e, { ctx, path: rel }) => {
    const target = resolvePath(ctx, rel || '.')
    const st = await fs.promises.stat(target)
    return {
      path: target,
      is_dir: st.isDirectory(),
      size: st.size,
      mtimeMs: st.mtimeMs,
      ctimeMs: st.ctimeMs,
      mode: st.mode & 0o777,
      readonly: !(st.mode & 0o200),
    }
  })

  ipcMain.handle('fs_copy', async (_e, { ctx, src, dest, overwrite = false }) => {
    const from = resolvePath(ctx, src)
    const to = resolvePath(ctx, dest)
    const exists = await fs.promises.stat(to).then(() => true).catch(() => false)
    if (exists && !overwrite) {
      throw new Error(`${dest} already exists. Pass overwrite:true to replace it.`)
    }
    if (exists) snapshot(ctx, 'fs_copy', to)
    await fs.promises.mkdir(path.dirname(to), { recursive: true })
    const st = await fs.promises.stat(from)
    if (st.isDirectory()) await fs.promises.cp(from, to, { recursive: true, force: true })
    else await fs.promises.copyFile(from, to)
    return { src: from, dest: to, replaced: exists }
  })

  // Searches EVERY folder bound to this chat, not just the primary.
  ipcMain.handle('fs_search', async (_e, { ctx, query, glob = '', regex = false, maxResults = 100 }) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) throw new Error('no folder granted')
    const nameRe = glob.trim() ? globToRegExp(glob.trim()) : null

    // The candidate list comes from the cached index — .git/node_modules/dist
    // and everything any nested .gitignore excludes are already gone, so search
    // never reads a dependency tree, and a second search pays nothing to walk.
    const { entries } = await getIndex(roots, { includeIgnored: false })
    const files = []
    for (const e of entries) {
      if (e.isDir) continue
      if (nameRe && !nameRe.test(e.name)) continue
      try {
        if ((await fs.promises.stat(e.path)).size > MAX_SEARCH_FILE_BYTES) continue
      } catch { continue }
      files.push(e.path)
    }

    // The scan runs on a WORKER, and the reason is not speed.
    //
    // `new RegExp(query)` compiles a pattern the MODEL wrote. Measured
    // 2026-08-24: `(a+)+$` against 40 characters does not return, and a
    // setTimeout scheduled beforehand never fires — the regex engine holds the
    // thread through backtracking. On the main process that is the whole
    // desktop app frozen with no dialog, no cancel and nothing to click, until
    // it is killed from Task Manager. A runaway pattern cannot be interrupted
    // from inside; it can only be TERMINATED from outside, which is what a
    // worker makes possible.
    const result = await runSearchWorker({
      files, query, useRegex: !!regex, maxResults,
    })

    if (result.rejected) {
      // The pattern was refused before it ran. Falling back to a literal search
      // is almost always what the user meant, and returning "no results" for a
      // pattern that was never executed would be a lie.
      const literal = await runSearchWorker({ files, query, useRegex: false, maxResults })
      return {
        results: literal.results || [],
        pattern_rejected: true,
        note: result.reason,
      }
    }
    if (result.timedOut) {
      throw new Error(
        `The search was stopped after ${SEARCH_TIMEOUT_MS / 1000}s. The pattern is too expensive `
        + 'for this codebase — narrow it with a glob, or search for a literal string.',
      )
    }
    return result.results || []
  })

  // Path discovery by NAME — no file contents are read. The renderer's
  // fs_find_files tool called this and fell back to a full recursive fs_list
  // when it did not exist, which listed directories as files and walked
  // node_modules. It is the highest-scored tool for "find files"/"glob"/
  // "where is", so it needs a real implementation.
  ipcMain.handle('fs_find_files', async (_e, { ctx, pattern = '*', extension, maxDepth = 10, limit = 100, includeIgnored = false }) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) throw new Error('no folder granted')
    const pat = String(pattern || '*').trim()
    const ext = extension ? String(extension).toLowerCase().replace(/^\./, '') : ''
    // A pattern with a slash is matched against the path relative to the root;
    // otherwise against the basename, which is what "find package.json" means.
    const matchesPath = pat.includes('/')
    const re = pat && pat !== '*' ? globToRegExp(matchesPath ? pat : pat) : null
    // `Number(x) || 10` swallows a deliberate 0 — depth 0 means "this folder
    // only" and must survive.
    const requested = Number(maxDepth)
    const depth = Math.max(0, Math.min(40, Number.isFinite(requested) ? requested : 10))
    const cap = Math.max(1, Math.min(2000, Number(limit) || 100))
    const out = []

    // Served from the cached async index: the second question about a
    // repository costs a filter over an array rather than another full walk,
    // and the walk itself no longer blocks the window.
    const { entries } = await getIndex(roots, { maxDepth: depth, includeIgnored })
    for (const e of entries) {
      if (e.isDir) continue
      if (ext && !e.name.toLowerCase().endsWith(`.${ext}`)) continue
      if (re) {
        const subject = matchesPath ? e.rel : e.name
        // Fall back to a substring match so a bare word ("config") still finds
        // things — a glob-only match would return nothing for the common case.
        if (!re.test(subject) && !subject.toLowerCase().includes(pat.toLowerCase())) continue
      }
      out.push(e.path)
      if (out.length >= cap) return out
    }
    return out
  })

  ipcMain.handle('fs_delete', async (_e, { ctx, path: rel, recursive = false }) => {
    const target = resolvePath(ctx, rel)
    if (rootPathsFor(ctx).some(r => path.resolve(r) === target)) {
      throw new Error('Deleting the root of a granted folder is not allowed.')
    }
    let stat
    try { stat = await fs.promises.stat(target) }
    catch (e) {
      if (e.code === 'ENOENT') throw new Error(`File not found: ${rel}`)
      throw e
    }
    snapshot(ctx, 'fs_delete', target)
    if (stat.isDirectory()) {
      if (recursive) await fs.promises.rm(target, { recursive: true, force: true })
      else await fs.promises.rmdir(target)
    } else {
      await fs.promises.unlink(target)
    }
    return null
  })

  ipcMain.handle('fs_mkdir', async (_e, { ctx, path: rel }) => {
    await fs.promises.mkdir(resolvePath(ctx, rel), { recursive: true })
    invalidate()
    return null
  })

  ipcMain.handle('journal_list', (_e, { ctx } = {}) =>
    (journal?.list(ctx?.conversationId) || []).slice(0, 200))

  ipcMain.handle('journal_revert', (_e, { id } = {}) =>
    journal ? journal.revert(id) : { success: false, error: 'Journalling is not enabled.' })

  // Before/after text for one journalled mutation. The blob lives in userData,
  // outside every granted root, so this is the ONLY way the renderer can see
  // what the agent overwrote — fs_read cannot and must not reach it.
  ipcMain.handle('journal_diff', (_e, { id } = {}) =>
    journal ? journal.diff(id) : { success: false, error: 'Journalling is not enabled.' })


  // ── Ported from the single-root bridge, now ctx-scoped ──────────────────────
  // Both resolve every path through resolvePath(ctx, …), so they are confined to
  // the calling chat's folders exactly like the rest of the bridge.

  ipcMain.handle('fs_batch_read', async (_e, { ctx, paths = [], maxBytesPerFile = 250000 }) => {
    if (!Array.isArray(paths)) throw new Error('paths must be an array')
    // Promise.all over the whole list opened every file at once: a few hundred
    // paths is an EMFILE on Windows and a stalled main process everywhere else.
    // A rolling window keeps the descriptor count bounded and is no slower —
    // the disk was never going to serve 500 reads in parallel anyway.
    const LIMIT = 16
    const out = new Array(paths.length)
    let next = 0
    const worker = async () => {
      while (next < paths.length) {
        const i = next++
        const rel = paths[i]
        try {
          const file = resolvePath(ctx, rel)
          const res = await readFileSmart(file, { maxBytes: maxBytesPerFile })
          out[i] = { path: rel, success: true, size: res.bytes, truncated: res.truncated, binary: res.binary, content: res.content, note: res.note || null }
        } catch (e) {
          out[i] = { path: rel, success: false, error: e?.message || String(e) }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LIMIT, paths.length) }, worker))
    return out
  })

  ipcMain.handle('fs_file_tree', async (_e, { ctx, path: rel = '', maxDepth = 3, includeIgnored = false }) => {
    const dir = resolvePath(ctx, rel || '.')
    // maxDepth is applied to the WALK, not to the output. The old handler
    // collected 2000 entries first and filtered by depth afterwards, so one
    // deep directory ate the whole budget and shallow siblings never appeared
    // in a tree that claimed to be complete.
    const depth = Math.max(0, Math.min(12, Number(maxDepth) || 3))
    const { entries, partial } = await scanRoot(dir, { maxDepth: depth - 1, includeIgnored })

    const sorted = entries
      .slice(0, 4000)
      .sort((a, b) => a.rel.localeCompare(b.rel))

    // A real tree: a node's connector depends on whether it is the last child
    // of its parent, and every ancestor that still has siblings below it needs
    // a continuation bar. Printing "└── " for everything made a flat list that
    // merely looked like a tree.
    const childCount = new Map()
    const seen = new Map()
    for (const e of sorted) {
      const parent = e.rel.includes('/') ? e.rel.slice(0, e.rel.lastIndexOf('/')) : ''
      childCount.set(parent, (childCount.get(parent) || 0) + 1)
    }

    const lines = []
    const lastAtDepth = []
    for (const e of sorted) {
      const parts = e.rel.split('/')
      const level = parts.length - 1
      const parent = level ? parts.slice(0, -1).join('/') : ''
      const idx = (seen.get(parent) || 0) + 1
      seen.set(parent, idx)
      const isLast = idx === childCount.get(parent)
      lastAtDepth[level] = isLast

      let prefix = ''
      for (let d = 0; d < level; d++) prefix += lastAtDepth[d] ? '    ' : '│   '
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${e.name}${e.isDir ? '/' : ''}`)
    }
    if (partial) lines.push('… (tree truncated)')
    return lines.join('\n')
  })

  ipcMain.handle('fs_move', async (_e, { ctx, src, dest, overwrite = false }) => {
    const srcPath = resolvePath(ctx, src)
    const destPath = resolvePath(ctx, dest)

    // MEASURED: moving s.txt onto an existing d.txt destroyed d.txt without a
    // word, and the journal had snapshotted the SOURCE — the side that
    // survived — so the destroyed file was unrecoverable. The destination is
    // the side that needs protecting.
    const destExists = await fs.promises.stat(destPath).then(() => true).catch(() => false)
    if (destExists && !overwrite) {
      throw new Error(`${dest} already exists. Pass overwrite:true to replace it (the current contents are journalled first).`)
    }
    if (destExists) snapshot(ctx, 'fs_move', destPath)
    snapshot(ctx, 'fs_move', srcPath)

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    try {
      await fs.promises.rename(srcPath, destPath)
    } catch (e) {
      // rename() cannot cross a filesystem. On Windows that is any C: → D:
      // move, and on Linux any move onto a mounted volume; copy-then-delete is
      // the only way across, and doing it in that order means a failure leaves
      // the original intact.
      if (e.code !== 'EXDEV') throw e
      const st = await fs.promises.stat(srcPath)
      if (st.isDirectory()) await fs.promises.cp(srcPath, destPath, { recursive: true, force: true })
      else await fs.promises.copyFile(srcPath, destPath)
      await fs.promises.rm(srcPath, { recursive: true, force: true })
    }
    return { src: srcPath, dest: destPath, replaced: destExists }
  })
}

module.exports = { registerFsBridge, initJournal, invalidateFsIndex: invalidate }
