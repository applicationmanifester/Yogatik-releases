"use strict";
/**
 * Billing Events — Refactored
 *
 * Pure translation from provider webhook payload into billing-history record.
 * No firebase-admin import — pure/impure split for testability.
 * `now` is explicit parameter (never Date.now() internally) for deterministic tests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRazorpayBillingEvent = buildRazorpayBillingEvent;
exports.buildPaddleBillingEvent = buildPaddleBillingEvent;
exports.dedupeKey = dedupeKey;
const zod_1 = require("zod");
// ─────────────────────────────────────────────────────────────────────────────
// Schemas for input validation
// ─────────────────────────────────────────────────────────────────────────────
const RazorpayWebhookSchema = zod_1.z.object({
    event: zod_1.z.string(),
    payload: zod_1.z.object({
        subscription: zod_1.z.object({
            entity: zod_1.z.object({
                id: zod_1.z.string(),
                status: zod_1.z.string(),
                notes: zod_1.z.object({ uid: zod_1.z.string() }).optional(),
                current_end: zod_1.z.number().optional(),
                current_start: zod_1.z.number().optional(),
            }),
        }).optional(),
        payment: zod_1.z.object({
            entity: zod_1.z.object({
                id: zod_1.z.string(),
                amount: zod_1.z.number(),
                currency: zod_1.z.string(),
                status: zod_1.z.string(),
                created_at: zod_1.z.number(),
            }),
        }).optional(),
        invoice: zod_1.z.object({
            entity: zod_1.z.object({
                short_url: zod_1.z.string().optional(),
            }),
        }).optional(),
    }).optional(),
});
const PaddleWebhookSchema = zod_1.z.object({
    event_type: zod_1.z.string(),
    data: zod_1.z.object({
        id: zod_1.z.string(),
        custom_data: zod_1.z.object({ uid: zod_1.z.string() }).optional(),
        status: zod_1.z.string().optional(),
        customer_id: zod_1.z.string().optional(),
        subscription_id: zod_1.z.string().optional(),
        currency_code: zod_1.z.string().optional(),
        current_billing_period: zod_1.z.object({
            ends_at: zod_1.z.string().optional(),
        }).optional(),
        details: zod_1.z.object({
            totals: zod_1.z.object({
                grand_total: zod_1.z.string().optional(),
                total: zod_1.z.string().optional(),
            }).optional(),
        }).optional(),
        billing_period: zod_1.z.object({
            starts_at: zod_1.z.string().optional(),
            ends_at: zod_1.z.string().optional(),
        }).optional(),
        billed_at: zod_1.z.string().optional(),
    }).optional(),
});
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const RAZORPAY_CHARGE_EVENTS = new Set(['subscription.charged']);
const RAZORPAY_FAILURE_EVENTS = new Set(['subscription.halted']);
const RAZORPAY_CANCEL_EVENTS = new Set(['subscription.cancelled']);
const PADDLE_CHARGE_EVENTS = new Set(['transaction.completed']);
const PADDLE_FAILURE_EVENTS = new Set(['transaction.payment_failed']);
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function dedupeKey(provider, id) {
    const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
    return `${provider}_${safe || 'unknown'}`;
}
function parseRazorpayTimestamp(seconds) {
    return seconds ? seconds * 1000 : Date.now();
}
// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Event Builder
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Translates a verified Razorpay webhook into a billing history record.
 * Returns null for events that carry no billing-relevant information.
 */
function buildRazorpayBillingEvent(evt, now = Date.now()) {
    const parsed = RazorpayWebhookSchema.safeParse(evt);
    if (!parsed.success)
        return null;
    const { event, payload } = parsed.data;
    const sub = payload?.subscription?.entity;
    if (!sub)
        return null;
    const uid = sub.notes?.uid;
    if (!uid)
        return null;
    const payment = payload?.payment?.entity;
    const invoice = payload?.invoice?.entity;
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
        };
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
        };
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
        };
    }
    // Events like subscription.activated, subscription.authenticated, subscription.resumed
    // carry no money — they don't generate a billing row
    return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Paddle Event Builder
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Translates a verified Paddle webhook into a billing history record.
 * Paddle amounts are strings in smallest currency unit (e.g., "999" cents).
 */
function buildPaddleBillingEvent(evt, now = Date.now()) {
    const parsed = PaddleWebhookSchema.safeParse(evt);
    if (!parsed.success)
        return null;
    const { event_type, data } = parsed.data;
    if (!data)
        return null;
    const uid = data.custom_data?.uid;
    if (!uid)
        return null;
    // Parse amount (Paddle sends totals as strings in smallest unit)
    const totalStr = data.details?.totals?.grand_total ?? data.details?.totals?.total;
    const amount = totalStr != null ? Number(totalStr) : null;
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
        };
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
        };
    }
    // Other events (subscription.created, subscription.updated, etc.) don't generate billing rows
    return null;
}
//# sourceMappingURL=billingEvents.js.map