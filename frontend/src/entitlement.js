// Renderer-side entitlement client.
//
// The GATE is not here — it is one wrapper around ipcMain.handle in the main
// process (electron/entitlement.cjs). This module only ever answers "what
// should the UI say", and is deliberately incapable of granting anything: the
// worst a tampered renderer achieves is a paywall that does not draw, while the
// IPC still refuses.
//
// State is read SYNCHRONOUSLY by callers that run mid-turn (agent.js assembles
// a system prompt without awaiting), so a cached snapshot is kept in a module
// variable and refreshed on change — the same reason locale.js keeps
// `_overrides` in a module variable rather than reading Dexie.

const listeners = new Set()

const isStudioEnv = typeof import.meta !== 'undefined' && (
  import.meta.env?.VITE_YOGATIK_EDITION === 'studio' ||
  import.meta.env?.VITE_YOGATIK_EDITION === 'personal' ||
  import.meta.env?.MODE === 'studio' ||
  import.meta.env?.MODE === 'personal'
)

/** Last known state. `anonymous` until main answers — never assume unlocked. */
let snapshot = {
  state: isStudioEnv ? 'pro' : 'anonymous',
  edition: isStudioEnv ? 'studio' : 'store',
  reason: isStudioEnv ? 'studio-edition' : 'boot',
  endsAt: 0,
  daysLeft: 0,
  loaded: isStudioEnv,
}

const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_ENTITLEMENT__) || null

export function isDesktopBuild() {
  return typeof window !== 'undefined' && !!window.__YOGATIK_ELECTRON__
}

/**
 * Synchronous snapshot for callers that cannot await (system prompt assembly,
 * a render pass). On the WEB this is always unlocked-irrelevant: the web build
 * has no privileged tools to lock, so gating anything there would only remove
 * features the user already has for free.
 */
export function entitlement() {
  if (!isDesktopBuild()) return { ...snapshot, state: 'web', locked: false }
  if (isUnrestrictedEdition()) return { ...snapshot, state: 'pro', edition: snapshot.edition || 'studio', locked: false }
  return { ...snapshot, locked: isLocked() }
}

export function isLocked() {
  if (!isDesktopBuild()) return false
  if (isUnrestrictedEdition()) return false
  return snapshot.state === 'locked' || snapshot.state === 'anonymous'
}

export function isUnlocked() { return !isLocked() }

/** True for the author's own build, where the gate does not exist at all. */
export function isStudioEdition() { return snapshot.edition === 'studio' || isStudioEnv }
export function isPersonalEdition() { return snapshot.edition === 'personal' || snapshot.edition === 'studio' || isStudioEnv }
export function isUnrestrictedEdition() { return isPersonalEdition() || isStudioEdition() }

function emit() {
  for (const fn of listeners) { try { fn(entitlement()) } catch { /* a bad listener is not our problem */ } }
}

export function onEntitlementChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function apply(res) {
  if (!res || res.success === false) return entitlement()
  const next = {
    state: res.state || 'locked',
    edition: res.edition || 'store',
    reason: res.reason || '',
    endsAt: Number(res.endsAt) || 0,
    daysLeft: Number(res.daysLeft) || 0,
    loaded: true,
  }
  const changed = snapshot.state !== next.state ||
    snapshot.edition !== next.edition ||
    snapshot.loaded !== next.loaded ||
    snapshot.endsAt !== next.endsAt ||
    snapshot.daysLeft !== next.daysLeft
  snapshot = next
  if (changed) emit()
  return entitlement()
}

/** Read the current state from main. Safe on the web (returns the web shape). */
export async function loadEntitlement() {
  const b = bridge()
  if (!b) { snapshot = { ...snapshot, loaded: true }; return entitlement() }
  try { return apply(await b.get()) } catch { return entitlement() }
}

/**
 * Hand main the Firebase identity and pull a fresh licence.
 * Called after sign-in and on app focus. Main holds the ID token only in
 * memory — it is short-lived and re-supplied by the renderer each time.
 */
export async function refreshEntitlement({ idToken = null, uid = null } = {}) {
  const b = bridge()
  if (!b) return entitlement()
  try { return apply(await b.refresh({ idToken, uid })) } catch { return entitlement() }
}

export async function signOutEntitlement() {
  const b = bridge()
  if (!b) return entitlement()
  try { return apply(await b.signOut()) } catch { return entitlement() }
}

/** Open a provider checkout in the user's REAL browser. Never in a webview. */
export async function openCheckout(url) {
  const b = bridge()
  if (!b) { try { window.open(url, '_blank', 'noopener') } catch { /* popup blocked */ } ; return { success: true } }
  try { return await b.checkout(url) } catch (e) { return { success: false, error: e?.message } }
}

/**
 * After checkout, poll until the WEBHOOK has landed. The provider's redirect is
 * a browser navigation and can be forged, so it is never what grants access —
 * this only notices when the server has already decided.
 */
export function pollForUpgrade({ idToken, uid, onUnlocked, attempts = 40, intervalMs = 3000 } = {}) {
  let stop = false
  let n = 0
  const tick = async () => {
    if (stop || n++ >= attempts) return
    const st = await refreshEntitlement({ idToken, uid })
    if (!st.locked) { onUnlocked?.(st); return }
    setTimeout(tick, intervalMs)
  }
  setTimeout(tick, intervalMs)
  return () => { stop = true }
}

/* ── pricing ────────────────────────────────────────────────────────────── */

/**
 * Two providers, split by the BILLING COUNTRY OF THE PAYMENT METHOD, not by IP.
 * IP is one VPN away; the instrument is not. So there is no geolocation code
 * here at all — both are shown, and choosing the checkout *is* the routing.
 *
 * The fixed $0.50 in Paddle's 5% + $0.50 is what makes a $1/month plan lose
 * more than half its revenue, so international monthly is priced at $2 and the
 * annual plan is the one that leads. India is percentage-only, so ₹99 survives.
 */
export const PLANS = {
  in: {
    region: 'India',
    currency: '₹',
    provider: 'razorpay',
    note: 'UPI Autopay or card · billed by Yogatik',
    monthly: { id: 'in_monthly', price: 99, label: '₹99', per: 'month' },
    yearly: { id: 'in_yearly', price: 999, label: '₹999', per: 'year', saveLabel: 'Save ₹189' },
  },
  intl: {
    region: 'International',
    currency: '$',
    provider: 'paddle',
    note: 'Card or PayPal · billed by Paddle, taxes included',
    monthly: { id: 'intl_monthly', price: 2, label: '$2', per: 'month' },
    yearly: { id: 'intl_yearly', price: 12, label: '$12', per: 'year', saveLabel: 'Save $12' },
  },
}

/**
 * Which pricing table to SHOW FIRST. A hint only — both are always reachable,
 * and the payment method decides what is actually charged. Guessing wrong
 * costs the user one click; guessing at all and then enforcing it would be the
 * mistake.
 */
export function suggestedRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'in'
    const lang = (navigator?.language || '').toLowerCase()
    if (lang.endsWith('-in')) return 'in'
  } catch { /* no Intl, no navigator — fall through */ }
  return 'intl'
}

export const CAPABILITY_COPY = {
  files: 'Read, write and search files on your computer',
  shell: 'Run terminal commands, dev servers and project scripts',
  browser: 'Drive a real browser the agent can see and click',
  control: 'Watch your screen natively and control mouse and keyboard',
  automation: 'Scheduled jobs and background sub-agents',
}
