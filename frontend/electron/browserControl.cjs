// A real browser the agent can drive, and the user can watch.
//
// The web build cannot do this at all: cross-origin iframes are refused by
// X-Frame-Options on most real sites and are opaque to the parent even when
// allowed. A WebContentsView is a genuine top-level browsing context.
//
// Two surfaces, ONE set of views. Window mode parents the views to a dedicated
// BrowserWindow; panel mode parents the same views to the main window at bounds
// the renderer reports. Switching mode re-parents — it never rebuilds, so tabs,
// history, cookies and refs survive.
//
// Sessions are keyed by conversationId: a logged-in tab must not follow the user
// into an unrelated chat.

const { BrowserWindow, WebContentsView, ipcMain } = require('electron')
const path = require('path')
const {
  buildTree, walkerSource, refResolverSource, parseRef, isStaleRef,
} = require('./browserTree.cjs')

const TAB_BAR_H = 40
const LOAD_TIMEOUT = 30_000

const sessions = new Map() // conversationId -> session
let mainWindowGetter = () => null
let tabSeq = 0

function newTabId() { return `tab-${++tabSeq}` }

function safe(fn, fallback) {
  try { return fn() } catch { return fallback }
}

function getSession(conversationId) {
  return sessions.get(conversationId || '__default__') || null
}

function ensureSession(conversationId, mode) {
  const key = conversationId || '__default__'
  let s = sessions.get(key)
  if (!s) {
    s = {
      key, mode: mode || 'window', win: null,
      tabs: new Map(), activeTabId: null, bounds: null, detached: false,
    }
    sessions.set(key, s)
  } else if (mode && mode !== s.mode) {
    setMode(s, mode)
  }
  return s
}

function activeTab(s) {
  if (!s || !s.activeTabId) return null
  return s.tabs.get(s.activeTabId) || null
}

function tabFor(s, tabId) {
  if (tabId) return s.tabs.get(tabId) || null
  return activeTab(s)
}

function listTabs(s) {
  return [...s.tabs.entries()].map(([tabId, t]) => ({
    tabId,
    url: safe(() => t.view.webContents.getURL(), ''),
    title: safe(() => t.view.webContents.getTitle(), ''),
    active: tabId === s.activeTabId,
  }))
}

// ── Surfaces ──────────────────────────────────────────────────────────────

function createWindowSurface(s) {
  if (s.win && !s.win.isDestroyed()) return s.win
  s.win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    title: 'Yogatik Browser',
    backgroundColor: '#0a0e14',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'browserWindowPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  s.win.loadFile(path.join(__dirname, 'browserWindow.html'))
  s.win.webContents.on('did-finish-load', () => syncTabBar(s))
  s.win.on('resize', () => layout(s))
  // The user closing the browser ends the session; the next call opens a fresh one.
  s.win.on('closed', () => { s.win = null; destroySession(s.key) })
  return s.win
}

function host(s) {
  if (s.mode === 'panel') {
    const mw = mainWindowGetter()
    return (mw && !mw.isDestroyed()) ? mw : null
  }
  return createWindowSurface(s)
}

function layout(s) {
  const t = activeTab(s)
  const h = host(s)
  if (!t || !h || h.isDestroyed()) return
  if (s.mode === 'panel') {
    if (s.detached || !s.bounds) return
    t.view.setBounds(s.bounds)
  } else {
    const [w, hh] = h.getContentSize()
    t.view.setBounds({ x: 0, y: TAB_BAR_H, width: w, height: Math.max(0, hh - TAB_BAR_H) })
  }
}

function showActive(s) {
  const h = host(s)
  if (!h || h.isDestroyed()) return
  for (const [tabId, t] of s.tabs) {
    const attached = h.contentView.children.includes(t.view)
    const shouldShow = tabId === s.activeTabId && !s.detached
    if (shouldShow && !attached) h.contentView.addChildView(t.view)
    if (!shouldShow && attached) h.contentView.removeChildView(t.view)
  }
  layout(s)
  syncTabBar(s)
}

function syncTabBar(s) {
  if (s.mode !== 'window' || !s.win || s.win.isDestroyed()) return
  const payload = JSON.stringify(listTabs(s))
  const active = JSON.stringify(s.activeTabId)
  s.win.webContents
    .executeJavaScript(`window.__setTabs && window.__setTabs(${payload}, ${active})`)
    .catch(() => {})
}

// Re-parent, never rebuild: tabs, cookies and refs survive a mode switch.
function setMode(s, mode) {
  const next = mode === 'panel' ? 'panel' : 'window'
  if (next === s.mode) return s.mode
  const prev = host(s)
  if (prev && !prev.isDestroyed()) {
    for (const t of s.tabs.values()) {
      if (prev.contentView.children.includes(t.view)) prev.contentView.removeChildView(t.view)
    }
  }
  if (s.mode === 'window' && s.win && !s.win.isDestroyed()) {
    const win = s.win
    s.win = null
    win.removeAllListeners('closed') // this is a re-parent, not a session end
    win.destroy()
  }
  s.mode = next
  showActive(s)
  return s.mode
}

// ── Tabs ──────────────────────────────────────────────────────────────────

function createTab(s, url) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const tabId = newTabId()
  const tab = { view, refEpoch: 0 }
  s.tabs.set(tabId, tab)
  s.activeTabId = tabId

  const wc = view.webContents
  // A fresh document invalidates every ref issued against the old one.
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) tab.refEpoch++
  })
  wc.on('page-title-updated', () => syncTabBar(s))
  wc.on('did-finish-load', () => syncTabBar(s))
  // Pop-ups become real tabs instead of vanishing.
  wc.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) {
      const id = createTab(s, target)
      s.activeTabId = id
      showActive(s)
    }
    return { action: 'deny' }
  })
  wc.on('render-process-gone', () => {
    s.tabs.delete(tabId)
    if (s.activeTabId === tabId) s.activeTabId = [...s.tabs.keys()][0] || null
    showActive(s)
  })

  showActive(s)
  if (url) navigate(s, tabId, url)
  return tabId
}

function navigate(s, tabId, url) {
  const t = tabFor(s, tabId)
  if (!t) return Promise.resolve({ success: false, error: 'No such tab' })
  const wc = t.view.webContents
  return new Promise((resolve) => {
    let settled = false
    const done = (payload) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      wc.removeListener('did-finish-load', ok)
      wc.removeListener('did-fail-load', fail)
      resolve(payload)
    }
    const ok = () => done({
      success: true,
      url: safe(() => wc.getURL(), url),
      title: safe(() => wc.getTitle(), ''),
    })
    const fail = (_e, code, desc, failedUrl, isMainFrame) => {
      if (!isMainFrame) return
      // -3 is ERR_ABORTED, which a same-page redirect raises routinely.
      if (code === -3) return
      done({ success: false, error: `${desc} (${code})`, url: failedUrl })
    }
    // Never hang the turn on a page that never settles.
    const timer = setTimeout(() => done({
      success: true,
      timeout: true,
      url: safe(() => wc.getURL(), url),
      title: safe(() => wc.getTitle(), ''),
      note: 'Load did not finish within 30s; reporting what rendered so far.',
    }), LOAD_TIMEOUT)
    wc.on('did-finish-load', ok)
    wc.on('did-fail-load', fail)
    wc.loadURL(url).catch(err => done({ success: false, error: err.message }))
  })
}

function closeTab(s, tabId) {
  const t = s.tabs.get(tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const h = host(s)
  if (h && !h.isDestroyed() && h.contentView.children.includes(t.view)) {
    h.contentView.removeChildView(t.view)
  }
  safe(() => t.view.webContents.close())
  s.tabs.delete(tabId)
  if (s.activeTabId === tabId) s.activeTabId = [...s.tabs.keys()][0] || null
  // Last tab closed: drop the surface, but keep the session so the next call reopens.
  if (!s.tabs.size && s.mode === 'window' && s.win && !s.win.isDestroyed()) {
    const win = s.win
    s.win = null
    win.removeAllListeners('closed')
    win.destroy()
  }
  showActive(s)
  return { success: true, tabs: listTabs(s) }
}

function destroySession(key) {
  const s = sessions.get(key)
  if (!s) return
  for (const [, t] of s.tabs) safe(() => t.view.webContents.close())
  s.tabs.clear()
  if (s.win && !s.win.isDestroyed()) {
    const win = s.win
    s.win = null
    win.removeAllListeners('closed')
    win.destroy()
  }
  sessions.delete(key)
}

function destroyAllSessions() {
  for (const key of [...sessions.keys()]) destroySession(key)
}

// ── Read & interact ───────────────────────────────────────────────────────

async function readPage(s, tabId) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const epoch = ++t.refEpoch
  try {
    const raw = await t.view.webContents.executeJavaScript(walkerSource(epoch), true)
    const tree = buildTree(raw.nodes, { epoch })
    return {
      success: true,
      url: raw.url,
      title: raw.title,
      tree: tree.text,
      truncated: tree.truncated,
      interactive_count: tree.interactiveCount,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// A ref resolves to a point measured NOW. A stale ref is refused outright — it
// must never fall back to a coordinate, because clicking the wrong element looks
// exactly like success.
async function pointFor(t, ref) {
  if (isStaleRef(ref, t.refEpoch)) {
    return { error: 'stale ref — the page changed; call read again', stale: true }
  }
  const { index } = parseRef(ref)
  try {
    const p = await t.view.webContents.executeJavaScript(refResolverSource(index), true)
    if (!p) return { error: 'stale ref — element is gone; call read again', stale: true }
    return p
  } catch (e) {
    return { error: e.message }
  }
}

async function resolveTarget(t, { ref, x, y }) {
  if (ref) return pointFor(t, ref)
  if (typeof x === 'number' && typeof y === 'number') return { x, y }
  return { error: 'Provide either a ref (preferred) or x and y' }
}

async function click(s, { tabId, ref, x, y, button = 'left', double = false } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const pt = await resolveTarget(t, { ref, x, y })
  if (pt.error) return { success: false, error: pt.error, stale: !!pt.stale }
  const wc = t.view.webContents
  const base = { x: pt.x, y: pt.y, button, clickCount: double ? 2 : 1 }
  wc.sendInputEvent({ ...base, type: 'mouseDown' })
  wc.sendInputEvent({ ...base, type: 'mouseUp' })
  return { success: true, clicked: { x: pt.x, y: pt.y }, ref: ref || null }
}

async function typeText(s, { tabId, ref, text, submit = false } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (typeof text !== 'string') return { success: false, error: 'text is required' }
  if (ref) {
    const r = await click(s, { tabId, ref })
    if (!r.success) return r
  }
  const wc = t.view.webContents
  for (const ch of text) {
    wc.sendInputEvent({ type: 'char', keyCode: ch })
  }
  if (submit) wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
  return { success: true, typed: text.length, submitted: !!submit }
}

const KEYMAP = {
  enter: 'Return', return: 'Return', tab: 'Tab', escape: 'Escape', esc: 'Escape',
  backspace: 'Backspace', delete: 'Delete', up: 'Up', down: 'Down', left: 'Left',
  right: 'Right', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
  space: 'Space',
}

async function pressKey(s, { tabId, keys } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (!keys) return { success: false, error: 'keys is required' }
  const parts = String(keys).toLowerCase().split('+').map(p => p.trim()).filter(Boolean)
  const key = parts.pop()
  const modifiers = parts.map(p => ({ ctrl: 'control', cmd: 'meta', command: 'meta' }[p] || p))
  const keyCode = KEYMAP[key] || (key && key.length === 1 ? key : null)
  if (!keyCode) return { success: false, error: `Unsupported key: ${keys}` }
  const wc = t.view.webContents
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return { success: true, keys }
}

async function scroll(s, { tabId, ref, amount = -400 } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  let pt = { x: 400, y: 400 }
  if (ref) {
    const p = await pointFor(t, ref)
    if (p.error) return { success: false, error: p.error, stale: !!p.stale }
    pt = p
  }
  t.view.webContents.sendInputEvent({
    type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: amount, canScroll: true,
  })
  return { success: true, scrolled: amount }
}

async function screenshot(s, tabId) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  try {
    const img = await t.view.webContents.capturePage()
    return { success: true, image: img.toDataURL() }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────

function registerBrowserControl(getMainWindow) {
  mainWindowGetter = typeof getMainWindow === 'function' ? getMainWindow : () => null

  // conversationId is supplied by the renderer as an opaque key, exactly like the
  // workspace-roots ctx. It names a session, never a filesystem path.
  const S = (p, mode) => ensureSession(p && p.conversationId, mode || (p && p.display))

  ipcMain.handle('browser:navigate', async (_e, p = {}) => {
    const s = S(p)
    let tabId = p.tabId
    if (!s.tabs.size) tabId = createTab(s, null)
    const res = await navigate(s, tabId, p.url)
    showActive(s)
    return { ...res, tabId: tabId || s.activeTabId, mode: s.mode }
  })

  ipcMain.handle('browser:read', (_e, p = {}) => readPage(S(p), p.tabId))
  ipcMain.handle('browser:click', (_e, p = {}) => click(S(p), p))
  ipcMain.handle('browser:type', (_e, p = {}) => typeText(S(p), p))
  ipcMain.handle('browser:key', (_e, p = {}) => pressKey(S(p), p))
  ipcMain.handle('browser:scroll', (_e, p = {}) => scroll(S(p), p))
  ipcMain.handle('browser:screenshot', (_e, p = {}) => screenshot(S(p), p.tabId))

  ipcMain.handle('browser:new-tab', async (_e, p = {}) => {
    const s = S(p)
    const tabId = createTab(s, null)
    const res = p.url ? await navigate(s, tabId, p.url) : { success: true }
    showActive(s)
    return { ...res, tabId, tabs: listTabs(s), mode: s.mode }
  })

  ipcMain.handle('browser:list-tabs', (_e, p = {}) => {
    const s = getSession(p.conversationId)
    return { success: true, tabs: s ? listTabs(s) : [], mode: s ? s.mode : null }
  })

  ipcMain.handle('browser:select-tab', (_e, p = {}) => {
    const s = S(p)
    if (!s.tabs.has(p.tabId)) return { success: false, error: 'No such tab' }
    s.activeTabId = p.tabId
    showActive(s)
    return { success: true, tabs: listTabs(s) }
  })

  ipcMain.handle('browser:close-tab', (_e, p = {}) => closeTab(S(p), p.tabId))

  ipcMain.handle('browser:history', (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    const nav = t.view.webContents.navigationHistory
    if (p.direction === 'forward') {
      if (!nav.canGoForward()) return { success: false, error: 'No forward history' }
      nav.goForward()
    } else {
      if (!nav.canGoBack()) return { success: false, error: 'No back history' }
      nav.goBack()
    }
    return { success: true, url: safe(() => t.view.webContents.getURL(), '') }
  })

  ipcMain.handle('browser:set-mode', (_e, p = {}) => {
    const s = S(p)
    return { success: true, mode: setMode(s, p.display) }
  })

  // Panel geometry. A WebContentsView composites ABOVE the DOM, so the React
  // panel is chrome around a hole and reports where the hole is. A rectangle
  // cannot escape a sandbox, so trusting the renderer here is safe — this is not
  // an exception to "the renderer never names a filesystem root".
  ipcMain.handle('browser:set-bounds', (_e, p = {}) => {
    const s = getSession(p.conversationId)
    if (!s) return { success: false }
    s.bounds = {
      x: Math.round(p.x || 0),
      y: Math.round(p.y || 0),
      width: Math.max(0, Math.round(p.width || 0)),
      height: Math.max(0, Math.round(p.height || 0)),
    }
    layout(s)
    return { success: true }
  })

  // An overlay that should cover the panel would be painted UNDER the view, so
  // the panel detaches it while a modal is open and re-attaches on close.
  ipcMain.handle('browser:set-detached', (_e, p = {}) => {
    const s = getSession(p.conversationId)
    if (!s) return { success: false }
    s.detached = !!p.detached
    showActive(s)
    return { success: true, detached: s.detached }
  })

  ipcMain.handle('browser:close', (_e, p = {}) => {
    destroySession((p && p.conversationId) || '__default__')
    return { success: true }
  })

  // Clicks on the window-mode tab strip.
  ipcMain.on('browser:tab-action', (e, { action, tabId } = {}) => {
    const s = [...sessions.values()].find(x => x.win && x.win.webContents === e.sender)
    if (!s) return
    if (action === 'close') closeTab(s, tabId)
    if (action === 'select' && s.tabs.has(tabId)) { s.activeTabId = tabId; showActive(s) }
  })
}

module.exports = {
  sessions, getSession, ensureSession, listTabs, setMode, showActive, layout,
  createTab, navigate, closeTab, destroySession, destroyAllSessions,
  tabFor, activeTab, readPage, click, typeText, pressKey, scroll, screenshot,
  registerBrowserControl,
}
