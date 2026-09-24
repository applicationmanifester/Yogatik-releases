// Workspace roots: persistence + IPC. All decision logic lives in rootsCore.cjs,
// which imports no electron so it can be unit-tested.

const { app, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const core = require('./rootsCore.cjs')

let state = core.emptyState()
let getWindow = () => null

function storeFile() { return path.join(app.getPath('userData'), 'workspace_roots.json') }
function legacyFile() { return path.join(app.getPath('userData'), 'granted_folder.txt') }

// Documents, not userData: the user should be able to find, open and back up
// what the assistant writes, and it must survive an uninstall. On Windows this
// follows a OneDrive/known-folder redirection, which is what we want.
function defaultWorkspaceDir() { return path.join(app.getPath('documents'), 'Yogatik') }

function save() {
  try { fs.writeFileSync(storeFile(), JSON.stringify(state, null, 2), 'utf8') } catch { /* ignore */ }
}

function load() {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && parsed.roots && parsed.bindings) state = parsed
  } catch { state = core.emptyState() }

  // One-time migration: the old app-wide grant becomes the global default so
  // every existing chat inherits exactly the folder it had before.
  let legacy = null
  try {
    const p = fs.readFileSync(legacyFile(), 'utf8').trim()
    if (p && fs.statSync(p).isDirectory()) legacy = p
  } catch { /* none */ }
  if (legacy) state = core.migrateLegacyGrant(state, legacy)

  const pruned = core.pruneMissing(state)
  state = pruned.state
  state = core.cleanPollutedDefault(state)

  // A fresh install has granted nothing, so the app provides its own folder and
  // binds it as the global default — every chat inherits it and file work works
  // out of the box. Runs after migration (a real grant always wins) and after
  // pruning (so we never create a root prune would drop).
  //
  // mkdir is idempotent: an existing Documents/Yogatik from a previous install
  // is adopted as-is, never emptied. Best effort throughout — if Documents is
  // read-only or redirected somewhere unwritable, state is left untouched and
  // the app behaves exactly as before, with the user granting a folder by hand.
  // Booting must never fail over this.
  if (!state.autoDefaultCreated) {
    try {
      const dir = defaultWorkspaceDir()
      fs.mkdirSync(dir, { recursive: true })
      state = core.ensureDefaultRoot(state, dir)
    } catch { /* unwritable: fall back to a manual grant */ }
  }

  save()
  return state
}

/** Absolute paths bound to this call's chat. Empty array when none. */
function rootPathsFor(ctx) { return core.resolveRootPaths(state, ctx) }

/**
 * Hook trust. A .yogatik/hooks.json arrives INSIDE a repository, so cloning a
 * project must never be enough to run commands. Trust is per-root, explicit,
 * and stored here in userData — never in the repo itself.
 */
function getTrustState() {
  return { trustedHookRoots: Array.isArray(state.trustedHookRoots) ? state.trustedHookRoots : [] }
}

function setHookTrust(rootPath, trusted) {
  const list = new Set(getTrustState().trustedHookRoots)
  if (trusted) list.add(rootPath); else list.delete(rootPath)
  state.trustedHookRoots = [...list]
  save()
  return getTrustState()
}

/** Resolve a tool-supplied path, or throw. The single guard for all fs ops. */
function resolvePath(ctx, target) {
  return core.resolveWithin(rootPathsFor(ctx), target).absolutePath
}

/** Resolve a tool-supplied path returning both absolutePath and the containing rootPath. */
function resolvePathWithRoot(ctx, target) {
  return core.resolveWithin(rootPathsFor(ctx), target)
}

function listFor(ctx) {
  const ids = core.resolveRootIds(state, ctx)
  const key = ctx?.conversationId != null ? `chat:${ctx.conversationId}` : null
  const source = key && Array.isArray(state.bindings[key])
    ? 'chat'
    : (ctx?.projectId != null && Array.isArray(state.bindings[`project:${ctx.projectId}`]) ? 'project' : 'default')
  return ids
    .map((id, i) => {
      const root = state.roots && state.roots[id]
      if (!root) return null
      const label = root.label || (root.path ? path.basename(root.path) : 'Folder')
      return { id, path: root.path, label, primary: i === 0, source }
    })
    .filter(Boolean)
}

function registerRootsIpc(opts = {}) {
  if (opts.getWindow) getWindow = opts.getWindow
  load()

  ipcMain.handle('roots_add', async (_e, { ctx, path: directPath } = {}) => {
    let chosenPath = directPath
    if (!chosenPath) {
      const res = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
      if (res.canceled || !res.filePaths[0]) return null
      chosenPath = res.filePaths[0]
    }
    const out = core.addRoot(state, ctx, chosenPath)
    state = out.state
    save()
    return out.root
  })

  // Prune here as well as at load: a folder can be deleted or a drive unmounted
  // mid-session, and the popover must stop offering a folder that is gone.
  ipcMain.handle('roots_list', (_e, { ctx } = {}) => {
    const pruned = core.pruneMissing(state)
    if (pruned.removed.length) { state = pruned.state; save() }
    return listFor(ctx)
  })

  ipcMain.handle('roots_remove', (_e, { ctx, rootId } = {}) => {
    state = core.removeRoot(state, ctx, rootId)
    save()
    return listFor(ctx)
  })

  ipcMain.handle('roots_set_primary', (_e, { ctx, rootId } = {}) => {
    state = core.setPrimary(state, ctx, rootId)
    save()
    return listFor(ctx)
  })

  ipcMain.handle('hooks_trust', (_e, { ctx, trusted } = {}) => {
    const root = rootPathsFor(ctx)[0]
    if (!root) return { success: false, error: 'No working folder for this chat.' }
    return { success: true, root, ...setHookTrust(root, !!trusted) }
  })

  ipcMain.handle('hooks_trusted', (_e, { ctx } = {}) => {
    const root = rootPathsFor(ctx)[0]
    return { root: root || null, trusted: !!root && getTrustState().trustedHookRoots.includes(root) }
  })

  ipcMain.handle('roots_rebind', (_e, { oldId, newId } = {}) => {
    state = core.rebindChat(state, oldId, newId)
    save()
    return true
  })

  ipcMain.handle('roots_unbind', (_e, { chatId } = {}) => {
    state = core.unbindChat(state, chatId)
    save()
    return true
  })

  // ── Compatibility aliases (one release) so the Tauri shell and any existing
  // caller keep working while src-tauri stays on the single-root model. ──
  ipcMain.handle('fs_grant', async (_e, { ctx } = {}) => {
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    const out = core.addRoot(state, ctx, res.filePaths[0])
    state = out.state
    save()
    return out.root.path
  })
  ipcMain.handle('fs_granted_root', (_e, { ctx } = {}) => rootPathsFor(ctx)[0] || null)
  ipcMain.handle('fs_clear_grant', (_e, { ctx } = {}) => {
    for (const r of listFor(ctx)) state = core.removeRoot(state, ctx, r.id)
    save()
    return null
  })
}

module.exports = { registerRootsIpc, resolvePath, resolvePathWithRoot, rootPathsFor, load, getTrustState, setHookTrust }
