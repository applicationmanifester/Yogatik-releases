/**
 * Billing Events — Refactored
 *
 * Pure translation from provider webhook payload into billing-history record.
 * No firebase-admin import — pure/impure split for testability.
 * `now` is explicit parameter (never Date.now() internally) for deterministic tests.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Schemas for input validation
// ─────────────────────────────────────────────────────────────────────────────

const RazorpayWebhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string(),
        status: z.string(),
        notes: z.object({ uid: z.string() }).optional(),
        current_end: z.number().optional(),
        current_start: z.number().optional(),
      }),
    }).optional(),
    payment: z.object({
      entity: z.object({
        id: z.string(),
        amount: z.number(),
        currency: z.string(),
        status: z.string(),
        created_at: z.number(),
      }),
    }).optional(),
    invoice: z.object({
      entity: z.object({
        short_url: z.string().optional(),
      }),
    }).optional(),
  }).optional(),
})

const PaddleWebhookSchema = z.object({
  event_type: z.string(),
  data: z.object({
    id: z.string(),
    custom_data: z.object({ uid: z.string() }).optional(),
    status: z.string().optional(),
    customer_id: z.string().optional(),
    subscription_id: z.string().optional(),
    currency_code: z.string().optional(),
    current_billing_period: z.object({
      ends_at: z.string().optional(),
    }).optional(),
    details: z.object({
      totals: z.object({
        grand_total: z.string().optional(),
        total: z.string().optional(),
      }).optional(),
    }).optional(),
    billing_period: z.object({
      starts_at: z.string().optional(),
      ends_at: z.string().optional(),
    }).optional(),
    billed_at: z.string().optional(),
  }).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const RAZORPAY_CHARGE_EVENTS = new Set(['subscription.charged'])
const RAZORPAY_FAILURE_EVENTS = new Set(['subscription.halted'])
const RAZORPAY_CANCEL_EVENTS = new Set(['subscription.cancelled'])

const PADDLE_CHARGE_EVENTS = new Set(['transaction.completed'])
const PADDLE_FAILURE_EVENTS = new Set(['transaction.payment_failed'])

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingRecord {
  provider: 'razorpay' | 'paddle'
  type: 'charge' | 'failed' | 'cancelled'
  status: string
  amount: number | null
  currency: string | null
  occurredAt: number
  periodStart: number | null
  periodEnd: number | null
  subscriptionId: string | null
  receiptUrl: string | null
}

export interface BillingEventResult {
  uid: string
  key: string
  record: BillingRecord
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function dedupeKey(provider: string, id: string): string {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200)
  return `${provider}_${safe || 'unknown'}`
}

function parseRazorpayTimestamp(seconds: number | undefined): number {
  return seconds ? seconds * 1000 : Date.now()
}

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Event Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translates a verified Razorpay webhook into a billing history record.
 * Returns null for events that carry no billing-relevant information.
 */
export function buildRazorpayBillingEvent(
  evt: unknown,
  now: number = Date.now()
): BillingEventResult | null {
  const parsed = RazorpayWebhookSchema.safeParse(evt)
  if (!parsed.success) return null

  const { event, payload } = parsed.data
  const sub = payload?.subscription?.entity
  if (!sub) return null

  const uid = sub.notes?.uid
  if (!uid) return null

  const payment = payload?.payment?.entity
  const invoice = payload?.invoice?.entity

  // Charge event (successful payment)
  if (RAZORPAY_CHARGE_EVENTS.has(event) && payment) {
    return {
      uid,
      key: dedupeKey('razorpay', payment.id || `${event}_${sub.id}`),
      record: {
        provider: 'razorpay',
        type: 'charge',
        status: payment.status || 'captured',
        // Amounts are in smallest unit (paise) — no conversion here
        amount: Number(payment.amount) || 0,
        currency: payment.currency || 'INR',
        occurredAt: parseRazorpayTimestamp(payment.created_at),
        periodStart: sub.current_start ? sub.current_start * 1000 : null,
        periodEnd: sub.current_end ? sub.current_end * 1000 : null,
        subscriptionId: sub.id || null,
        receiptUrl: invoice?.short_url || null,
      },
    }
  }

  // Failure event (halted = e-mandate failed repeatedly)
  if (RAZORPAY_FAILURE_EVENTS.has(event)) {
    return {
      uid,
      key: dedupeKey('razorpay', `${event}_${sub.id}_${sub.current_end || ''}`),
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

  // Cancellation event
  if (RAZORPAY_CANCEL_EVENTS.has(event)) {
    return {
      uid,
      key: dedupeKey('razorpay', `${event}_${sub.id}`),
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

  // Events like subscription.activated, subscription.authenticated, subscription.resumed
  // carry no money — they don't generate a billing row
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Paddle Event Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translates a verified Paddle webhook into a billing history record.
 * Paddle amounts are strings in smallest currency unit (e.g., "999" cents).
 */
export function buildPaddleBillingEvent(
  evt: unknown,
  now: number = Date.now()
): BillingEventResult | null {
  const parsed = PaddleWebhookSchema.safeParse(evt)
  if (!parsed.success) return null

  const { event_type, data } = parsed.data
  if (!data) return null

  const uid = data.custom_data?.uid
  if (!uid) return null

  // Parse amount (Paddle sends totals as strings in smallest unit)
  const totalStr = data.details?.totals?.grand_total ?? data.details?.totals?.total
  const amount = totalStr != null ? Number(totalStr) : null

  // Successful transaction
  if (PADDLE_CHARGE_EVENTS.has(event_type)) {
    return {
      uid,
      key: dedupeKey('paddle', data.id),
      record: {
        provider: 'paddle',
        type: 'charge',
        status: data.status || 'completed',
        amount: Number.isFinite(amount) ? amount : 0,
        currency: data.currency_code || 'USD',
        occurredAt: data.billed_at ? Date.parse(data.billed_at) : now,
        periodStart: data.billing_period?.starts_at ? Date.parse(data.billing_period.starts_at) : null,
        periodEnd: data.billing_period?.ends_at ? Date.parse(data.billing_period.ends_at) : null,
        subscriptionId: data.subscription_id || null,
        // Paddle's hosted invoice PDF requires separate authenticated API call
        receiptUrl: null,
      },
    }
  }

  // Failed payment
  if (PADDLE_FAILURE_EVENTS.has(event_type)) {
    return {
      uid,
      key: dedupeKey('paddle', data.id),
      record: {
        provider: 'paddle',
        type: 'failed',
        status: data.status || 'past_due',
        amount: Number.isFinite(amount) ? amount : 0,
        currency: data.currency_code || 'USD',
        occurredAt: now,
        periodStart: null,
        periodEnd: null,
        subscriptionId: data.subscription_id || null,
        receiptUrl: null,
      },
    }
  }

  // Other events (subscription.created, subscription.updated, etc.) don't generate billing rows
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export { dedupeKey }