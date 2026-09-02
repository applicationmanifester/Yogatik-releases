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

const DAY = 24 * 60 * 60 * 1000
const TRIAL_DAYS = 30
const ENTITLEMENT_CACHE_KEY = 'yogatik_entitlement_v1'

function getInitialSnapshot() {
  if (isStudioEnv) {
    return {
      state: 'pro',
      edition: 'studio',
      reason: 'studio-edition',
      endsAt: 0,
      daysLeft: 0,
      loaded: true,
    }
  }

  // Fast optimistic load from localStorage for instant 0ms render on refresh/revisit
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(ENTITLEMENT_CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw)
        const now = Date.now()
        const endsAt = Number(cached?.endsAt) || 0
        if (cached?.state === 'pro' && (endsAt === 0 || endsAt > now)) {
          return {
            state: 'pro',
            edition: cached.edition || 'store',
            reason: cached.reason || 'cached-pro',
            endsAt,
            daysLeft: endsAt > now ? Math.max(0, Math.ceil((endsAt - now) / DAY)) : 0,
            loaded: true,
          }
        }
      }
    } catch {}
  }

  return {
    state: 'anonymous',
    edition: 'store',
    reason: 'boot',
    endsAt: 0,
    daysLeft: 0,
    loaded: false,
  }
}

/** Last known state. Synchronously populated from cache or studio flag. */
let snapshot = getInitialSnapshot()

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
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (next.state === 'pro') {
        window.localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify({
          state: next.state,
          edition: next.edition,
          endsAt: next.endsAt,
          reason: next.reason,
          cachedAt: Date.now(),
        }))
      } else if (next.state === 'free' || next.state === 'locked') {
        window.localStorage.removeItem(ENTITLEMENT_CACHE_KEY)
      }
    } catch {}
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
    let user = f.auth?.currentUser
    if (!user && f.auth && typeof f.onAuthStateChanged === 'function') {
      // If auth hasn't finished reading indexedDB yet, wait for session resolution
      user = await new Promise(resolve => {
        let done = false
        const stop = f.onAuthStateChanged(f.auth, u => {
          if (done) return
          done = true
          if (typeof stop === 'function') stop()
          resolve(u)
        })
        setTimeout(() => {
          if (done) return
          done = true
          if (typeof stop === 'function') stop()
          resolve(f.auth?.currentUser || null)
        }, 1500)
      })
    }
    const uid = user?.uid
    // Signed out is a legitimate answer, not a failure: no account, no plan.
    if (!uid) return applyWeb({ state: 'free', reason: 'signed-out' })

    const snap = await f.getDoc(f.doc(f.db, 'accounts', uid))
    if (!snap.exists()) return applyWeb({ state: 'free', reason: 'no-account' })
    const acct = snap.data() || {}
    const now = Date.now()

    // A paid subscription grants Pro access for the entire paid duration.
    // If the user paid for a month/year and cancelled recurring billing,
    // they retain Pro until currentPeriodEnd.
    const periodEnd = Number(acct.currentPeriodEnd) || 0
    const isPaidPeriodValid = periodEnd > now
    const isDirectlyActive = ['active', 'authenticated', 'past_due'].includes(acct.status)

    if ((acct.plan === 'pro' || isPaidPeriodValid) && (isPaidPeriodValid || isDirectlyActive)) {
      return applyWeb({
        state: 'pro',
        endsAt: periodEnd,
        reason: isPaidPeriodValid && !isDirectlyActive ? 'cancelled-active-until-period-end' : (acct.status || 'active'),
      })
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
 * The signed-in user's Paddle customer id (ctm_...), for Paddle Retain's
 * `pwCustomer` — NOT threaded through the entitlement snapshot above on
 * purpose. That snapshot is a narrow, load-bearing shape shared verbatim by
 * the desktop main-process licence check and the web Firestore read, and
 * both already agree on exactly what a licence answer looks like; growing
 * it for one Paddle-specific field would mean the desktop path either grows
 * a field it can never populate (its licence token carries no customer id)
 * or the two paths quietly disagree on shape. This is a separate, plain
 * read of the same document instead.
 *
 * Checkout always opens in the real browser (never a webview — see
 * UpgradeModal), so this is one code path for both platforms.
 *
 * Returns null for a first-time buyer (nothing has ever written it yet —
 * only a Paddle webhook does, and only after a first purchase), for a
 * signed-out user, or on any read failure. All three are legitimate "don't
 * prefill pwCustomer" answers, never surfaced as an error — a failure here
 * must not block checkout, only leave it slightly less personalised.
 */
export async function getPaddleCustomerId(uid) {
  if (!uid) return null
  try {
    const { getFirebase } = await import('./firebaseAuth')
    const f = await getFirebase()
    const snap = await f.getDoc(f.doc(f.db, 'accounts', uid))
    return snap.exists() ? (snap.data()?.customerId || null) : null
  } catch {
    return null
  }
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
      token = await getIdToken({ forceRefresh: false })
    } catch { token = null }
  }
  try { return apply(await b.refresh({ idToken: token, uid })) } catch { return entitlement() }
}

export async function signOutEntitlement() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try { window.localStorage.removeItem(ENTITLEMENT_CACHE_KEY) } catch {}
  }
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
 * more than half its revenue, so international monthly is priced at $9 and the
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
    // $9/$99, not $2/$12. Paddle takes 5% + a FIXED $0.50, which ate a quarter
    // of a $2 charge before anything else — and $2/month needs ~50,000 paying
    // customers to reach $1.2M ARR where $9 needs ~11,000. The annual plan is
    // twelve months for the price of eleven, which is also two fewer chances
    // for a card to decline.
    //
    // India stays at ₹99/₹999: it is priced for its market, Razorpay is
    // percentage-only with no fixed fee, and UPI Autopay makes small recurring
    // amounts viable there in a way cards do not.
    monthly: { id: 'intl_monthly', price: 9.99, label: '$9.99', per: 'month' },
    yearly: { id: 'intl_yearly', price: 99.99, label: '$99.99', per: 'year', saveLabel: 'Save $19.89' },
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
