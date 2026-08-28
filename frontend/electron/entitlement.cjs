// Entitlement runtime — the impure half: disk, network, clock, IPC.
// Everything decidable without those lives in entitlementCore.cjs.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE GATE IS ONE INTERCEPTION, NOT A HUNDRED CALL SITES.
//
// installGate() wraps `ipcMain.handle` ONCE, before any register*() runs. Every
// handler in the app is therefore gated by name automatically, and an
// unclassified channel FAILS CLOSED. The alternative — an `if` at the top of
// each handler — is the pattern that produced every "shipped dead / shipped
// ungated" note in CLAUDE.md: fs_find_files missing from the preload whitelist,
// git handlers missing from FS_COMMANDS. A rule that must be remembered at 100
// sites is a rule that will be forgotten at the 101st.
//
// ─────────────────────────────────────────────────────────────────────────────
// EDITIONS
//
//   store    (default) — gated. This is what CI builds and what ships.
//   personal           — the gate is compiled out entirely. A private build for
//                        the author's own machine: no sign-in, no licence, no
//                        network call, every capability on. See §Personal below.

const path = require('path')
const fs = require('fs')
const core = require('./entitlementCore.cjs')

const LICENSE_FILE = 'license.json'
/** Refresh at most this often; the token is valid for 14 days regardless. */
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000

/* ── edition ────────────────────────────────────────────────────────────── */

/**
 * `personal` removes the gate at the source rather than flipping a runtime
 * flag, so there is no in-app switch an ordinary build could be talked into.
 * The edition is baked at build time by build-personal.bat / the npm script.
 */
function edition() {
  const e = String(process.env.YOGATIK_EDITION || '').toLowerCase()
  if (e === 'studio' || e === 'personal') return e

  try {
    const { app } = require('electron')
    const appName = String(app?.getName?.() || app?.name || '').toLowerCase()
    if (appName.includes('studio')) return 'studio'
    if (appName.includes('personal')) return 'personal'
    if (String(process.execPath || '').toLowerCase().includes('studio')) return 'studio'
    if (String(process.execPath || '').toLowerCase().includes('personal')) return 'personal'
  } catch {}

  try {
    const pkg = require('../package.json')
    if (String(pkg?.name || '').toLowerCase().includes('studio')) return 'studio'
    if (String(pkg?.name || '').toLowerCase().includes('personal')) return 'personal'
    if (pkg?.yogatikEdition === 'studio' || pkg?.yogatikEdition === 'personal') return pkg.yogatikEdition
  } catch {}

  try {
    const locations = [
      path.join(__dirname, 'edition.json'),
      path.join(__dirname, '..', 'edition.json'),
      path.join(process.resourcesPath || '', 'edition.json'),
      path.join(process.resourcesPath || '', 'app', 'edition.json'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'edition.json'),
      path.join(process.cwd(), 'edition.json')
    ]
    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        const parsed = JSON.parse(fs.readFileSync(loc, 'utf8'))
        if (parsed.edition === 'studio' || parsed.edition === 'personal') return parsed.edition
      }
    }
  } catch {}

  return (e === 'personal' || e === 'studio') ? e : (e === 'personal' ? 'personal' : 'store')
}
const isPersonal = () => {
  const ed = edition()
  return ed === 'personal' || ed === 'studio'
}

/* ── state ──────────────────────────────────────────────────────────────── */

let store = {
  token: null,
  uid: null,
  highWaterMark: 0,
  lastRefresh: 0,
  /** Set by the renderer after Firebase auth; main never talks to Firebase. */
  idToken: null,
  licenseApiBase: process.env.YOGATIK_LICENSE_API || '',
}
let statePath = null
let cached = { state: core.STATE.ANONYMOUS, reason: 'boot' }

function load(userDataDir) {
  statePath = path.join(userDataDir, LICENSE_FILE)
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    store = { ...store, ...raw }
  } catch { /* first run, or a corrupt file — either way, start clean */ }
  recompute()
  return cached
}

function persist() {
  if (!statePath) return
  try {
    // The signature is the integrity, not secrecy — this is deliberately
    // plaintext so a support conversation can read it.
    fs.writeFileSync(statePath, JSON.stringify({
      token: store.token, uid: store.uid,
      highWaterMark: store.highWaterMark, lastRefresh: store.lastRefresh,
    }, null, 2))
  } catch { /* a read-only userData is not worth crashing over */ }
}

function recompute(now = Date.now()) {
  if (isPersonal()) {
    cached = { state: core.STATE.PRO, reason: 'personal-edition', edition: 'personal' }
    return cached
  }
  cached = { ...core.resolveState({ ...store, now }), edition: 'store' }
  return cached
}

function currentState() { return cached.state }

/* ── the gate ───────────────────────────────────────────────────────────── */

/**
 * Wrap ipcMain.handle so every channel is checked before its handler runs.
 * MUST be called before any register*() in main.cjs, or the handlers registered
 * first are ungated — and those are the FS ones.
 */
function installGate(ipcMain) {
  if (isPersonal()) return false           // no wrapper at all in a personal build
  if (ipcMain.__yogatikGated) return false // idempotent: a second call must not double-wrap
  const original = ipcMain.handle.bind(ipcMain)

  ipcMain.handle = (channel, listener) => original(channel, async (event, ...args) => {
    if (!core.isAllowed(channel, cached.state)) {
      // Returned, never thrown. A throw crosses IPC as a stringified Error and
      // arrives at the tool layer as "Error invoking remote method", which the
      // model cannot act on — the exact class of failure that made tools retry
      // the same broken call forever.
      return core.lockedResult(channel, cached.state)
    }
    return listener(event, ...args)
  })
  ipcMain.__yogatikGated = true
  return true
}

/* ── licence refresh ────────────────────────────────────────────────────── */

/**
 * Ask the licence server for a fresh token. Never throws, never blocks a
 * launch: an offline start keeps the cached token until its own expiry.
 */
async function refresh({ force = false } = {}) {
  if (isPersonal()) return recompute()
  const now = Date.now()
  if (!force && now - store.lastRefresh < REFRESH_INTERVAL_MS) return cached
  if (!store.idToken || !store.licenseApiBase) return cached

  try {
    const res = await fetch(`${store.licenseApiBase}/license`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${store.idToken}` },
      body: JSON.stringify({ edition: 'store' }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return cached
    const body = await res.json()
    if (!body?.token) return cached

    const v = core.verifyToken(body.token)
    if (!v.ok) return cached   // a token we cannot verify is not an upgrade

    store.token = body.token
    store.uid = v.payload.sub
    // The high-water mark only ever moves FORWARD, and only from a SIGNED
    // payload. Trusting the response's own clock, or the local one, would hand
    // the guard to the thing it guards against.
    store.highWaterMark = Math.max(store.highWaterMark || 0, Number(v.payload.iat) || 0)
    store.lastRefresh = now
    persist()
  } catch { /* offline, DNS, timeout — the cached token is still valid */ }
  return recompute()
}

/** The renderer hands main the Firebase ID token after sign-in. */
function setIdentity({ idToken = null, uid = null } = {}) {
  store.idToken = idToken || null
  if (uid && store.uid && uid !== store.uid) {
    // A different account signed in: the previous licence is not theirs.
    store.token = null
  }
  if (uid) store.uid = uid
  persist()
  return recompute()
}

function signOut() {
  store.idToken = null
  store.uid = null
  store.token = null
  // highWaterMark deliberately SURVIVES sign-out. It is a clock guard, not a
  // session; clearing it would make "sign out, set the date back, sign in" a
  // one-click reset of the whole mechanism.
  persist()
  return recompute()
}

/* ── IPC ────────────────────────────────────────────────────────────────── */

function registerEntitlementIpc(ipcMain, { shell, openCheckout } = {}) {
  // These four are FREE in the matrix: buying is not a paid feature, and a
  // locked app that cannot reach its own upgrade screen is a dead end.
  ipcMain.handle('entitlement:get', () => ({
    success: true,
    ...recompute(),
    trialDays: core.TRIAL_DAYS,
    daysLeft: core.daysLeft(cached.endsAt, Date.now()),
  }))

  ipcMain.handle('entitlement:refresh', async (_e, opts = {}) => {
    if (opts?.idToken || opts?.uid) setIdentity(opts)
    const st = await refresh({ force: true })
    return { success: true, ...st, daysLeft: core.daysLeft(st.endsAt, Date.now()) }
  })

  ipcMain.handle('entitlement:sign-out', () => ({ success: true, ...signOut() }))

  // Checkout NEVER happens inside Electron. A card form in a webview the app
  // controls is both a PCI problem and a phishing shape; and the provider's
  // own 3-D Secure / UPI flows expect a real browser.
  ipcMain.handle('entitlement:checkout', async (_e, { url } = {}) => {
    if (!url || !/^https:\/\//.test(String(url))) return { success: false, error: 'Invalid checkout URL.' }
    try { await (shell || require('electron').shell).openExternal(String(url)) } catch (e) {
      return { success: false, error: e.message }
    }
    if (typeof openCheckout === 'function') openCheckout(String(url))
    return { success: true }
  })
}

/**
 * Poll after a checkout is opened. The redirect back is a browser navigation
 * and can be forged, so entitlement is granted by the WEBHOOK — this just
 * notices when the webhook has landed.
 */
function watchForPurchase({ onChange, attempts = 40, intervalMs = 3000 } = {}) {
  if (isPersonal()) return () => {}
  let n = 0
  let stopped = false
  const tick = async () => {
    if (stopped || n++ >= attempts) return
    const before = cached.state
    const after = (await refresh({ force: true })).state
    if (after !== before && typeof onChange === 'function') { onChange(after); return }
    setTimeout(tick, intervalMs).unref?.()
  }
  setTimeout(tick, intervalMs).unref?.()
  return () => { stopped = true }
}

module.exports = {
  edition, isPersonal, load, refresh, recompute, currentState,
  installGate, registerEntitlementIpc, setIdentity, signOut, watchForPurchase,
  _store: () => store,
}
