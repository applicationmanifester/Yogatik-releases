// Scheduled page monitoring for Yogatik Browser.
//
// Tier 4 of the AI-native roadmap. "Watch this page": the browser polls a
// page on an interval, compares a content fingerprint, and raises a native
// notification + in-chrome toast when it changes — price drops, stock and
// restock, ticket releases, doc updates.
//
// The monitor owns its OWN hidden WebContentsView — it never touches the
// user's tab session, so watching never disturbs browsing. Monitors live
// in-memory (a restart clears them; the user re-arms what they still want).

const { WebContentsView, Notification } = require('electron')
const path = require('path')

const monitors = new Map() // id -> { url, selector, intervalMin, lastHash, lastTitle, timer }
let monitorSeq = 0
let view = null
let toastFn = null // injected from browserControl — push a toast into the chrome

function wireMonitors({ toast }) {
  toastFn = toast
}

function ensureView() {
  if (view && !view.webContents.isDestroyed()) return view
  view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  return view
}

/** Load a page in the hidden view and extract text + title. */
async function readText(url, maxChars = 6000) {
  const v = ensureView()
  const wc = v.webContents
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 25_000)
    wc.once('did-finish-load', () => { clearTimeout(timer); resolve() })
    wc.loadURL(url).catch(() => { clearTimeout(timer); resolve() })
  })
  const text = await wc.executeJavaScript(
    `(document.body.innerText || '').replace(/\\s+/g,' ').trim().slice(0, ${maxChars})`
  ).catch(() => '')
  const title = safeTitle(wc)
  return { text, title }
}

function safeTitle(wc) {
  try { return wc.getTitle() || '' } catch { return '' }
}

function fingerprint(text) {
  // FNV-1a — stable, fast, good enough for change detection.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return String(h)
}

function notifyChange(m) {
  try {
    new Notification({
      title: 'Yogatik Browser — Page Changed',
      body: `${m.lastTitle || m.url} was just updated.`,
      icon: path.join(__dirname, 'assets', 'icon.png'),
    }).show()
  } catch {}
  if (toastFn) {
    try { toastFn(`👁️ Page changed: ${m.lastTitle || m.url}`) } catch {}
  }
}

async function checkMonitor(m) {
  try {
    const { text, title } = await readText(m.url)
    if (!text) return
    const hash = fingerprint(m.selector ? await readSelectorText(m) : text)
    if (m.lastHash && hash !== m.lastHash) {
      m.lastHash = hash
      m.lastTitle = title
      notifyChange(m)
    } else {
      m.lastHash = hash
      m.lastTitle = title
    }
  } catch { /* page unreachable this tick — try next interval */ }
}

async function readSelectorText(m) {
  if (!view || !view.webContents || view.webContents.isDestroyed()) return ''
  const sel = m.selector || 'body'
  return view.webContents.executeJavaScript(
    `(document.querySelector(${JSON.stringify(sel)})?.innerText || document.body.innerText || '').slice(0, 6000)`
  ).catch(() => '')
}

function addMonitor({ url, selector, intervalMin }) {
  if (!url || typeof url !== 'string') return { success: false, error: 'url required' }
  const mins = Math.max(1, Math.min(1440, Number(intervalMin) || 5))
  const id = `mon-${++monitorSeq}`
  const m = { id, url, selector: selector || null, intervalMin: mins, lastHash: null, lastTitle: null, timer: null }
  m.timer = setInterval(() => checkMonitor(m), mins * 60 * 1000)
  monitors.set(id, m)
  // First check runs immediately so a change baseline exists right away.
  checkMonitor(m).catch(() => {})
  return { success: true, id, intervalMin: mins }
}

function removeMonitor(id) {
  const m = monitors.get(id)
  if (!m) return { success: false, error: 'No such monitor' }
  if (m.timer) clearInterval(m.timer)
  monitors.delete(id)
  return { success: true }
}

function listMonitors() {
  return [...monitors.values()].map(m => ({
    id: m.id, url: m.url, selector: m.selector,
    intervalMin: m.intervalMin, lastTitle: m.lastTitle || null,
  }))
}

function destroyMonitors() {
  for (const [, m] of monitors) {
    if (m.timer) clearInterval(m.timer)
  }
  monitors.clear()
  if (view && !view.webContents.isDestroyed()) {
    try { view.webContents.destroy() } catch {}
  }
  view = null
}

module.exports = {
  wireMonitors, addMonitor, removeMonitor, listMonitors, destroyMonitors, fingerprint,
}
