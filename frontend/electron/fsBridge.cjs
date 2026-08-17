// Scoped local-filesystem bridge for the Electron main process.
// Path containment and the granted-root registry live in roots.cjs / rootsCore.cjs;
// this file is only the file OPERATIONS. Every handler takes ctx so the folders
// it may touch are the ones bound to that chat.

const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { resolvePath, rootPathsFor } = require('./roots.cjs')
const { shouldSkipDir, looksBinary, parseGitignore, makeIgnoreMatcher } = require('./searchFilter.cjs')
const { createJournal } = require('./journalCore.cjs')

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
}

/** Cap a single file's size for text search — 2 MB of one line is not source. */
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024

function gitignoreMatcherFor(root) {
  try {
    const text = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    return makeIgnoreMatcher(parseGitignore(text))
  } catch { return () => false }
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + esc + '$', 'i')
}

function walk(dir, out, opts, depth) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    // `prune` skips heavy directories entirely (search); plain listing keeps
    // showing them, because the user explicitly asked what is in a folder.
    if (opts.prune && e.isDirectory() && shouldSkipDir(e.name)) continue
    if (opts.prune && opts.ignores && opts.root) {
      const rel = path.relative(opts.root, full)
      if (rel && opts.ignores(rel)) continue
    }
    out.push({ dirent: e, full })
    if (opts.recursive && e.isDirectory() && depth < 40 && out.length < 20000) {
      walk(full, out, opts, depth + 1)
    }
    if (out.length >= 20000) return
  }
}

/** Register all fs_* IPC handlers. Roots IPC must be registered first. */
function registerFsBridge() {
  ipcMain.handle('fs_list', (_e, { ctx, path: rel = '', recursive = false }) => {
    const dir = resolvePath(ctx, rel || '.')
    const collected = []
    walk(dir, collected, { recursive }, 0)
    return collected.slice(0, 5000).map(({ dirent, full }) => {
      let size = 0
      try { size = fs.statSync(full).size } catch { /* ignore */ }
      return { name: dirent.name, path: full, is_dir: dirent.isDirectory(), size }
    })
  })

  ipcMain.handle('fs_read', async (_e, { ctx, path: rel, maxBytes = 500000 }) => {
    const file = resolvePath(ctx, rel)
    const buf = await fs.promises.readFile(file)
    return buf.slice(0, Math.min(maxBytes, buf.length)).toString('utf8')
  })

  ipcMain.handle('fs_write', async (_e, { ctx, path: rel, content }) => {
    const file = resolvePath(ctx, rel)
    snapshot(ctx, 'fs_write', file)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, content ?? '', 'utf8')
    return null
  })

  ipcMain.handle('fs_edit', async (_e, { ctx, path: rel, oldString, newString, replaceAll }) => {
    const file = resolvePath(ctx, rel)
    const text = await fs.promises.readFile(file, 'utf8')
    const count = text.split(oldString).length - 1
    if (count === 0) throw new Error('old_string not found')
    if (count > 1 && !replaceAll) {
      throw new Error(`old_string is not unique (${count} matches); set replace_all or add more context`)
    }
    const updated = replaceAll
      ? text.split(oldString).join(newString ?? '')
      : text.replace(oldString, newString ?? '')
    snapshot(ctx, 'fs_edit', file)
    await fs.promises.writeFile(file, updated, 'utf8')
    return replaceAll ? count : 1
  })

  // Searches EVERY folder bound to this chat, not just the primary.
  ipcMain.handle('fs_search', async (_e, { ctx, query, glob = '', regex = false, maxResults = 100 }) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) throw new Error('no folder granted')
    const nameRe = glob.trim() ? globToRegExp(glob.trim()) : null
    const re = regex ? new RegExp(query) : null
    const out = []
    for (const root of roots) {
      const all = []
      // Prune .git/node_modules/dist and anything .gitignore excludes BEFORE
      // touching the disk — this is what keeps search from reading a whole
      // dependency tree.
      walk(root, all, { recursive: true, prune: true, root, ignores: gitignoreMatcherFor(root) }, 0)
      for (const { dirent, full } of all) {
        if (!dirent.isFile()) continue
        if (nameRe && !nameRe.test(dirent.name)) continue

        let stat
        try { stat = fs.statSync(full) } catch { continue }
        if (stat.size > MAX_SEARCH_FILE_BYTES) continue

        let buf
        try { buf = await fs.promises.readFile(full) } catch { continue }
        if (looksBinary(buf)) continue

        const lines = buf.toString('utf8').split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const hit = re ? re.test(lines[i]) : lines[i].includes(query)
          if (hit) {
            out.push({ path: full, line: i + 1, text: lines[i].slice(0, 400) })
            if (out.length >= maxResults) return out
          }
        }
      }
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
    return null
  })

  ipcMain.handle('journal_list', (_e, { ctx } = {}) =>
    (journal?.list(ctx?.conversationId) || []).slice(0, 200))

  ipcMain.handle('journal_revert', (_e, { id } = {}) =>
    journal ? journal.revert(id) : { success: false, error: 'Journalling is not enabled.' })


  // ── Ported from the single-root bridge, now ctx-scoped ──────────────────────
  // Both resolve every path through resolvePath(ctx, …), so they are confined to
  // the calling chat's folders exactly like the rest of the bridge.

  ipcMain.handle('fs_batch_read', async (_e, { ctx, paths = [], maxBytesPerFile = 250000 }) => {
    if (!Array.isArray(paths)) throw new Error('paths must be an array')
    return Promise.all(paths.map(async (rel) => {
      try {
        const file = resolvePath(ctx, rel)
        const buf = await fs.promises.readFile(file)
        return {
          path: rel,
          success: true,
          size: buf.length,
          content: buf.slice(0, Math.min(maxBytesPerFile, buf.length)).toString('utf8'),
        }
      } catch (e) {
        return { path: rel, success: false, error: e?.message || String(e) }
      }
    }))
  })

  ipcMain.handle('fs_file_tree', (_e, { ctx, path: rel = '', maxDepth = 3, includeIgnored = false }) => {
    const dir = resolvePath(ctx, rel || '.')
    const collected = []
    // Prune heavy directories unless explicitly asked not to — the same rule
    // that keeps fs_search from reading a whole dependency tree.
    walk(dir, collected, { recursive: true, prune: !includeIgnored }, 0)

    const lines = []
    for (const { dirent, full } of collected.slice(0, 2000)) {
      const parts = path.relative(dir, full).split(path.sep)
      if (parts.length > maxDepth) continue
      const indent = '  '.repeat(parts.length - 1)
      const prefix = indent ? indent + '└── ' : ''
      lines.push(`${prefix}${parts[parts.length - 1]}${dirent.isDirectory() ? '/' : ''}`)
    }
    return lines.join('\n')
  })

  ipcMain.handle('fs_move', async (_e, { ctx, src, dest }) => {
    const srcPath = resolvePath(ctx, src)
    const destPath = resolvePath(ctx, dest)
    snapshot(ctx, 'fs_move', srcPath)
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    await fs.promises.rename(srcPath, destPath)
    return null
  })
}

module.exports = { registerFsBridge, initJournal }
