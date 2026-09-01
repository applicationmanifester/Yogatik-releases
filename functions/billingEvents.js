/**
 * Pure translation from a provider webhook payload into a billing-history
 * record, or null when the event carries nothing worth a row (e.g. a bare
 * subscription.activated has no money attached to it). No firebase-admin
 * import — same PURE/impure split as entitlementCore.cjs/entitlement.cjs and
 * rootsCore.cjs/roots.cjs, and for the identical reason: this is the only
 * way the shaping logic is testable without a live emulator or real webhook
 * traffic. `now` is an explicit parameter, never read from Date.now()
 * internally, for the same reason timeline.js's video scenes compute
 * timestamps rather than sample the clock — a test has to be able to fix it.
 *
 * SCOPE DECISION: this does NOT generate an invoice PDF, and does not email
 * anything. Razorpay already emails its own receipt for every charge
 * (customer_notify:1, set at subscription creation in createSubscription),
 * and Paddle IS the merchant of record — correctly invoicing US sales tax /
 * EU VAT is the actual reason MONETIZATION.md §6.3 chose it over a raw
 * payment gateway, and it emails its own invoice on every transaction. "A
 * bill is generated and given to the customer" is therefore already true
 * today, from both providers, independent of anything in this file.
 *
 * What this file adds is TRACKING: turning each webhook into a row Yogatik
 * itself keeps and can show back to the user (frontend/src/billing.js reads
 * it), linking out to the provider's own hosted record when the webhook
 * payload actually carries one — and NEVER fabricating a receipt URL it
 * was not given. Building a second, Yogatik-branded PDF invoice pipeline on
 * top of two providers that already solve this correctly (tax jurisdiction,
 * currency, legal invoice numbering) would be reimplementing infrastructure
 * this app deliberately chose vendors to avoid owning — the same reasoning
 * CLAUDE.md's SCOPE DECISION notes use to reject every redundant repo.
 */

/**
 * Deterministic per-event id so a webhook retry (both providers retry on any
 * non-2xx response, and can double-deliver even after a 2xx) overwrites the
 * SAME row instead of appending a duplicate line to the customer's history.
 */
function dedupeKey(provider, id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200)
  return `${provider}_${safe || 'unknown'}`
}

const RAZORPAY_CHARGE_EVENTS = new Set(['subscription.charged'])
// `halted`, not `cancelled`, is the one CLAUDE.md already flags as the one
// people forget: a failing e-mandate halts rather than cancels. Both are
// tracked here as distinct row types so the history can say which happened.
const RAZORPAY_FAILURE_EVENTS = new Set(['subscription.halted'])
const RAZORPAY_CANCEL_EVENTS = new Set(['subscription.cancelled'])

/**
 * `evt` = the parsed Razorpay webhook body — already signature-verified by
 * the caller (razorpayWebhook does this before ever reaching this
 * function). Returns null for an event with nothing billing-relevant to
 * show, or when there is no uid to file it under (mirrors the existing "no
 * uid" early-return already in razorpayWebhook).
 */
function buildRazorpayBillingEvent(evt, now = Date.now()) {
  const sub = evt?.payload?.subscription?.entity
  if (!sub) return null
  const uid = sub?.notes?.uid
  if (!uid) return null

  const payment = evt?.payload?.payment?.entity || null
  const invoice = evt?.payload?.invoice?.entity || null

  if (RAZORPAY_CHARGE_EVENTS.has(evt.event) && payment) {
    return {
      uid,
      key: dedupeKey('razorpay', payment.id || `${evt.event}_${sub.id}`),
      record: {
        provider: 'razorpay',
        type: 'charge',
        status: payment.status || 'captured',
        // Razorpay amounts are already the smallest unit (paise) — never
        // divide or multiply here, that is a display-time formatting
        // concern only (frontend/src/billing.js).
        amount: Number(payment.amount) || 0,
        currency: payment.currency || 'INR',
        // Razorpay timestamps are SECONDS — the exact footgun CLAUDE.md
        // already documents for currentPeriodEnd (storing it as ms puts the
        // date in 1970). Everything stored here is milliseconds.
        occurredAt: payment.created_at ? Number(payment.created_at) * 1000 : now,
        periodStart: sub.current_start ? Number(sub.current_start) * 1000 : null,
        periodEnd: sub.current_end ? Number(sub.current_end) * 1000 : null,
        subscriptionId: sub.id || null,
        // Only set when Razorpay actually included an invoice entity on
        // this event — never constructed from an id.
        receiptUrl: invoice?.short_url || null,
      },
    }
  }

  if (RAZORPAY_FAILURE_EVENTS.has(evt.event)) {
    return {
      uid,
      key: dedupeKey('razorpay', `${evt.event}_${sub.id}_${sub.current_end || ''}`),
      record: {
        provider: 'razorpay',
        type: 'failed',
        status: sub.status || 'halted',
        amount: null,
        currency: null,
        occurredAt: now,
        periodStart: null,
        periodEnd: null,
        subscriptionId: sub.id || null,
        receiptUrl: null,
      },
    }
  }

  if (RAZORPAY_CANCEL_EVENTS.has(evt.event)) {
    return {
      uid,
      key: dedupeKey('razorpay', `${evt.event}_${sub.id}`),
      record: {
        provider: 'razorpay',
        type: 'cancelled',
        status: sub.status || 'cancelled',
        amount: null,
        currency: null,
        occurredAt: now,
        periodStart: null,
        periodEnd: null,
        subscriptionId: sub.id || null,
        receiptUrl: null,
      },
    }
  }

  return null
}

const PADDLE_CHARGE_EVENTS = new Set(['transaction.completed'])
const PADDLE_FAILURE_EVENTS = new Set(['transaction.payment_failed'])

/**
 * `evt` = the parsed Paddle webhook body — already signature-verified by
 * the caller. Paddle Billing represents totals as STRINGS already in the
 * smallest currency unit (e.g. "999" cents), so Number() on them is exact —
 * never a float division here either.
 */
function buildPaddleBillingEvent(evt, now = Date.now()) {
  const d = evt?.data
  if (!d) return null
  const uid = d?.custom_data?.uid
  if (!uid) return null

  const totalStr = d?.details?.totals?.grand_total ?? d?.details?.totals?.total
  const amount = totalStr != null ? Number(totalStr) : null

  if (PADDLE_CHARGE_EVENTS.has(evt.event_type)) {
    return {
      uid,
      key: dedupeKey('paddle', d.id),
      record: {
        provider: 'paddle',
        type: 'charge',
        status: d.status || 'completed',
        amount: Number.isFinite(amount) ? amount : 0,
        currency: d.currency_code || 'USD',
        occurredAt: d.billed_at ? Date.parse(d.billed_at) : now,
        periodStart: d?.billing_period?.starts_at ? Date.parse(d.billing_period.starts_at) : null,
        periodEnd: d?.billing_period?.ends_at ? Date.parse(d.billing_period.ends_at) : null,
        subscriptionId: d.subscription_id || null,
        // Paddle's hosted invoice PDF needs a SEPARATE authenticated call
        // (GET /transactions/{id}/invoice with PADDLE_API_KEY) this webhook
        // body cannot satisfy on its own — left null rather than guessed at
        // a URL shape. Paddle, as merchant of record, already emails its
        // own invoice regardless of whether Yogatik links to it.
        receiptUrl: null,
      },
    }
  }

  if (PADDLE_FAILURE_EVENTS.has(evt.event_type)) {
    return {
      uid,
      key: dedupeKey('paddle', d.id),
      record: {
        provider: 'paddle',
        type: 'failed',
        status: d.status || 'past_due',
        amount: Number.isFinite(amount) ? amount : 0,
        currency: d.currency_code || 'USD',
        occurredAt: now,
        periodStart: null,
        periodEnd: null,
        subscriptionId: d.subscription_id || null,
        receiptUrl: null,
      },
    }
  }

  return null
}

module.exports = { dedupeKey, buildRazorpayBillingEvent, buildPaddleBillingEvent }
