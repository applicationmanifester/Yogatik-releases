// Scoped local-filesystem bridge for the Electron main process.
// Exactly ONE granted root; every path resolves against it and anything that
// escapes (.., absolute, symlink detour) is refused. Command names/signatures
// match the Tauri shell so tools/localFs.js works over either backend unchanged.

const { app, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

let grantedRoot = null
let getWindow = () => null

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
    // target doesn't exist yet (e.g. fs_write) — the string check above stands.
  }
  return target
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
    out.push({ dirent: e, full })
    if (opts.recursive && e.isDirectory() && depth < 40 && out.length < 20000) {
      walk(full, out, opts, depth + 1)
    }
    if (out.length >= 20000) return
  }
}

/** Register all fs_* IPC handlers. `opts.getWindow` returns the dialog parent. */
function registerFsBridge(opts = {}) {
  if (opts.getWindow) getWindow = opts.getWindow

  ipcMain.handle('fs_grant', async () => {
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    grantedRoot = res.filePaths[0]
    persistGrant(grantedRoot)
    return grantedRoot
  })

  ipcMain.handle('fs_granted_root', () => grantedRoot)

  ipcMain.handle('fs_clear_grant', () => {
    grantedRoot = null
    try { fs.unlinkSync(grantStore()) } catch { /* none */ }
    return null
  })

  ipcMain.handle('fs_list', (_e, { path: rel = '', recursive = false }) => {
    const dir = resolveInRoot(rel || '.')
    const collected = []
    walk(dir, collected, { recursive }, 0)
    return collected.slice(0, 5000).map(({ dirent, full }) => {
      let size = 0
      try { size = fs.statSync(full).size } catch { /* ignore */ }
      return {
        name: dirent.name,
        path: path.relative(grantedRoot, full).split(path.sep).join('/'),
        is_dir: dirent.isDirectory(),
        size,
      }
    })
  })

  ipcMain.handle('fs_read', async (_e, { path: rel, maxBytes = 500000 }) => {
    const file = resolveInRoot(rel)
    const buf = await fs.promises.readFile(file)
    return buf.slice(0, Math.min(maxBytes, buf.length)).toString('utf8')
  })

  ipcMain.handle('fs_write', async (_e, { path: rel, content }) => {
    const file = resolveInRoot(rel)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, content ?? '', 'utf8')
    return null
  })

  ipcMain.handle('fs_edit', async (_e, { path: rel, oldString, newString, replaceAll }) => {
    const file = resolveInRoot(rel)
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

  ipcMain.handle('fs_search', async (_e, { query, glob = '', regex = false, maxResults = 100 }) => {
    if (!grantedRoot) throw new Error('no folder granted')
    const nameRe = glob.trim() ? globToRegExp(glob.trim()) : null
    const re = regex ? new RegExp(query) : null
    const all = []
    walk(grantedRoot, all, { recursive: true }, 0)
    const out = []
    for (const { dirent, full } of all) {
      if (!dirent.isFile()) continue
      if (nameRe && !nameRe.test(dirent.name)) continue
      let text
      try { text = await fs.promises.readFile(full, 'utf8') } catch { continue }
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const hit = re ? re.test(lines[i]) : lines[i].includes(query)
        if (hit) {
          out.push({ path: path.relative(grantedRoot, full).split(path.sep).join('/'), line: i + 1, text: lines[i].slice(0, 400) })
          if (out.length >= maxResults) return out
        }
      }
    }
    return out
  })

  // ── New: delete / mkdir / move ──────────────────────────────────────────────

  ipcMain.handle('fs_delete', async (_e, { path: rel, recursive = false }) => {
    const target = resolveInRoot(rel)
    if (target === path.resolve(grantedRoot)) {
      throw new Error('Deleting the root of the granted folder is not allowed.')
    }
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
    await fs.promises.mkdir(target, { recursive: true })
    return null
  })

  ipcMain.handle('fs_move', async (_e, { src, dest }) => {
    const srcPath = resolveInRoot(src)
    const destPath = resolveInRoot(dest)
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    await fs.promises.rename(srcPath, destPath)
    return null
  })
}

module.exports = { registerFsBridge, loadGrant, getGrantedRoot }

