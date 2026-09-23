/**
 * Billing Events — Refactored
 *
 * Pure translation from provider webhook payload into billing-history record.
 * No firebase-admin import — pure/impure split for testability.
 * `now` is explicit parameter (never Date.now() internally) for deterministic tests.
 */
export interface BillingRecord {
    provider: 'razorpay' | 'paddle';
    type: 'charge' | 'failed' | 'cancelled';
    status: string;
    amount: number | null;
    currency: string | null;
    occurredAt: number;
    periodStart: number | null;
    periodEnd: number | null;
    subscriptionId: string | null;
    receiptUrl: string | null;
}
export interface BillingEventResult {
    uid: string;
    key: string;
    record: BillingRecord;
}
declare function dedupeKey(provider: string, id: string): string;
/**
 * Translates a verified Razorpay webhook into a billing history record.
 * Returns null for events that carry no billing-relevant information.
 */
export declare function buildRazorpayBillingEvent(evt: unknown, now?: number): BillingEventResult | null;
/**
 * Translates a verified Paddle webhook into a billing history record.
 * Paddle amounts are strings in smallest currency unit (e.g., "999" cents).
 */
export declare function buildPaddleBillingEvent(evt: unknown, now?: number): BillingEventResult | null;
export { dedupeKey };
//# sourceMappingURL=billingEvents.d.ts.map