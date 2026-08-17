// Scoped local-filesystem bridge for the Electron main process.
// Exactly ONE granted root; every path resolves against it and anything that
// escapes (.., absolute, symlink detour) is refused. Command names/signatures
// match the Tauri shell so tools/localFs.js works over either backend unchanged.

const { app, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

let grantedRoot = null
let getWindow = () => null

// High-performance ignore filters: skips noisy build/dependency directories
const DEFAULT_IGNORES = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.next', '.nuxt', 'target', 'vendor', '.turbo', '.cache',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', '.DS_Store',
])

// Binary file extensions to skip during text content searches
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svgz', '.pdf',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.exe', '.dll', '.so',
  '.dylib', '.wasm', '.bin', '.dat', '.db', '.sqlite', '.pyc', '.class',
  '.jar', '.node', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4',
  '.mov', '.avi', '.mkv', '.iso', '.map',
])

// Walk cache to avoid redundant disk scans during close-succession tool queries
let walkCache = { key: null, timestamp: 0, entries: null }
function invalidateCache() {
  walkCache = { key: null, timestamp: 0, entries: null }
}

function grantStore() {
  return path.join(app.getPath('userData'), 'granted_folder.txt')
}
function persistGrant(p) {
  try { fs.writeFileSync(grantStore(), p, 'utf8') } catch { /* ignore */ }
}
function loadGrant() {
  try {
    const p = fs.readFileSync(grantStore(), 'utf8').trim()
    if (p && fs.statSync(p).isDirectory()) { grantedRoot = p; return p }
  } catch { /* none */ }
  return null
}
function getGrantedRoot() { return grantedRoot }

function resolveInRoot(rel) {
  if (!grantedRoot) throw new Error('no folder granted')
  if (path.isAbsolute(rel)) throw new Error('absolute paths are not allowed')
  const target = path.resolve(grantedRoot, rel)
  const base = path.resolve(grantedRoot)
  const rootWithSep = base.endsWith(path.sep) ? base : base + path.sep
  if (target !== base && !target.startsWith(rootWithSep)) {
    throw new Error('path escapes the granted folder')
  }
  try {
    const real = fs.realpathSync(target)
    const realBase = fs.realpathSync(base)
    const realRootSep = realBase.endsWith(path.sep) ? realBase : realBase + path.sep
    if (real !== realBase && !real.startsWith(realRootSep)) {
      throw new Error('path escapes the granted folder')
    }
  } catch (e) {
    if (/escapes/.test(e.message)) throw e
    // target doesn't exist yet (e.g. fs_write) — string check above stands.
  }
  return target
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + esc + '$', 'i')
}

function isBinaryFile(filename) {
  const ext = path.extname(filename).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}

/**
 * High-performance asynchronous non-blocking directory walker.
 * Respects default ignore directories, depth bounds, and maximum entry caps.
 */
async function walkAsync(dir, opts = {}, depth = 0, collected = []) {
  if (depth > (opts.maxDepth ?? 30) || collected.length >= (opts.maxEntries ?? 20000)) return collected

  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return collected
  }

  const subdirs = []
  for (const e of entries) {
    const isDir = e.isDirectory()
    if (!opts.includeIgnored && DEFAULT_IGNORES.has(e.name)) continue

    const full = path.join(dir, e.name)
    collected.push({ dirent: e, full, isDir, name: e.name })

    if (opts.recursive && isDir) {
      subdirs.push(full)
    }
    if (collected.length >= (opts.maxEntries ?? 20000)) break
  }

  if (opts.recursive && subdirs.length > 0 && depth < (opts.maxDepth ?? 30)) {
    // Process subdirectories concurrently in batches
    const BATCH_SIZE = 8
    for (let i = 0; i < subdirs.length; i += BATCH_SIZE) {
      const batch = subdirs.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(subdir => walkAsync(subdir, opts, depth + 1, collected)))
      if (collected.length >= (opts.maxEntries ?? 20000)) break
    }
  }

  return collected
}

/**
 * Concurrency limiter for parallel file processing (e.g. parallel searching)
 */
async function mapConcurrent(items, concurrency, fn) {
  const results = []
  let index = 0
  let aborted = false

  async function worker() {
    while (index < items.length && !aborted) {
      const current = index++
      const res = await fn(items[current])
      if (res && res.stop) {
        aborted = true
        if (res.value) results.push(res.value)
        break
      }
      if (res && res.value) results.push(res.value)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/** Register all fs_* IPC handlers. `opts.getWindow` returns the dialog parent. */
function registerFsBridge(opts = {}) {
  if (opts.getWindow) getWindow = opts.getWindow

  ipcMain.handle('fs_grant', async () => {
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    grantedRoot = res.filePaths[0]
    invalidateCache()
    persistGrant(grantedRoot)
    return grantedRoot
  })

  ipcMain.handle('fs_granted_root', () => grantedRoot)

  ipcMain.handle('fs_clear_grant', () => {
    grantedRoot = null
    invalidateCache()
    try { fs.unlinkSync(grantStore()) } catch { /* none */ }
    return null
  })

  ipcMain.handle('fs_list', async (_e, { path: rel = '', recursive = false, includeIgnored = false }) => {
    const dir = resolveInRoot(rel || '.')
    const cacheKey = `${dir}:${recursive}:${includeIgnored}`
    const now = Date.now()

    let collected
    if (walkCache.key === cacheKey && now - walkCache.timestamp < 2000) {
      collected = walkCache.entries
    } else {
      collected = await walkAsync(dir, { recursive, includeIgnored, maxDepth: 20 }, 0, [])
      walkCache = { key: cacheKey, timestamp: now, entries: collected }
    }

    const sliced = collected.slice(0, 5000)
    
    // Concurrently fetch file sizes in batches
    const BATCH_SIZE = 50
    const out = []
    for (let i = 0; i < sliced.length; i += BATCH_SIZE) {
      const chunk = sliced.slice(i, i + BATCH_SIZE)
      const chunkResults = await Promise.all(chunk.map(async ({ dirent, full, isDir, name }) => {
        let size = 0
        if (!isDir) {
          try {
            const stat = await fs.promises.stat(full)
            size = stat.size
          } catch { /* ignore */ }
        }
        return {
          name,
          path: path.relative(grantedRoot, full).split(path.sep).join('/'),
          is_dir: isDir,
          size,
        }
      }))
      out.push(...chunkResults)
    }

    return out
  })

  ipcMain.handle('fs_read', async (_e, { path: rel, maxBytes = 500000, startLine, endLine }) => {
    const file = resolveInRoot(rel)
    
    if (startLine != null || endLine != null) {
      // Line-sliced windowed read (saves RAM and token usage for large files)
      const text = await fs.promises.readFile(file, 'utf8')
      const lines = text.split(/\r?\n/)
      const start = Math.max(1, startLine || 1) - 1
      const end = endLine != null ? Math.min(lines.length, endLine) : lines.length
      const slice = lines.slice(start, end).join('\n')
      return slice.slice(0, maxBytes)
    }

    const buf = await fs.promises.readFile(file)
    return buf.slice(0, Math.min(maxBytes, buf.length)).toString('utf8')
  })

  ipcMain.handle('fs_batch_read', async (_e, { paths = [], maxBytesPerFile = 250000 }) => {
    if (!Array.isArray(paths)) throw new Error('paths must be an array')
    const results = await Promise.all(
      paths.map(async (rel) => {
        try {
          const file = resolveInRoot(rel)
          const buf = await fs.promises.readFile(file)
          const content = buf.slice(0, Math.min(maxBytesPerFile, buf.length)).toString('utf8')
          return { path: rel, success: true, size: buf.length, content }
        } catch (e) {
          return { path: rel, success: false, error: e?.message || String(e) }
        }
      })
    )
    return results
  })

  ipcMain.handle('fs_file_tree', async (_e, { path: rel = '', maxDepth = 3, includeIgnored = false }) => {
    const dir = resolveInRoot(rel || '.')
    const entries = await walkAsync(dir, { recursive: true, maxDepth, includeIgnored, maxEntries: 2000 }, 0, [])
    
    // Build an ASCII tree string
    const treeLines = []
    for (const { full, isDir } of entries) {
      const relPath = path.relative(dir, full).split(path.sep)
      const indent = '  '.repeat(relPath.length - 1)
      const prefix = indent ? indent + '└── ' : ''
      treeLines.push(`${prefix}${relPath[relPath.length - 1]}${isDir ? '/' : ''}`)
    }
    return treeLines.join('\n')
  })

  ipcMain.handle('fs_write', async (_e, { path: rel, content }) => {
    const file = resolveInRoot(rel)
    invalidateCache()
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, content ?? '', 'utf8')
    return null
  })

  ipcMain.handle('fs_edit', async (_e, { path: rel, oldString, newString, replaceAll }) => {
    const file = resolveInRoot(rel)
    invalidateCache()
    const text = await fs.promises.readFile(file, 'utf8')
    const count = text.split(oldString).length - 1
    if (count === 0) throw new Error('old_string not found')
    if (count > 1 && !replaceAll) {
      throw new Error(`old_string is not unique (${count} matches); set replace_all or add more context`)
    }
    const updated = replaceAll
      ? text.split(oldString).join(newString ?? '')
      : text.replace(oldString, newString ?? '')
    await fs.promises.writeFile(file, updated, 'utf8')
    return replaceAll ? count : 1
  })

  ipcMain.handle('fs_search', async (_e, { query, glob = '', regex = false, maxResults = 100, caseSensitive = false }) => {
    if (!grantedRoot) throw new Error('no folder granted')
    const nameRe = glob.trim() ? globToRegExp(glob.trim()) : null
    const re = regex ? new RegExp(query, caseSensitive ? '' : 'i') : null
    const lowerQuery = caseSensitive ? query : query.toLowerCase()

    const all = await walkAsync(grantedRoot, { recursive: true, maxDepth: 25, includeIgnored: false }, 0, [])
    const files = all.filter(e => !e.isDir && (!nameRe || nameRe.test(e.name)) && !isBinaryFile(e.name))

    const matches = []

    // Concurrently scan text files with a 16-worker pool
    await mapConcurrent(files, 16, async ({ full }) => {
      if (matches.length >= maxResults) return { stop: true }
      
      try {
        // Fast buffer check for null bytes (avoid reading huge binary files as utf8)
        const fd = await fs.promises.open(full, 'r')
        const header = Buffer.alloc(512)
        const { bytesRead } = await fd.read(header, 0, 512, 0)
        await fd.close()
        for (let b = 0; b < bytesRead; b++) {
          if (header[b] === 0) return null // Skip binary
        }

        const text = await fs.promises.readFile(full, 'utf8')
        const lines = text.split(/\r?\n/)
        const relPath = path.relative(grantedRoot, full).split(path.sep).join('/')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const hit = re
            ? re.test(line)
            : (caseSensitive ? line.includes(lowerQuery) : line.toLowerCase().includes(lowerQuery))
          
          if (hit) {
            matches.push({
              path: relPath,
              line: i + 1,
              text: line.slice(0, 400),
            })
            if (matches.length >= maxResults) {
              return { stop: true }
            }
          }
        }
      } catch {
        // Unreadable file (locked/permission) -> skip gracefully
      }
      return null
    })

    return matches.slice(0, maxResults)
  })

  // ── delete / mkdir / move ──────────────────────────────────────────────

  ipcMain.handle('fs_delete', async (_e, { path: rel, recursive = false }) => {
    const target = resolveInRoot(rel)
    if (target === path.resolve(grantedRoot)) {
      throw new Error('Deleting the root of the granted folder is not allowed.')
    }
    invalidateCache()
    let stat
    try { stat = await fs.promises.stat(target) }
    catch (e) {
      if (e.code === 'ENOENT') throw new Error(`File not found: ${rel}`)
      throw e
    }
    if (stat.isDirectory()) {
      if (recursive) {
        await fs.promises.rm(target, { recursive: true, force: true })
      } else {
        await fs.promises.rmdir(target)
      }
    } else {
      await fs.promises.unlink(target)
    }
    return null
  })

  ipcMain.handle('fs_mkdir', async (_e, { path: rel }) => {
    const target = resolveInRoot(rel)
    invalidateCache()
    await fs.promises.mkdir(target, { recursive: true })
    return null
  })

  ipcMain.handle('fs_move', async (_e, { src, dest }) => {
    const srcPath = resolveInRoot(src)
    const destPath = resolveInRoot(dest)
    invalidateCache()
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    await fs.promises.rename(srcPath, destPath)
    return null
  })
}

module.exports = { registerFsBridge, loadGrant, getGrantedRoot }
