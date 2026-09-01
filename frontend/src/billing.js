// Billing history — read side.
//
// The account's current plan already has a home (entitlement.js /
// loadWebEntitlement, which mirrors functions/index.js's planFor()). This
// file adds the thing that did not exist: a per-charge HISTORY, read from
// the accounts/{uid}/billingEvents subcollection functions/billingEvents.js
// writes on every relevant Razorpay/Paddle webhook.
//
// Same "the web reads Firestore directly, no Cloud Function round trip"
// reasoning as loadWebEntitlement: accounts/{uid}/billingEvents/{id} is
// `allow read: if request.auth.uid == userId`, `allow write: if false` (see
// firestore.rules), so the owner's own authenticated read is the right
// weight of mechanism — nothing here can forge a row, and nothing here needs
// to.
//
// SCOPE DECISION (see functions/billingEvents.js for the fuller version):
// this reads what the providers already generate. Razorpay emails its own
// receipt per charge (customer_notify:1) and Paddle, as merchant of record,
// emails its own invoice — this page is TRACKING, not a second invoicing
// pipeline. `receiptUrl` links out to the provider's own hosted record when
// the webhook payload carried one; it is never constructed here.

const DAY = 24 * 60 * 60 * 1000
const TRIAL_DAYS = 30

/**
 * Format a smallest-unit amount (paise for INR, cents for USD — both 2-
 * decimal currencies, the only two this app ever charges in) as a localised
 * currency string. Returns '—' for a null/undefined amount rather than
 * "$0.00" — those are different facts (no charge on this row vs. a $0
 * charge) and must not read the same.
 */
export function formatAmount(amount, currency) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code })
      .format(Number(amount) / 100)
  } catch {
    // An unrecognised currency code throws rather than degrading — fall back
    // to a plain number so the row still shows something.
    return `${(Number(amount) / 100).toFixed(2)} ${code}`
  }
}

const TYPE_LABEL = {
  charge: 'Charge',
  failed: 'Payment failed',
  cancelled: 'Subscription cancelled',
}

const PROVIDER_LABEL = { razorpay: 'Razorpay', paddle: 'Paddle' }

/**
 * Turn one billingEvents row into what the UI actually renders: a label, a
 * status colour class, and the formatted amount. Pure and side-effect free
 * so it is testable without touching Firestore.
 */
export function describeEvent(evt = {}) {
  const label = TYPE_LABEL[evt.type] || 'Billing event'
  const provider = PROVIDER_LABEL[evt.provider] || evt.provider || 'Unknown'
  const tone = evt.type === 'charge' ? 'ok' : evt.type === 'failed' ? 'err' : 'neutral'
  return {
    label,
    provider,
    tone,
    amountText: formatAmount(evt.amount, evt.currency),
    hasReceipt: !!evt.receiptUrl,
  }
}

const bridge = () => (typeof window !== 'undefined' && window.__YOGATIK_DESKTOP__) || null

/**
 * Open a provider-hosted receipt/invoice link. Never inside the app's own
 * window — the same "never host provider pages in a webview" rule
 * UpgradeModal's checkout flow already follows, extended to a plain link:
 * desktop uses shell.openExternal via the existing FREE_ALWAYS bridge, web
 * opens a real tab.
 */
export function openReceipt(url) {
  if (!url) return
  const b = bridge()
  if (b?.openExternal) { try { b.openExternal(url); return } catch { /* fall through */ } }
  try { window.open(url, '_blank', 'noopener') } catch { /* popup blocked */ }
}

/**
 * Read the account's current plan snapshot + its billing history, straight
 * from Firestore. Returns a stable shape on every path — signed out, no
 * account yet, or a read failure all resolve to an empty-but-valid result
 * rather than throwing, so the panel never has to special-case "did this
 * work" beyond checking `error`.
 */
export async function loadBillingHistory({ limit = 50 } = {}) {
  const empty = { account: null, events: [], error: null }
  try {
    const { getFirebase } = await import('./firebaseAuth')
    const f = await getFirebase()
    const uid = f.auth?.currentUser?.uid
    if (!uid) return { ...empty, error: 'signed-out' }

    const acctSnap = await f.getDoc(f.doc(f.db, 'accounts', uid))
    const acct = acctSnap.exists() ? acctSnap.data() : null

    const now = Date.now()
    const trialEnd = acct?.trialStartedAt ? Number(acct.trialStartedAt) + TRIAL_DAYS * DAY : 0
    const periodEnd = Number(acct?.currentPeriodEnd) || 0
    const isPaidPeriodValid = periodEnd > now
    const isDirectlyActive = ['active', 'authenticated', 'past_due'].includes(acct?.status)
    const isPro = (acct?.plan === 'pro' || isPaidPeriodValid) && (isPaidPeriodValid || isDirectlyActive)

    const account = acct ? {
      plan: isPro
        ? 'pro'
        : (acct.trialStartedAt && now < trialEnd ? 'trial' : 'free'),
      status: acct.status || null,
      provider: acct.provider || null,
      subscriptionId: acct.subscriptionId || null,
      currentPeriodEnd: periodEnd,
      trialEndsAt: trialEnd || 0,
    } : null

    const q = f.query(
      f.collection(f.db, 'accounts', uid, 'billingEvents'),
      f.orderBy('occurredAt', 'desc'),
      f.limit(limit),
    )
    const evSnap = await f.getDocs(q)
    const events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    return { account, events, error: null }
  } catch (e) {
    // Offline, rules changed, no Firestore index yet on a brand-new
    // deployment — fail to an empty-but-honest result, never throw into the
    // caller. Same "fail closed, say why" shape as loadWebEntitlement.
    return { ...empty, error: e?.message || 'unavailable' }
  }
}
