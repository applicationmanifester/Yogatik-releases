// Preload bridge. Exposes the same window.__TAURI__.core.invoke shape the Tauri
// shell uses, so the renderer's tools/localFs.js (isDesktop() + invoke) works
// identically under Electron with zero frontend changes.

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const FS_COMMANDS = new Set([
  'fs_grant', 'fs_granted_root', 'fs_clear_grant',
  'fs_list', 'fs_read', 'fs_write', 'fs_edit', 'fs_search', 'fs_find_files',
  'fs_delete', 'fs_mkdir', 'fs_move', 'fs_batch_read', 'fs_file_tree',
  // A handler that is not named here is rejected as "Unknown command" — which
  // is exactly how fs_find_files shipped with a tool, five aliases and no way
  // to reach it. Every new fs_* handler must be added on this line.
  'fs_multi_edit', 'fs_stat', 'fs_copy', 'fs_codebase_map',
  'roots_add', 'roots_list', 'roots_remove', 'roots_set_primary', 'roots_rebind', 'roots_unbind',
  'journal_list', 'journal_revert', 'journal_diff',
  'proc_start', 'proc_output', 'proc_stop', 'proc_list',
  'hooks_run', 'hooks_list', 'hooks_trust', 'hooks_trusted',
  'git_run', 'git_status', 'git_log', 'git_diff', 'git_write', 'git_show_untracked',
  // A handler not named here is rejected as "Unknown command" — that is how
  // fs_find_files shipped dead. Every new git_* handler goes in this list.
  'git_file_history', 'git_show_file',
  'watch_start', 'watch_stop', 'watch_changes',
  'mcp_stdio_start', 'mcp_stdio_call', 'mcp_stdio_stop', 'mcp_stdio_list',
])

function invoke(cmd, args) {
  if (!FS_COMMANDS.has(cmd)) return Promise.reject(new Error(`Unknown command: ${cmd}`))
  return ipcRenderer.invoke(cmd, args ?? {})
}

contextBridge.exposeInMainWorld('__TAURI__', { core: { invoke } })
// Marker so the renderer can tell it's the Electron build if it ever needs to.
contextBridge.exposeInMainWorld('__YOGATIK_ELECTRON__', true)

// Desktop native system controls (Always on top, Explorer reveal, system hardware specs)
contextBridge.exposeInMainWorld('__YOGATIK_DESKTOP__', {
  isAlwaysOnTop: () => ipcRenderer.invoke('desktop:isAlwaysOnTop'),
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('desktop:toggleAlwaysOnTop', flag),
  getSystemInfo: () => ipcRenderer.invoke('desktop:getSystemInfo'),
  showItemInFolder: (fullPath) => ipcRenderer.invoke('desktop:showItemInFolder', fullPath),
  openPath: (fullPath) => ipcRenderer.invoke('desktop:openPath', fullPath),
  openExternal: (url) => ipcRenderer.invoke('desktop:openExternal', url),
  loginWithGoogle: () => ipcRenderer.invoke('auth:google-desktop'),
  evalJs: (code, timeoutMs) => ipcRenderer.invoke('desktop:eval-js', { code, timeoutMs }),
})

// Desktop AI Companion & Screen-Watcher bridge
contextBridge.exposeInMainWorld('__YOGATIK_COMPANION__', {
  captureScreen: () => ipcRenderer.invoke('desktop:captureScreen'),
  getActiveWindow: () => ipcRenderer.invoke('desktop:getActiveWindow'),
  setCompanionMode: (enable) => ipcRenderer.invoke('desktop:setCompanionMode', enable),
  executeAction: (action) => ipcRenderer.invoke('desktop:executeAction', action),
  onToggleHotkey: (cb) => {
    const handler = () => { try { cb() } catch { /* ignore */ } }
    ipcRenderer.on('toggle-companion-hotkey', handler)
    return () => ipcRenderer.removeListener('toggle-companion-hotkey', handler)
  },
  onModeChanged: (cb) => {
    const handler = (_e, active) => { try { cb(active) } catch { /* ignore */ } }
    ipcRenderer.on('companion-mode-changed', handler)
    return () => ipcRenderer.removeListener('companion-mode-changed', handler)
  },
})

// Precise cross-app input for the companion (mouse click/move/scroll, keys).
contextBridge.exposeInMainWorld('__YOGATIK_COMPANION_INPUT__', {
  move: (x, y) => ipcRenderer.invoke('companion:move', { x, y }),
  click: (opts) => ipcRenderer.invoke('companion:click', opts || {}),
  scroll: (amount) => ipcRenderer.invoke('companion:scroll', { amount }),
  key: (combo) => ipcRenderer.invoke('companion:key', combo),
})

// Local search sidecar bridge
contextBridge.exposeInMainWorld('__YOGATIK_SEARCH__', {
  search: (query, options) => ipcRenderer.invoke('local-search', query, options),
})

// Terminal execution bridge for local shell commands.
//
// ONE TIMELINE PER CHAT, written by the agent AND the human. `exec` is the
// agent's path (terminal_run); `run` is the drawer's. Both produce blocks on
// the same stream, which is what makes the model's shell watchable.
contextBridge.exposeInMainWorld('__YOGATIK_TERMINAL__', {
  exec: (command, options) => ipcRenderer.invoke('terminal:exec', { command, ...options }),

  session: (ctx) => ipcRenderer.invoke('terminal:session', { ctx }),
  run: (p) => ipcRenderer.invoke('terminal:run', p || {}),
  stop: (id) => ipcRenderer.invoke('terminal:stop', { id }),
  clear: (ctx) => ipcRenderer.invoke('terminal:clear', { ctx }),

  // Tier 2 — only meaningful when node-pty is installed. `session()` reports
  // ptyAvailable so the UI can say which tier it is on rather than offering an
  // interactive prompt that silently swallows every keystroke.
  attach: (p) => ipcRenderer.invoke('terminal:attach', p || {}),
  ptyWrite: (p) => ipcRenderer.invoke('terminal:pty-write', p || {}),
  ptyResize: (p) => ipcRenderer.invoke('terminal:pty-resize', p || {}),
  ptyKill: (p) => ipcRenderer.invoke('terminal:pty-kill', p || {}),

  /** A block started, or finished. Carries the whole serialized block. */
  onBlock: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('terminal:block', handler)
    return () => ipcRenderer.removeListener('terminal:block', handler)
  },
  /** Coalesced output for a running block: { chatId, blockId, chunk }. */
  onOutput: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('terminal:output', handler)
    return () => ipcRenderer.removeListener('terminal:output', handler)
  },
  onPtyData: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('terminal:pty-data', handler)
    return () => ipcRenderer.removeListener('terminal:pty-data', handler)
  },
  onPtyExit: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('terminal:pty-exit', handler)
    return () => ipcRenderer.removeListener('terminal:pty-exit', handler)
  },
})

// Native-menu actions (New Chat / Settings / Grant Folder / update-ready / palette / arena) → renderer.
contextBridge.exposeInMainWorld('__YOGATIK_LINKS__', {
  /** Tell main the renderer can receive links; returns one that arrived first. */
  ready: () => ipcRenderer.invoke('deeplink:ready'),
  /** Subscribe to yogatik:// links that arrive while the app is running. */
  on(cb) {
    const handler = (_e, link) => { try { cb(link) } catch { /* ignore */ } }
    ipcRenderer.on('deep-link', handler)
    return () => ipcRenderer.removeListener('deep-link', handler)
  },
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    add: (path) => ipcRenderer.invoke('recent:add', { path }),
    clear: () => ipcRenderer.invoke('recent:clear'),
  },
})

contextBridge.exposeInMainWorld('__YOGATIK_MENU__', {
  on(cb) {
    const handler = (_e, action) => { try { cb(action) } catch { /* ignore */ } }
    ipcRenderer.on('menu', handler)
    return () => ipcRenderer.removeListener('menu', handler)
  },
})

// Fire a native OS notification. Accepts either the legacy (title, body) form or
// a single rich-options object { title, body, actions, hasReply, silent }.
contextBridge.exposeInMainWorld('__YOGATIK_NOTIFY__', (titleOrOpts, body) =>
  ipcRenderer.invoke('notify',
    typeof titleOrOpts === 'object' && titleOrOpts !== null
      ? titleOrOpts
      : { title: titleOrOpts, body }))

// Listen for rich-notification actions (button click / inline reply).
contextBridge.exposeInMainWorld('__YOGATIK_NOTIFY_ACTIONS__', {
  on(cb) {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('notification-action', handler)
    return () => ipcRenderer.removeListener('notification-action', handler)
  },
})

// OS-encrypted key vault (safeStorage). db.js wraps apikey_* settings through this.
contextBridge.exposeInMainWorld('__YOGATIK_KEYCHAIN__', {
  available: () => ipcRenderer.invoke('keychain:available'),
  encrypt: (plain) => ipcRenderer.invoke('keychain:encrypt', plain),
  decrypt: (value) => ipcRenderer.invoke('keychain:decrypt', value),
})

// Clipboard read + rolling history (browser can't read history or off-focus).
contextBridge.exposeInMainWorld('__YOGATIK_CLIPBOARD__', {
  read: () => ipcRenderer.invoke('clipboard:read'),
  write: (text) => ipcRenderer.invoke('clipboard:write', text),
  history: (limit) => ipcRenderer.invoke('clipboard:history', limit),
  clear: () => ipcRenderer.invoke('clipboard:clear'),
  onChange: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('clipboard-changed', handler)
    return () => ipcRenderer.removeListener('clipboard-changed', handler)
  },
  // Ctrl+Alt+C sends the copied selection to the renderer as a ready prompt.
  onSelectionHotkey: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('clipboard-selection-hotkey', handler)
    return () => ipcRenderer.removeListener('clipboard-selection-hotkey', handler)
  },
})

// File-system watcher (scoped to the granted folder).
contextBridge.exposeInMainWorld('__YOGATIK_WATCHER__', {
  start: (path, options) => ipcRenderer.invoke('watcher:start', { path, ...(options || {}) }),
  stop: (id) => ipcRenderer.invoke('watcher:stop', id),
  stopAll: () => ipcRenderer.invoke('watcher:stopAll'),
  list: () => ipcRenderer.invoke('watcher:list'),
  onChange: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('fs-changed', handler)
    return () => ipcRenderer.removeListener('fs-changed', handler)
  },
})

// Power / idle monitor.
contextBridge.exposeInMainWorld('__YOGATIK_POWER__', {
  getState: () => ipcRenderer.invoke('power:get-state'),
  onEvent: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('power-event', handler)
    return () => ipcRenderer.removeListener('power-event', handler)
  },
})

// Native file dialogs (real OS paths).
contextBridge.exposeInMainWorld('__YOGATIK_DIALOG__', {
  openFile: (opts) => ipcRenderer.invoke('dialog:open-file', opts || {}),
  openFiles: (opts) => ipcRenderer.invoke('dialog:open-files', opts || {}),
  saveFile: (opts) => ipcRenderer.invoke('dialog:save-file', opts || {}),
  pickFolder: (opts) => ipcRenderer.invoke('dialog:pick-folder', opts || {}),
  readPicked: (path) => ipcRenderer.invoke('dialog:read-picked', path),
})

// Real browser the agent can drive and the user can watch. Web builds have no
// equivalent — cross-origin iframes are refused and opaque.
contextBridge.exposeInMainWorld('__YOGATIK_BROWSER__', {
  navigate: (p) => ipcRenderer.invoke('browser:navigate', p || {}),
  read: (p) => ipcRenderer.invoke('browser:read', p || {}),
  click: (p) => ipcRenderer.invoke('browser:click', p || {}),
  type: (p) => ipcRenderer.invoke('browser:type', p || {}),
  key: (p) => ipcRenderer.invoke('browser:key', p || {}),
  scroll: (p) => ipcRenderer.invoke('browser:scroll', p || {}),
  screenshot: (p) => ipcRenderer.invoke('browser:screenshot', p || {}),
  newTab: (p) => ipcRenderer.invoke('browser:new-tab', p || {}),
  listTabs: (p) => ipcRenderer.invoke('browser:list-tabs', p || {}),
  selectTab: (p) => ipcRenderer.invoke('browser:select-tab', p || {}),
  closeTab: (p) => ipcRenderer.invoke('browser:close-tab', p || {}),
  history: (p) => ipcRenderer.invoke('browser:history', p || {}),
  reload: (p) => ipcRenderer.invoke('browser:reload', p || {}),
  hover: (p) => ipcRenderer.invoke('browser:hover', p || {}),
  pdf: (p) => ipcRenderer.invoke('browser:pdf', p || {}),
  // A <select> has no input-event path: the native dropdown is an OS popup that
  // sendInputEvent cannot reach, so typing at one did nothing while reporting
  // success. Every form with a country/quantity/date dropdown was unfillable.
  select: (p) => ipcRenderer.invoke('browser:select', p || {}),
  // Real file inputs, real request logging — via Electron's own CDP bridge
  // (webContents.debugger), not a second bundled browser engine.
  upload: (p) => ipcRenderer.invoke('browser:upload', p || {}),
  network: (p) => ipcRenderer.invoke('browser:network', p || {}),
  cookies: (p) => ipcRenderer.invoke('browser:cookies', p || {}),
  storage: (p) => ipcRenderer.invoke('browser:storage', p || {}),
  // These three were advertised by the tool schema and had NO bridge method,
  // so `evaluate` and `extract_text` answered "not supported by this browser
  // bridge version" and `wait_for` silently degraded to matching a CSS
  // selector against the accessibility tree.
  evaluate: (p) => ipcRenderer.invoke('browser:evaluate', p || {}),
  getPageHtml: (p) => ipcRenderer.invoke('browser:get-html', p || {}),
  waitFor: (p) => ipcRenderer.invoke('browser:wait-for', p || {}),
  // The page's OWN console + a one-call "is this page working" report. The
  // model was inventing `window.__errors` because neither existed.
  consoleLogs: (p) => ipcRenderer.invoke('browser:console', p || {}),
  diagnose: (p) => ipcRenderer.invoke('browser:diagnose', p || {}),
  assert: (p) => ipcRenderer.invoke('browser:assert', p || {}),
  auditA11y: (p) => ipcRenderer.invoke('browser:audit-a11y', p || {}),
  setMode: (p) => ipcRenderer.invoke('browser:set-mode', p || {}),
  setBounds: (p) => ipcRenderer.invoke('browser:set-bounds', p || {}),
  setDetached: (p) => ipcRenderer.invoke('browser:set-detached', p || {}),
  close: (p) => ipcRenderer.invoke('browser:close', p || {}),
  // Panel-mode chrome (the React toolbar, not a dedicated window) has no
  // equivalent of window mode's executeJavaScript push, so it gets a real
  // IPC event instead — getNavState seeds it on mount, onNavState keeps it
  // live. Same shape as __YOGATIK_MENU__'s on(cb)/unsubscribe pattern.
  getNavState: (p) => ipcRenderer.invoke('browser:get-nav-state', p || {}),
  onNavState: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('browser:nav-state', handler)
    return () => ipcRenderer.removeListener('browser:nav-state', handler)
  },
  zoom: (p) => ipcRenderer.invoke('browser:zoom', p || {}),
  find: (p) => ipcRenderer.invoke('browser:find', p || {}),
  findStop: (p) => ipcRenderer.invoke('browser:find-stop', p || {}),
  // Ctrl/Cmd+F pressed INSIDE a page never reaches the panel (a WebContentsView
  // is its own top-level browsing context) — main intercepts it and pushes
  // this event so the panel opens ITS find bar instead of the shortcut doing
  // nothing.
  onOpenFind: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('browser:open-find', handler)
    return () => ipcRenderer.removeListener('browser:open-find', handler)
  },
  downloads: (p) => ipcRenderer.invoke('browser:downloads', p || {}),
  cancelDownload: (p) => ipcRenderer.invoke('browser:cancel-download', p || {}),
  openDownload: (p) => ipcRenderer.invoke('browser:open-download', p || {}),
  showDownload: (p) => ipcRenderer.invoke('browser:show-download', p || {}),
  onDownload: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    return () => ipcRenderer.removeListener('browser:download', handler)
  },
  takeWheel: (p) => ipcRenderer.invoke('browser:take-wheel', p || {}),
  releaseWheel: (p) => ipcRenderer.invoke('browser:release-wheel', p || {}),
})

// The floating companion window (always-on-top mini assistant).
contextBridge.exposeInMainWorld('__YOGATIK_COMPANION_WIN__', {
  toggle: () => ipcRenderer.invoke('companion:toggle'),
  show: () => ipcRenderer.invoke('companion:show'),
  hide: () => ipcRenderer.invoke('companion:hide'),
  close: () => ipcRenderer.invoke('companion:close'),
  resize: (p) => ipcRenderer.invoke('companion:resize', p || {}),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('companion:set-always-on-top', { on }),
  // Ctrl+Alt+C relays the foreground selection HERE when the companion is the
  // window on screen, so acting on a selection never means going back to the app.
  onSelection: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('clipboard-selection-hotkey', handler)
    return () => ipcRenderer.removeListener('clipboard-selection-hotkey', handler)
  },
})

// Process manager (list + guarded kill).
contextBridge.exposeInMainWorld('__YOGATIK_PROCESS__', {
  list: (opts) => ipcRenderer.invoke('process:list', opts || {}),
  kill: (pid) => ipcRenderer.invoke('process:kill', pid),
})

// NOTE: the old __YOGATIK_PTY__ bridge (pty:available/spawn/write/resize/kill)
// was removed here 2026-08-25 when the interactive PTY moved into
// terminalSession.cjs as "tier 2" — main.cjs no longer registers those pty:*
// handlers (see electron/pty.cjs, kept only as a retired stub). A bridge
// whose handlers do not exist answers every call with "No handler
// registered", so it must not be re-added; use __YOGATIK_TERMINAL__'s
// ptyWrite/ptyResize/ptyKill (terminal:pty-*) instead.

// Local (stdio) MCP servers — spawn & talk to local MCP servers the browser
// can't reach. mcp.js routes transport:'stdio' entries through this.
contextBridge.exposeInMainWorld('__YOGATIK_MCP_STDIO__', {
  start: (opts) => ipcRenderer.invoke('mcp-stdio:start', opts || {}),
  rpc: (id, method, params) => ipcRenderer.invoke('mcp-stdio:rpc', { id, method, params }),
  notify: (id, method, params) => ipcRenderer.invoke('mcp-stdio:notify', { id, method, params }),
  stop: (id) => ipcRenderer.invoke('mcp-stdio:stop', id),
})

// Licence / entitlement. These four are FREE in the capability matrix on
// purpose: buying is not a paid feature, and a locked app that cannot reach its
// own upgrade screen is a dead end.
contextBridge.exposeInMainWorld('__YOGATIK_ENTITLEMENT__', {
  get: () => ipcRenderer.invoke('entitlement:get'),
  refresh: (opts) => ipcRenderer.invoke('entitlement:refresh', opts || {}),
  checkout: (url) => ipcRenderer.invoke('entitlement:checkout', { url }),
  signOut: () => ipcRenderer.invoke('entitlement:sign-out'),
  onChange: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
    ipcRenderer.on('entitlement-changed', handler)
    return () => ipcRenderer.removeListener('entitlement-changed', handler)
  },
})

// Real OS path for a File dropped onto the window (web gives only opaque blobs).
contextBridge.exposeInMainWorld('__YOGATIK_DND__', {
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return null }
  },
})

// Zero-touch Ollama daemon manager.
// The main process handles spawn / pull / progress — the renderer just calls these.
contextBridge.exposeInMainWorld('__YOGATIK_OLLAMA__', {
  /** { installed, running, models: [{name,size,modified}], bin } */
  status: () => ipcRenderer.invoke('ollama:status'),
  /** Start the daemon if not running. Returns { ok, already, error? } */
  start: () => ipcRenderer.invoke('ollama:start'),
  /** [{name,size,modified}] — models already pulled to disk */
  list: () => ipcRenderer.invoke('ollama:list'),
  /** Pull a model. Progress comes via onPullProgress. Returns { ok } */
  pull: (model) => ipcRenderer.invoke('ollama:pull', { model }),
  /** Cancel an in-progress pull */
  cancel: (model) => ipcRenderer.invoke('ollama:cancel', { model }),
  /** Subscribe to pull progress: { model, status, percent } */
  onPullProgress: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch {} }
    ipcRenderer.on('ollama:pull-progress', handler)
    return () => ipcRenderer.removeListener('ollama:pull-progress', handler)
  },
})

// Zero-touch ComfyUI manager — local image/video generation. The main process
// handles detect/spawn/submit/poll/fetch; the renderer only sees bytes.
contextBridge.exposeInMainWorld('__YOGATIK_COMFY__', {
  /** { installed, running, root, port, checkpoints, svdCheckpoints, samplers, schedulers } */
  status: () => ipcRenderer.invoke('comfy:status'),
  /** Point Yogatik at an existing ComfyUI install folder. { ok, status? , error? } */
  setRoot: (root) => ipcRenderer.invoke('comfy:set-root', { root }),
  /** Start the managed server if a root is configured and nothing is running. */
  start: () => ipcRenderer.invoke('comfy:start'),
  /** txt2img. Returns { success, bytes (base64), mime, filename, seed, width, height } */
  generateImage: (args) => ipcRenderer.invoke('comfy:generate-image', args || {}),
  /** img2vid (Stable Video Diffusion). Returns { success, bytes (base64 WEBP), mime, filename, seed, fps, frames } */
  generateVideo: (args) => ipcRenderer.invoke('comfy:generate-video', args || {}),
  /** Best-effort interrupt of whatever ComfyUI is currently running. */
  cancel: () => ipcRenderer.invoke('comfy:cancel'),
  onProgress: (cb) => {
    const handler = (_e, payload) => { try { cb(payload) } catch {} }
    ipcRenderer.on('comfy:progress', handler)
    return () => ipcRenderer.removeListener('comfy:progress', handler)
  },
})

// Cast Yogatik's own generated media to a UPnP/DLNA TV on the LAN. No
// external app and no ffmpeg — see castCore.cjs for why neither is needed.
contextBridge.exposeInMainWorld('__YOGATIK_CAST__', {
  /** Sends one SSDP search and waits ~2.5s. { success, devices: [{id,friendlyName,modelName,canVolume}] } */
  discover: (args) => ipcRenderer.invoke('cast:discover', args || {}),
  /** Devices already found by the last discover — no new network round-trip. */
  listDevices: () => ipcRenderer.invoke('cast:list-devices'),
  /** { deviceId, bytesBase64? | filePath?, filename, mime?, title? } → { success, device, url } */
  cast: (args) => ipcRenderer.invoke('cast:cast', args || {}),
  pause: (args) => ipcRenderer.invoke('cast:pause', args || {}),
  resume: (args) => ipcRenderer.invoke('cast:resume', args || {}),
  stop: (args) => ipcRenderer.invoke('cast:stop', args || {}),
  setVolume: (args) => ipcRenderer.invoke('cast:set-volume', args || {}),
  status: (args) => ipcRenderer.invoke('cast:status', args || {}),
})

// Scheduler/Cron Daemon bridge
contextBridge.exposeInMainWorld('__YOGATIK_SCHEDULER__', {
  // Job management
  getJobs: () => ipcRenderer.invoke('scheduler:get-jobs'),
  createJob: (jobData) => ipcRenderer.invoke('scheduler:create-job', jobData),
  updateJob: (id, updates) => ipcRenderer.invoke('scheduler:update-job', { id, updates }),
  deleteJob: (id) => ipcRenderer.invoke('scheduler:delete-job', id),
  toggleJob: (id) => ipcRenderer.invoke('scheduler:toggle-job', id),
  runJobNow: (id) => ipcRenderer.invoke('scheduler:run-now', id),
  parseSchedule: (natural) => ipcRenderer.invoke('scheduler:parse-schedule', natural),
  getJobLogs: (id) => ipcRenderer.invoke('scheduler:get-job-logs', id),
  
  // Listen for job execution requests from main process
  onExecuteJob: (cb) => {
    const handler = (_e, data) => { try { cb(data) } catch { /* ignore */ } }
    ipcRenderer.on('scheduler:execute-job', handler)
    return () => ipcRenderer.removeListener('scheduler:execute-job', handler)
  },
  
  // Send job result back to main
  sendJobResult: (channel, result) => ipcRenderer.send(channel, result),
})

// Sub-Agent Runner bridge
contextBridge.exposeInMainWorld('__YOGATIK_SUBAGENT__', {
  spawn: (agentId, config) => ipcRenderer.invoke('subagent:spawn', { agentId, config }),
  execute: (agentId, task, options) => ipcRenderer.invoke('subagent:execute', { agentId, task, options }),
  status: (agentId) => ipcRenderer.invoke('subagent:status', agentId),
  list: () => ipcRenderer.invoke('subagent:list'),
  kill: (agentId) => ipcRenderer.invoke('subagent:kill', agentId),
  
  // Python RPC
  python: {
    execute: (agentId, code, files) => ipcRenderer.invoke('subagent:python:execute', { agentId, code, files }),
    install: (agentId, packages) => ipcRenderer.invoke('subagent:python:install', { agentId, packages }),
    reset: (agentId) => ipcRenderer.invoke('subagent:python:reset', agentId),
    namespace: (agentId) => ipcRenderer.invoke('subagent:python:namespace', agentId),
  }
})

// Desktop Native BitTorrent Engine bridge
contextBridge.exposeInMainWorld('__YOGATIK_TORRENT__', {
  add: (opts) => ipcRenderer.invoke('torrent:add', opts),
  list: () => ipcRenderer.invoke('torrent:list'),
  pause: (opts) => ipcRenderer.invoke('torrent:pause', opts),
  resume: (opts) => ipcRenderer.invoke('torrent:resume', opts),
  remove: (opts) => ipcRenderer.invoke('torrent:remove', opts),
  openFolder: (opts) => ipcRenderer.invoke('torrent:openFolder', opts),
  getDefaultPath: () => ipcRenderer.invoke('torrent:getDefaultPath'),
  onUpdate: (cb) => {
    const handler = (_e, data) => { try { cb(data) } catch { /* ignore */ } }
    ipcRenderer.on('torrent:update', handler)
    return () => ipcRenderer.removeListener('torrent:update', handler)
  }
})

