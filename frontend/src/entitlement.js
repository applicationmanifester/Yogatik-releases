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
 * a render pass).
 *
 * ONE SUBSCRIPTION, TWO SURFACES. The subscription belongs to the ACCOUNT, not
 * to the machine: buy it on the website and the desktop app unlocks; buy it in
 * the desktop app and the website stops showing ads. Both read the same
 * `accounts/{uid}` document, which only the webhook writes.
 *
 * `locked` still means only one thing — "the desktop app must refuse privileged
 * IPC" — and stays FALSE on the web, because the web build has no privileged
 * tools to lock and gating there would remove features people already have for
 * free. What the web uses instead is `isPro()`, which is about what a paying
 * customer GAINS (no ads) rather than what a non-paying one loses.
 */
export function entitlement() {
  if (isUnrestrictedEdition()) return { ...snapshot, state: 'pro', edition: snapshot.edition || 'studio', locked: false }
  if (!isDesktopBuild()) return { ...snapshot, locked: false, surface: 'web' }
  return { ...snapshot, locked: isLocked(), surface: 'desktop' }
}

/**
 * Is this account on a paid plan right now?
 *
 * Deliberately NOT the inverse of `isLocked()`: a trial is unlocked but not
 * paid, so a trialling desktop user still sees ads on the website. Ads are the
 * free tier's price; the trial is a preview of Pro's capabilities, not of its
 * ad-free-ness.
 */
export function isPro() {
  if (isUnrestrictedEdition()) return true
  return snapshot.state === 'pro'
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

const DAY = 24 * 60 * 60 * 1000
const TRIAL_DAYS = 30

/**
 * Read the account's billing state directly from Firestore, for the web.
 *
 * There is no Cloud Function call here on purpose. `accounts/{uid}` is already
 * `allow read: if request.auth.uid == userId` and `allow write: if false`, so
 * the owner can read it and nobody — including this code — can forge it. A
 * signed licence token exists for the DESKTOP because the desktop enforces a
 * gate offline; the web enforces nothing, it only decides whether to draw an
 * advert, so a plain authenticated read is the right weight of mechanism.
 *
 * Mirrors functions/index.js `planFor()`. If those two ever disagree, the
 * server is right — this only decides what the page shows.
 */
export async function loadWebEntitlement() {
  if (isDesktopBuild() || isUnrestrictedEdition()) return entitlement()
  try {
    const { getFirebase } = await import('./firebaseAuth')
    const f = await getFirebase()
    const uid = f.auth?.currentUser?.uid
    // Signed out is a legitimate answer, not a failure: no account, no plan.
    if (!uid) return applyWeb({ state: 'free', reason: 'signed-out' })

    const snap = await f.getDoc(f.doc(f.db, 'accounts', uid))
    if (!snap.exists()) return applyWeb({ state: 'free', reason: 'no-account' })
    const acct = snap.data() || {}
    const now = Date.now()

    // A paid subscription always wins over a trial, including one that has not
    // expired — someone who paid early must not be downgraded on renewal.
    if (acct.plan === 'pro' && ['active', 'past_due'].includes(acct.status)) {
      return applyWeb({ state: 'pro', endsAt: Number(acct.currentPeriodEnd) || 0, reason: acct.status })
    }
    const trialEnd = Number(acct.trialStartedAt || 0) + TRIAL_DAYS * DAY
    if (acct.trialStartedAt && now < trialEnd) {
      return applyWeb({ state: 'trial', endsAt: trialEnd, reason: 'trialing' })
    }
    return applyWeb({ state: 'free', reason: 'expired' })
  } catch {
    // Offline, rules changed, Firebase unavailable — fail to the FREE side.
    // Failing open would hand out an ad-free experience to anyone who can make
    // a network request fail.
    return applyWeb({ state: 'free', reason: 'unavailable' })
  }
}

function applyWeb({ state, endsAt = 0, reason = '' }) {
  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / DAY)) : 0
  return apply({ success: true, state, edition: 'store', reason, endsAt, daysLeft })
}

/** Read the current state — from main on desktop, from Firestore on the web. */
export async function loadEntitlement() {
  const b = bridge()
  if (!b) return loadWebEntitlement()
  try { return apply(await b.get()) } catch { return entitlement() }
}

/**
 * Hand main the Firebase identity and pull a fresh licence.
 * Called after sign-in and on app focus. Main holds the ID token only in
 * memory — it is short-lived and re-supplied by the renderer each time.
 */
export async function refreshEntitlement({ idToken = null, uid = null } = {}) {
  const b = bridge()
  // On the web there is no main process to hand an identity to — the account
  // doc IS the state, so re-read it.
  if (!b) return loadWebEntitlement()
  // Fetch the ID token HERE when the caller did not supply one. Every call site
  // passed `userData?.idToken`, a field the auth layer has never produced, so
  // the token was always undefined and main's refresh() bailed at its guard —
  // no user could be licensed. Resolving it in one place means a new call site
  // cannot reintroduce that, and an ID token expires in an hour so fetching it
  // at use is more correct than carrying a copy from sign-in anyway.
  let token = idToken
  if (!token) {
    try {
      const { getIdToken } = await import('./firebaseAuth')
      token = await getIdToken()
    } catch { token = null }
  }
  try { return apply(await b.refresh({ idToken: token, uid })) } catch { return entitlement() }
}

export async function signOutEntitlement() {
  const b = bridge()
  // The subscription belongs to the account, so signing out must drop it here
  // too. Leaving the snapshot on `pro` would keep the next person at this
  // browser ad-free on someone else's subscription.
  if (!b) return applyWeb({ state: 'free', reason: 'signed-out' })
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
  // What counts as "the purchase landed" differs by surface, and testing
  // `!st.locked` on both is wrong: `locked` is always false on the web, so the
  // poll would report success the instant it started — before any payment.
  const arrived = (st) => (isDesktopBuild() ? !st.locked : st.state === 'pro')
  const tick = async () => {
    if (stop || n++ >= attempts) return
    const st = await refreshEntitlement({ idToken, uid })
    if (arrived(st)) { onUnlocked?.(st); return }
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
