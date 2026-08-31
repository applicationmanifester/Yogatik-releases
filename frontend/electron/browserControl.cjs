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
  buildTree, walkerSource, refResolverSource, elementRefExpression, parseRef, isStaleRef,
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
  if (s.win && !s.win.isDestroyed()) {
    // A mode switch hides this window rather than destroying it (see setMode).
    if (!s.win.isVisible()) s.win.show()
    return s.win
  }
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
  // HIDE, never destroy. Destroying a BrowserWindow while its WebContentsViews
  // are still alive orphans them, and closing an orphaned view later crashes the
  // process natively (not a catchable throw) — verified on Electron 43.
  // destroySession() is the only place a browser window is destroyed, and it
  // closes every view FIRST.
  if (s.mode === 'window' && s.win && !s.win.isDestroyed()) s.win.hide()
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
  // `console` is a ring of the page's own console output and uncaught errors.
  // Without it the model has no way to answer "does the UI work" — it was
  // observed inventing `window.__errors` and evaluating that, because reading
  // the real console was not a capability the tool offered.
  const tab = {
    view, refEpoch: 0, console: [], failed: [],
    // CDP (Network domain) request/response capture — see ensureDebugger().
    network: [], debuggerAttached: false, debuggerWired: false, pendingRequests: new Map(),
  }
  s.tabs.set(tabId, tab)
  s.activeTabId = tabId

  const wc = view.webContents
  // A fresh document invalidates every ref issued against the old one.
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) {
      tab.refEpoch++
      // Console output belongs to the DOCUMENT. Carrying warnings from the
      // previous page into a report about this one would be worse than none.
      tab.console = []
      tab.failed = []
      // Same reasoning: a captured request belongs to the document that made
      // it. Carrying the previous page's network log into a report about this
      // one is worse than an empty one.
      tab.network = []
      tab.pendingRequests.clear()
    }
  })

  const LEVELS = ['debug', 'info', 'warning', 'error']
  const pushLog = (entry) => {
    tab.console.push(entry)
    // A render loop can emit thousands of identical warnings; keep the tail.
    if (tab.console.length > 300) tab.console.splice(0, tab.console.length - 300)
  }
  wc.on('console-message', (...args) => {
    // Electron changed this signature: newer versions pass ONE event object,
    // older ones pass (event, level, message, line, sourceId). Handling only
    // one shape means the capture silently records nothing on the other.
    const e = args[0]
    const modern = e && typeof e === 'object' && ('message' in e || 'level' in e)
    const level = modern ? e.level : args[1]
    const message = modern ? e.message : args[2]
    const line = modern ? e.lineNumber : args[3]
    const source = modern ? e.sourceId : args[4]
    pushLog({
      level: typeof level === 'number' ? (LEVELS[level] || 'log') : String(level || 'log'),
      message: String(message ?? '').slice(0, 2000),
      source: source ? String(source).slice(0, 300) : null,
      line: Number(line) || null,
      at: Date.now(),
    })
  })
  // A page that throws during render logs nothing to the console in some
  // frameworks — this is the other half of "did the UI actually work".
  wc.on('preload-error', (_e, preloadPath, error) => {
    pushLog({ level: 'error', message: `Preload failed: ${error?.message || error}`, source: preloadPath, line: null, at: Date.now() })
  })
  wc.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
    // -3 is ERR_ABORTED, which same-page redirects raise routinely.
    if (code === -3) return
    tab.failed.push({ code, description: desc, url: failedUrl, mainFrame: !!isMainFrame, at: Date.now() })
    if (tab.failed.length > 50) tab.failed.shift()
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
  // Last tab closed: hide the surface, but keep the session so the next call
  // reopens it. Hidden rather than destroyed for the same reason as setMode.
  if (!s.tabs.size && s.mode === 'window' && s.win && !s.win.isDestroyed()) s.win.hide()
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

async function typeText(s, { tabId, ref, text, submit = false, clear = false } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (typeof text !== 'string') return { success: false, error: 'text is required' }
  if (ref) {
    const r = await click(s, { tabId, ref })
    if (!r.success) return r
  }
  const wc = t.view.webContents

  // Typing APPENDED to whatever the field already held. A search box the model
  // had just used, or a form the page had prefilled, silently became
  // "londonnew york" — no error, and the model reported the field as set.
  //
  // Select-all + Delete rather than assigning .value directly: a React or Vue
  // controlled input ignores a programmatic value assignment (its state never
  // changes, and the next render puts the old value back), whereas real key
  // events go through the framework's own onChange.
  if (clear) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] })
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' })
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' })
  }

  for (const ch of text) {
    wc.sendInputEvent({ type: 'char', keyCode: ch })
  }
  if (submit) {
    // keyUp as well: a handler bound to keyup (or one that tracks key state)
    // never fired, so "type and press Enter" worked on some forms and silently
    // did nothing on others. pressKey() has always sent both.
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
  }
  return { success: true, typed: text.length, cleared: !!clear, submitted: !!submit }
}

/**
 * Choose an option in a <select>.
 *
 * There is no input-event path to this: a native dropdown opens an OS-level
 * popup that sendInputEvent cannot reach, so typing at it does nothing at all
 * while reporting success. Setting .value and dispatching input+change is the
 * only way, and the events are what make React/Vue see the change.
 *
 * Matching is by value, then exact label, then case-insensitive label, then
 * index — the model rarely knows which of those it has.
 */
async function selectOption(s, { tabId, ref, selector, value } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (value == null) return { success: false, error: 'value is required' }

  const cssSelector = selector || ''
  // A stale ref is refused, never degraded to "whatever is at that index now" —
  // silently changing the wrong dropdown looks exactly like success.
  if (ref && !cssSelector && isStaleRef(ref, t.refEpoch)) {
    return { success: false, stale: true, error: `${ref} is from an earlier version of this page. Call read again.` }
  }

  try {
    const out = await t.view.webContents.executeJavaScript(`(() => {
      const wanted = ${JSON.stringify(String(value))}
      const el = ${cssSelector ? `document.querySelector(${JSON.stringify(cssSelector)})` : `(window.__yogatikRefs__ && window.__yogatikRefs__[${JSON.stringify(ref || '')}]) || null`}
      if (!el) return { ok: false, error: 'Element not found' }
      if (el.tagName !== 'SELECT') return { ok: false, error: 'Not a <select> element: ' + el.tagName + '. Use type or click instead.' }
      const opts = Array.from(el.options)
      let idx = opts.findIndex(o => o.value === wanted)
      if (idx < 0) idx = opts.findIndex(o => (o.label || o.text || '').trim() === wanted)
      if (idx < 0) idx = opts.findIndex(o => (o.label || o.text || '').trim().toLowerCase() === wanted.toLowerCase())
      if (idx < 0 && /^\\d+$/.test(wanted) && Number(wanted) < opts.length) idx = Number(wanted)
      if (idx < 0) {
        return { ok: false, error: 'No matching option', options: opts.slice(0, 40).map(o => ({ value: o.value, label: (o.label || o.text || '').trim() })) }
      }
      el.selectedIndex = idx
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, selected: { value: opts[idx].value, label: (opts[idx].label || opts[idx].text || '').trim(), index: idx } }
    })()`, false)
    if (!out?.ok) return { success: false, error: out?.error || 'select failed', options: out?.options }
    return { success: true, ...out.selected }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
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

// capturePage fails with UnknownVizError when the view has not been composited
// yet — a cold capture right after the surface is created loses the race. Make
// sure the surface is on screen, then retry once before giving up.
async function screenshot(s, param = {}) {
  const tabId = typeof param === 'string' ? param : param?.tabId
  const ref = typeof param === 'object' ? param?.ref : null
  const selector = typeof param === 'object' ? param?.selector : null

  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const attempt = () => t.view.webContents.capturePage()
  try {
    let img = await attempt()
    if (img.isEmpty()) {
      const h = host(s)
      if (h && !h.isDestroyed() && !h.isVisible()) h.show()
      showActive(s)
      await new Promise(r => setTimeout(r, 350))
      img = await attempt()
    }
    if (img.isEmpty()) throw new Error('empty capture')

    // Optional crop to ref or selector bounding box
    if (ref || selector) {
      const rect = await t.view.webContents.executeJavaScript(`(() => {
        let el = null
        if (${JSON.stringify(ref || '')} && window.__yogatikRefs__) {
          el = window.__yogatikRefs__[${JSON.stringify(ref || '')}]
        }
        if (!el && ${JSON.stringify(selector || '')}) {
          el = document.querySelector(${JSON.stringify(selector || '')})
        }
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height) }
      })()`, false).catch(() => null)

      if (rect && rect.width > 0 && rect.height > 0) {
        const size = img.getSize()
        const cropX = Math.min(rect.x, size.width - 1)
        const cropY = Math.min(rect.y, size.height - 1)
        const cropW = Math.min(rect.width, size.width - cropX)
        const cropH = Math.min(rect.height, size.height - cropY)
        if (cropW > 0 && cropH > 0) {
          img = img.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
        }
      }
    }

    return { success: true, image: img.toDataURL() }
  } catch (e2) {
    return { success: false, error: `Could not capture the page (${e2.message}). The browser may still be painting.` }
  }
}

async function hover(s, { tabId, ref, x, y } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const pt = await resolveTarget(t, { ref, x, y })
  if (pt.error) return { success: false, error: pt.error, stale: !!pt.stale }
  t.view.webContents.sendInputEvent({ type: 'mouseMove', x: pt.x, y: pt.y })
  return { success: true, hovered: { x: pt.x, y: pt.y }, ref: ref || null }
}

async function printToPDF(s, { tabId, landscape = false } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  try {
    const data = await t.view.webContents.printToPDF({ landscape: !!landscape })
    return { success: true, pdfBase64: data.toString('base64'), bytes: data.length }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
}

async function handleCookies(s, { tabId, action = 'get', name, value, domain } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  try {
    const currentUrl = t.view.webContents.getURL() || ''
    const ses = t.view.webContents.session
    if (action === 'clear') {
      await ses.clearStorageData({ storages: ['cookies'] })
      return { success: true, cleared: true }
    }
    if (action === 'set' && name && value) {
      await ses.cookies.set({ url: currentUrl, name, value, domain: domain || undefined })
      return { success: true, set: { name, value } }
    }
    const cookieList = await ses.cookies.get(currentUrl ? { url: currentUrl } : {})
    return { success: true, count: cookieList.length, cookies: cookieList.map(c => ({ name: c.name, domain: c.domain, path: c.path, secure: c.secure })) }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
}

async function handleStorage(s, { tabId, type = 'local' } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  try {
    const targetStorage = type === 'session' ? 'sessionStorage' : 'localStorage'
    const items = await t.view.webContents.executeJavaScript(
      `(() => {
        try {
          const store = window.${targetStorage}
          const out = {}
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i)
            out[k] = store.getItem(k)
          }
          return out
        } catch (e) {
          return { error: e.message }
        }
      })()`,
      false,
    )
    return { success: true, storageType: targetStorage, items }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
}

// ── CDP: file upload + network inspection ───────────────────────────────
//
// Electron's own Chromium already speaks CDP (webContents.debugger) — this is
// how the app gets Puppeteer/Playwright-grade capability (real file inputs,
// real request logging) without bundling a second browser engine.

const NETWORK_CAP = 200

function pushNetwork(t, entry) {
  t.network.push(entry)
  if (t.network.length > NETWORK_CAP) t.network.splice(0, t.network.length - NETWORK_CAP)
}

// Idempotent: safe to call before every upload/network action. Attaching a
// debugger that is already attached throws — caught and ignored, since it
// means the earlier attach already wired everything this call needs.
async function ensureDebugger(t) {
  const wc = t.view.webContents
  const dbg = wc.debugger
  if (!t.debuggerAttached) {
    try {
      dbg.attach('1.3')
      t.debuggerAttached = true
    } catch (e) {
      // "already attached" is not an error for our purposes; anything else is.
      if (!/already attach/i.test(String(e?.message || e))) throw e
      t.debuggerAttached = true
    }
  }
  // Detaching (devtools opened, tab closed, crash) must flip the flag back, or
  // the next call believes the domain is still enabled when it is not.
  if (!t._debuggerDetachWired) {
    dbg.on('detach', () => { t.debuggerAttached = false; t.debuggerWired = false })
    t._debuggerDetachWired = true
  }
  if (!t.debuggerWired) {
    dbg.on('message', (_e, method, params) => {
      if (method === 'Network.requestWillBeSent') {
        t.pendingRequests.set(params.requestId, {
          url: params.request?.url, method: params.request?.method, at: Date.now(),
        })
      } else if (method === 'Network.responseReceived') {
        const pending = t.pendingRequests.get(params.requestId)
        pushNetwork(t, {
          requestId: params.requestId,
          url: params.response?.url || pending?.url,
          method: pending?.method || null,
          status: params.response?.status,
          statusText: params.response?.statusText,
          mimeType: params.response?.mimeType,
          type: params.type,
          failed: false,
          at: Date.now(),
        })
      } else if (method === 'Network.loadingFailed') {
        const pending = t.pendingRequests.get(params.requestId)
        pushNetwork(t, {
          requestId: params.requestId,
          url: pending?.url || null,
          method: pending?.method || null,
          status: null,
          errorText: params.errorText,
          type: params.type,
          failed: true,
          at: Date.now(),
        })
        t.pendingRequests.delete(params.requestId)
      } else if (method === 'Network.loadingFinished') {
        t.pendingRequests.delete(params.requestId)
      }
    })
    t.debuggerWired = true
  }
  await dbg.sendCommand('Network.enable')
  await dbg.sendCommand('DOM.enable')
}

// DOM.setFileInputFiles is the ONLY way to put real files into a page's
// <input type=file> from outside it — a page never exposes a settable .value
// on one (browsers refuse it, for the obvious reason). This is genuinely a
// gap the ref/click/type system cannot cover, not a duplicate of `type`.
async function uploadFiles(s, { tabId, ref, files } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (!ref) return { success: false, error: 'ref is required — read the page first and pass the file input\'s ref' }
  if (isStaleRef(ref, t.refEpoch)) {
    return { success: false, error: 'stale ref — the page changed; call read again', stale: true }
  }
  if (!Array.isArray(files) || !files.length || files.some(f => typeof f !== 'string' || !f.trim())) {
    return { success: false, error: 'files is required — a non-empty array of absolute file paths. Use file_dialog to let the user pick real files first.' }
  }
  const { index } = parseRef(ref)
  const dbg = t.view.webContents.debugger
  try {
    await ensureDebugger(t)
    const evalRes = await dbg.sendCommand('Runtime.evaluate', {
      expression: elementRefExpression(index),
      returnByValue: false,
    })
    if (evalRes.exceptionDetails) {
      // The page-side throw (e.g. "ref does not point at a file input") is the
      // most actionable message available — surface it verbatim.
      const msg = evalRes.exceptionDetails.exception?.description
        || evalRes.exceptionDetails.text || 'element could not be resolved'
      return { success: false, error: msg }
    }
    if (!evalRes.result?.objectId) {
      return { success: false, error: 'stale ref — element is gone; call read again', stale: true }
    }
    await dbg.sendCommand('DOM.setFileInputFiles', {
      files,
      objectId: evalRes.result.objectId,
    })
    return { success: true, uploaded: files.length, ref }
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
}

async function readNetwork(s, { tabId, limit } = {}) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  try {
    await ensureDebugger(t)
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
  const n = Math.min(Math.max(1, Number(limit) || 50), NETWORK_CAP)
  return {
    success: true,
    url: safe(() => t.view.webContents.getURL(), ''),
    requests: t.network.slice(-n).reverse(),
    count: t.network.length,
    note: t.network.length
      ? 'Newest first. Capture began when network inspection was first requested on this page — requests made before that are not included.'
      : 'No requests captured yet. Network inspection just attached; reload or navigate, then call again.',
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
  ipcMain.handle('browser:hover', (_e, p = {}) => hover(S(p), p))
  ipcMain.handle('browser:type', (_e, p = {}) => typeText(S(p), p))
  ipcMain.handle('browser:select', (_e, p = {}) => selectOption(S(p), p))
  ipcMain.handle('browser:upload', (_e, p = {}) => uploadFiles(S(p), p))
  ipcMain.handle('browser:key', (_e, p = {}) => pressKey(S(p), p))
  ipcMain.handle('browser:scroll', (_e, p = {}) => scroll(S(p), p))
  ipcMain.handle('browser:screenshot', (_e, p = {}) => screenshot(S(p), p))
  ipcMain.handle('browser:pdf', (_e, p = {}) => printToPDF(S(p), p))
  ipcMain.handle('browser:cookies', (_e, p = {}) => handleCookies(S(p), p))
  ipcMain.handle('browser:storage', (_e, p = {}) => handleStorage(S(p), p))

  ipcMain.handle('browser:assert', async (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    const type = String(p.type || 'text').toLowerCase()
    const target = String(p.target || p.selector || '')
    const expected = p.expected != null ? p.expected : p.value
    const timeout = Math.min(Math.max(500, Number(p.timeout) || 4000), 20000)
    const started = Date.now()

    while (Date.now() - started < timeout) {
      try {
        const check = await t.view.webContents.executeJavaScript(`(() => {
          try {
            if (${JSON.stringify(type)} === 'text') {
              const bodyText = document.body ? document.body.innerText || '' : ''
              const exp = ${JSON.stringify(String(expected || ''))}
              if (${JSON.stringify(target)}) {
                const el = document.querySelector(${JSON.stringify(target)})
                if (!el) return { passed: false, actual: null, error: 'Target element not found: ' + ${JSON.stringify(target)} }
                const txt = el.innerText || el.textContent || ''
                return { passed: txt.includes(exp), actual: txt.slice(0, 300) }
              }
              return { passed: bodyText.includes(exp), actual: bodyText.slice(0, 300) }
            }
            if (${JSON.stringify(type)} === 'element' || ${JSON.stringify(type)} === 'visible') {
              const el = document.querySelector(${JSON.stringify(target)})
              if (!el) return { passed: false, actual: 'not_found' }
              const rect = el.getBoundingClientRect()
              const style = window.getComputedStyle(el)
              const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
              return { passed: isVisible, actual: isVisible ? 'visible' : 'hidden', tagName: el.tagName }
            }
            if (${JSON.stringify(type)} === 'count') {
              const els = document.querySelectorAll(${JSON.stringify(target)})
              const expCount = Number(${JSON.stringify(expected)})
              return { passed: els.length === expCount, actual: els.length, expected: expCount }
            }
            if (${JSON.stringify(type)} === 'attribute') {
              const el = document.querySelector(${JSON.stringify(target)})
              if (!el) return { passed: false, actual: null, error: 'Element not found' }
              const attrName = ${JSON.stringify(String(p.attribute || ''))}
              const val = el.getAttribute(attrName)
              const expVal = ${JSON.stringify(String(expected ?? ''))}
              return { passed: expVal ? val === expVal : val !== null, actual: val }
            }
            if (${JSON.stringify(type)} === 'url') {
              const cur = window.location.href
              const exp = ${JSON.stringify(String(expected || ''))}
              return { passed: cur.includes(exp), actual: cur }
            }
            if (${JSON.stringify(type)} === 'title') {
              const cur = document.title
              const exp = ${JSON.stringify(String(expected || ''))}
              return { passed: cur.includes(exp), actual: cur }
            }
            return { passed: false, error: 'Unknown assertion type: ' + ${JSON.stringify(type)} }
          } catch (e) {
            return { passed: false, error: e.message }
          }
        })()`, false)

        if (check && check.passed) {
          return { success: true, passed: true, type, target, expected, actual: check.actual, waitedMs: Date.now() - started }
        }
      } catch { /* page navigating */ }
      await new Promise(r => setTimeout(r, 200))
    }

    return {
      success: true,
      passed: false,
      type,
      target,
      expected,
      message: `Assertion failed: expected ${type} "${target || expected}" within ${timeout}ms`,
      waitedMs: Date.now() - started,
    }
  })

  ipcMain.handle('browser:audit-a11y', async (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    try {
      const result = await t.view.webContents.executeJavaScript(`(() => {
        const issues = []
        let idCount = {}
        
        // 1. Missing image alt
        document.querySelectorAll('img:not([alt])').forEach(img => {
          issues.push({
            rule: 'image-alt',
            severity: 'critical',
            message: 'Image missing alt attribute',
            selector: img.src ? 'img[src*="' + img.src.split('/').pop().slice(0, 30) + '"]' : 'img',
            snippet: img.outerHTML.slice(0, 150),
          })
        })

        // 2. Unlabeled form controls
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').forEach(el => {
          const id = el.id
          const hasLabel = (id && document.querySelector('label[for="' + id + '"]')) ||
                          el.closest('label') ||
                          el.getAttribute('aria-label') ||
                          el.getAttribute('aria-labelledby') ||
                          el.getAttribute('title') ||
                          el.getAttribute('placeholder')
          if (!hasLabel) {
            issues.push({
              rule: 'form-label',
              severity: 'serious',
              message: 'Form control lacks accessible label or aria-label',
              selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : '')),
              snippet: el.outerHTML.slice(0, 150),
            })
          }
        })

        // 3. Buttons / Links without accessible name
        document.querySelectorAll('button, a[href]').forEach(el => {
          const text = (el.innerText || el.textContent || '').trim()
          const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
          const img = el.querySelector('img[alt]')
          if (!text && !aria && !img) {
            issues.push({
              rule: 'button-name',
              severity: 'serious',
              message: (el.tagName === 'BUTTON' ? 'Button' : 'Link') + ' has no text, aria-label, or title',
              selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ')[0] : '')),
              snippet: el.outerHTML.slice(0, 150),
            })
          }
        })

        // 4. Duplicate IDs
        document.querySelectorAll('[id]').forEach(el => {
          const id = el.id.trim()
          if (id) {
            idCount[id] = (idCount[id] || 0) + 1
            if (idCount[id] === 2) {
              issues.push({
                rule: 'duplicate-id',
                severity: 'moderate',
                message: 'Duplicate ID attribute on page: "#' + id + '"',
                selector: '#' + id,
              })
            }
          }
        })

        // 5. Document language
        if (!document.documentElement.lang) {
          issues.push({
            rule: 'html-has-lang',
            severity: 'moderate',
            message: '<html> element does not have a [lang] attribute',
            selector: 'html',
          })
        }

        // 6. Heading hierarchy check
        const h1s = document.querySelectorAll('h1')
        if (h1s.length === 0) {
          issues.push({
            rule: 'page-has-h1',
            severity: 'moderate',
            message: 'Page has no <h1> primary heading',
            selector: 'body',
          })
        } else if (h1s.length > 1) {
          issues.push({
            rule: 'single-h1',
            severity: 'minor',
            message: 'Page has multiple (' + h1s.length + ') <h1> headings',
            selector: 'h1',
          })
        }

        const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
        issues.forEach(i => { counts[i.severity] = (counts[i.severity] || 0) + 1 })
        const score = Math.max(0, 100 - (counts.critical * 25 + counts.serious * 15 + counts.moderate * 8 + counts.minor * 3))

        return {
          url: window.location.href,
          title: document.title,
          score,
          totalIssues: issues.length,
          severityCounts: counts,
          issues: issues.slice(0, 50),
        }
      })()`, false)

      return { success: true, ...result }
    } catch (err) {
      return { success: false, error: err?.message || String(err) }
    }
  })

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

  // ── evaluate / get-html / wait-for ────────────────────────────────────────
  //
  // The tool schema has advertised `evaluate`, `extract_text` and `wait_for`
  // since it was written, and NONE of them could work: the first two needed
  // bridge methods that did not exist ("evaluate is not supported by this
  // browser bridge version"), and wait_for fell back to string-matching a CSS
  // selector against the ACCESSIBILITY TREE, which essentially never matches —
  // so it polled for ten seconds and reported a timeout.
  //
  // That is the same class of failure as the missing `reload`: the model is
  // told a capability exists, reaches for it, and concludes the whole tool is
  // broken. "Verify the UI on localhost" reaches for exactly these.
  //
  // SECURITY: this runs model-written JavaScript in a real browsing context
  // that may hold the user's logged-in sessions. It is not sandboxed and
  // cannot be — that is the point of the tool. It is reachable only on desktop,
  // only behind the SHELL/BROWSER entitlement, and only through a tool the
  // permission layer classifies as destructive. Do not widen it further.
  ipcMain.handle('browser:evaluate', async (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    const expression = String(p.expression ?? '')
    if (!expression.trim()) return { success: false, error: 'expression is required' }
    try {
      // userGesture:false — a script must not be able to trigger things the
      // page only allows in response to a real click (popups, autoplay,
      // permission prompts).
      // Wrapped so a bare expression AND a statement body both work: the model
      // writes both, and `executeJavaScript('const x = 1; x')` throws.
      //
      // The retry must fire ONLY on a SyntaxError. A blanket `.catch(retry)`
      // re-ran the expression whenever the FIRST form rejected at runtime — so
      // `document.querySelector('#buy').click()` that threw after clicking
      // executed a second time. Double-clicking Buy because the first attempt
      // errored is not a recoverable mistake.
      let value
      try {
        value = await t.view.webContents.executeJavaScript(`(async () => { return (${expression}) })()`, false)
      } catch (first) {
        const isSyntax = first?.name === 'SyntaxError'
          || /SyntaxError|Unexpected (token|identifier|end of input)/i.test(String(first?.message || first))
        if (!isSyntax) throw first
        // Statement-body form. Safe to run now: the expression form never
        // reached execution, so nothing has happened yet.
        value = await t.view.webContents.executeJavaScript(`(async () => { ${expression} })()`, false)
      }
      // The result crosses IPC, so it must be structured-cloneable. A DOM node
      // or a function is not, and would arrive as an opaque failure.
      let result = value
      try { result = JSON.parse(JSON.stringify(value ?? null)) } catch { result = String(value) }
      // `document.body.innerHTML` on a real page is megabytes, and every byte
      // of it lands in the model's context. Truncate and say so.
      const MAX_RESULT = 100_000
      if (typeof result === 'string' && result.length > MAX_RESULT) {
        return {
          success: true,
          result: result.slice(0, MAX_RESULT),
          truncated: true,
          totalLength: result.length,
          note: `Result truncated to ${MAX_RESULT} characters. Narrow the expression, or use extract_text.`,
        }
      }
      return { success: true, result }
    } catch (err) {
      // A page-script error is a RESULT the model can act on, not a tool
      // failure — it usually means the selector was wrong.
      return { success: false, error: `Script error: ${err?.message || err}` }
    }
  })

  ipcMain.handle('browser:get-html', async (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    try {
      const html = await t.view.webContents.executeJavaScript(
        'document.documentElement.outerHTML', false,
      )
      return { success: true, html: String(html || '').slice(0, 2_000_000) }
    } catch (err) {
      return { success: false, error: err?.message || String(err) }
    }
  })

  // A REAL wait: polled IN THE PAGE against the live DOM, so a CSS selector
  // means what the model thinks it means.
  ipcMain.handle('browser:wait-for', async (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    const selector = String(p.selector ?? '')
    if (!selector.trim()) return { success: false, error: 'selector is required' }
    const timeout = Math.min(Math.max(1000, Number(p.timeout) || 10000), 30000)
    const started = Date.now()

    while (Date.now() - started < timeout) {
      try {
        // JSON.stringify, not string interpolation: a selector containing a
        // quote would otherwise terminate the literal and change the script.
        const found = await t.view.webContents.executeJavaScript(
          `!!document.querySelector(${JSON.stringify(selector)})`, false,
        )
        if (found) return { success: true, found: selector, waitedMs: Date.now() - started }
      } catch { /* mid-navigation: the context is being replaced, keep waiting */ }
      await new Promise(r => setTimeout(r, 250))
    }
    // "Timed out waiting for #root > *" with no context is unactionable — it
    // does not say WHICH PAGE was being watched, and the commonest cause is
    // that the tab was never navigated there in the first place. Report the
    // url, the title and whether anything rendered at all.
    let where = { url: safe(() => t.view.webContents.getURL(), ''), title: '', bodyLength: 0 }
    try {
      const probe = await t.view.webContents.executeJavaScript(
        '({ title: document.title, bodyLength: (document.body?.innerText || "").trim().length,' +
        ' readyState: document.readyState })', false,
      )
      where = { ...where, ...probe }
    } catch { /* the page is not scriptable; the url alone still helps */ }

    const errs = t.console.filter(l => l.level === 'error').slice(-5)
    return {
      success: false,
      url: where.url,
      title: where.title,
      ready_state: where.readyState,
      visible_text_length: where.bodyLength,
      console_errors: errs,
      error:
        `Timed out after ${timeout}ms waiting for "${selector}" on ${where.url || 'an unknown page'}. ` +
        (where.bodyLength === 0
          ? 'Nothing has rendered on that page at all' + (errs.length ? ` and it logged ${errs.length} console error(s)` : '') + '. '
          : `The page has ${where.bodyLength} characters of visible text, so the selector is probably wrong. `) +
        'Use action "diagnose" for a full report, or "read" to see the actual elements.',
    }
  })

  ipcMain.handle('browser:network', (_e, p = {}) => readNetwork(S(p), p))

  ipcMain.handle('browser:console', (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    const level = String(p.level || 'all')
    const wanted = level === 'errors'
      ? (l) => l.level === 'error'
      : level === 'warnings'
        ? (l) => l.level === 'error' || l.level === 'warning'
        : () => true
    const logs = t.console.filter(wanted).slice(-Number(p.limit || 100))
    return {
      success: true,
      url: safe(() => t.view.webContents.getURL(), ''),
      logs,
      failed_requests: t.failed.slice(-20),
      errors: t.console.filter(l => l.level === 'error').length,
      warnings: t.console.filter(l => l.level === 'warning').length,
    }
  })

  /**
   * ONE call that answers "is this page actually working".
   *
   * MEASURED: a "verify the UI on localhost" turn spent 27 steps and still
   * failed. The model has to navigate, guess a selector, wait for it, time out
   * with no idea what page it is on, then invent `window.__errors` to look for
   * problems. Every one of those is a round trip, and the round cap kills the
   * turn before it can answer.
   *
   * This is the shape of the question that was actually being asked, so it is
   * the shape of the tool: navigate if asked, wait for the app to render,
   * report what is on the page and everything that went wrong.
   */
  ipcMain.handle('browser:diagnose', async (_e, p = {}) => {
    const s = S(p)
    let t = tabFor(s, p.tabId)
    if (p.url) {
      const tabId = t ? (p.tabId || s.activeTabId) : createTab(s, null)
      await navigate(s, tabId, p.url)
      t = tabFor(s, tabId)
    }
    if (!t) return { success: false, error: 'No tab is open. Pass a url to open one.' }
    const wc = t.view.webContents
    const budget = Math.min(Math.max(1000, Number(p.timeout) || 12000), 30000)
    const started = Date.now()

    // Wait for the app to actually RENDER, not merely for the document to
    // load. A single-page app serves an empty <div id="root"> instantly; the
    // interesting question is whether anything mounted into it.
    const probe = `(() => {
      const body = document.body
      const mounts = ['#root', '#app', 'main', '[data-reactroot]']
      let mounted = false, mountSel = null
      for (const sel of mounts) {
        const el = document.querySelector(sel)
        if (el && el.children.length > 0) { mounted = true; mountSel = sel; break }
      }
      const text = (body ? body.innerText || '' : '').trim()
      return {
        readyState: document.readyState,
        title: document.title,
        mounted,
        mountSelector: mountSel,
        textLength: text.length,
        sample: text.slice(0, 1500),
        headings: [...document.querySelectorAll('h1,h2')].slice(0, 10).map(h => h.innerText.trim()).filter(Boolean),
        interactive: document.querySelectorAll('button,a[href],input,select,textarea').length,
      }
    })()`

    let snap = null
    while (Date.now() - started < budget) {
      try {
        snap = await wc.executeJavaScript(probe, false)
        if (snap && (snap.mounted || snap.textLength > 0)) break
      } catch { /* mid-navigation: the execution context is being replaced */ }
      await new Promise(r => setTimeout(r, 300))
    }

    const errors = t.console.filter(l => l.level === 'error')
    const warnings = t.console.filter(l => l.level === 'warning')
    const url = safe(() => wc.getURL(), '')

    return {
      success: true,
      url,
      title: snap?.title || safe(() => wc.getTitle(), ''),
      // The verdict, stated plainly, so the model does not have to infer it
      // from four separate fields and get it wrong.
      rendered: !!(snap && (snap.mounted || snap.textLength > 20)),
      ready_state: snap?.readyState || 'unknown',
      mounted_into: snap?.mountSelector || null,
      visible_text_length: snap?.textLength ?? 0,
      text_sample: snap?.sample || '',
      headings: snap?.headings || [],
      interactive_elements: snap?.interactive ?? 0,
      console_errors: errors.slice(-25),
      console_warnings: warnings.slice(-15),
      failed_requests: t.failed.slice(-15),
      waited_ms: Date.now() - started,
      note: !snap
        ? 'The page never became scriptable. It may still be loading, or the dev server may not be serving this URL.'
        : (!snap.mounted && snap.textLength === 0
          ? 'The document loaded but nothing rendered into it — for a single-page app that usually means a JavaScript error. Check console_errors.'
          : undefined),
    }
  })

  ipcMain.handle('browser:reload', (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    // reloadIgnoringCache: the reason a human reloads a page an agent is
    // driving is almost always that it is showing something stale.
    t.view.webContents.reloadIgnoringCache()
    // Refs are page-scoped and every one of them is invalidated by a reload.
    // Not bumping the epoch here would let a ref from before the reload resolve
    // to whatever now sits at that index — a click on the wrong element, which
    // looks exactly like success.
    s.epoch = (s.epoch || 0) + 1
    return { success: true, url: safe(() => t.view.webContents.getURL(), ''), refs_invalidated: true }
  })

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
