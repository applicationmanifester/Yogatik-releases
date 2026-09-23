import { describe, it, expect, vi } from 'vitest'
import { buildRazorpayBillingEvent, buildPaddleBillingEvent, dedupeKey } from './billingEvents'

describe('billingEvents', () => {
  const NOW = 1700000000000 // Fixed timestamp for deterministic tests

  describe('dedupeKey', () => {
    it('generates consistent keys for same input', () => {
      expect(dedupeKey('razorpay', 'pay_123')).toBe('razorpay_pay_123')
      expect(dedupeKey('paddle', 'txn_456')).toBe('paddle_txn_456')
    })

    it('sanitizes special characters', () => {
      expect(dedupeKey('razorpay', 'pay/123?abc')).toBe('razorpay_pay_123_abc')
    })

    it('handles empty/undefined ids', () => {
      expect(dedupeKey('razorpay', '')).toBe('razorpay_unknown')
      expect(dedupeKey('razorpay', undefined as any)).toBe('razorpay_unknown')
    })

    it('truncates long ids', () => {
      const longId = 'a'.repeat(300)
      expect(dedupeKey('razorpay', longId).length).toBeLessThanOrEqual(200 + 9) // provider_ + 200
    })
  })

  describe('buildRazorpayBillingEvent', () => {
    const baseEvent = {
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: {
            id: 'sub_123',
            status: 'active',
            notes: { uid: 'user_456' },
            current_end: 1735689600, // seconds
            current_start: 1733097600,
          },
        },
        payment: {
          entity: {
            id: 'pay_789',
            amount: 99900, // paise
            currency: 'INR',
            status: 'captured',
            created_at: 1700000000, // seconds
          },
        },
        invoice: {
          entity: {
            short_url: 'https://rzp.io/i/test123',
          },
        },
      },
    }

    it('builds charge record for subscription.charged with payment', () => {
      const result = buildRazorpayBillingEvent(baseEvent, NOW)

      expect(result).not.toBeNull()
      expect(result!.uid).toBe('user_456')
      expect(result!.key).toBe('razorpay_pay_789')
      expect(result!.record.provider).toBe('razorpay')
      expect(result!.record.type).toBe('charge')
      expect(result!.record.amount).toBe(99900)
      expect(result!.record.currency).toBe('INR')
      expect(result!.record.occurredAt).toBe(1700000000000) // converted to ms
      expect(result!.record.periodStart).toBe(1733097600000)
      expect(result!.record.periodEnd).toBe(1735689600000)
      expect(result!.record.receiptUrl).toBe('https://rzp.io/i/test123')
    })

    it('returns null for events without subscription', () => {
      const result = buildRazorpayBillingEvent({ event: 'subscription.charged', payload: {} }, NOW)
      expect(result).toBeNull()
    })

    it('returns null for events without uid in notes', () => {
      const event = { ...baseEvent, payload: { ...baseEvent.payload, subscription: { entity: { ...baseEvent.payload.subscription.entity, notes: {} } } } }
      const result = buildRazorpayBillingEvent(event, NOW)
      expect(result).toBeNull()
    })

    it('builds failed record for subscription.halted', () => {
      const haltedEvent = { ...baseEvent, event: 'subscription.halted' }
      const result = buildRazorpayBillingEvent(haltedEvent, NOW)

      expect(result).not.toBeNull()
      expect(result!.record.type).toBe('failed')
      expect(result!.record.amount).toBeNull()
      expect(result!.record.occurredAt).toBe(NOW)
    })

    it('builds cancelled record for subscription.cancelled', () => {
      const cancelledEvent = { ...baseEvent, event: 'subscription.cancelled' }
      const result = buildRazorpayBillingEvent(cancelledEvent, NOW)

      expect(result).not.toBeNull()
      expect(result!.record.type).toBe('cancelled')
    })

    it('returns null for subscription.activated (no money)', () => {
      const activatedEvent = { ...baseEvent, event: 'subscription.activated' }
      const result = buildRazorpayBillingEvent(activatedEvent, NOW)
      expect(result).toBeNull()
    })

    it('handles missing payment gracefully for charge event', () => {
      const event = { ...baseEvent, payload: { ...baseEvent.payload, payment: undefined } }
      const result = buildRazorpayBillingEvent(event, NOW)
      expect(result).toBeNull()
    })

    it('rejects charge event when payment id missing (malformed data)', () => {
      const event = {
        ...baseEvent,
        payload: { ...baseEvent.payload, payment: { entity: { ...baseEvent.payload.payment.entity, id: undefined } } }
      }
      // A payment without an id is malformed — the schema rejects the whole
      // event rather than fabricating a key from partial data.
      const result = buildRazorpayBillingEvent(event, NOW)
      expect(result).toBeNull()
    })
  })

  describe('buildPaddleBillingEvent', () => {
    const baseEvent = {
      event_type: 'transaction.completed',
      data: {
        id: 'txn_abc',
        custom_data: { uid: 'user_789' },
        status: 'completed',
        customer_id: 'ctm_123',
        subscription_id: 'sub_456',
        currency_code: 'USD',
        billed_at: '2024-01-15T10:30:00Z',
        details: {
          totals: {
            grand_total: '2999', // cents as string
          },
        },
        billing_period: {
          starts_at: '2024-01-01T00:00:00Z',
          ends_at: '2024-02-01T00:00:00Z',
        },
      },
    }

    it('builds charge record for transaction.completed', () => {
      const result = buildPaddleBillingEvent(baseEvent, NOW)

      expect(result).not.toBeNull()
      expect(result!.uid).toBe('user_789')
      expect(result!.key).toBe('paddle_txn_abc')
      expect(result!.record.provider).toBe('paddle')
      expect(result!.record.type).toBe('charge')
      expect(result!.record.amount).toBe(2999)
      expect(result!.record.currency).toBe('USD')
      expect(result!.record.occurredAt).toBe(Date.parse('2024-01-15T10:30:00Z'))
      expect(result!.record.periodStart).toBe(Date.parse('2024-01-01T00:00:00Z'))
      expect(result!.record.periodEnd).toBe(Date.parse('2024-02-01T00:00:00Z'))
    })

    it('falls back to total when grand_total missing', () => {
      const event = {
        ...baseEvent,
        data: { ...baseEvent.data, details: { totals: { total: '1999' } } },
      }
      const result = buildPaddleBillingEvent(event, NOW)
      expect(result!.record.amount).toBe(1999)
    })

    it('builds failed record for transaction.payment_failed', () => {
      const failedEvent = { ...baseEvent, event_type: 'transaction.payment_failed' }
      const result = buildPaddleBillingEvent(failedEvent, NOW)

      expect(result).not.toBeNull()
      expect(result!.record.type).toBe('failed')
      expect(result!.record.occurredAt).toBe(NOW)
    })

    it('returns null for events without data', () => {
      const result = buildPaddleBillingEvent({ event_type: 'transaction.completed', data: undefined }, NOW)
      expect(result).toBeNull()
    })

    it('returns null for events without uid', () => {
      const event = { ...baseEvent, data: { ...baseEvent.data, custom_data: {} } }
      const result = buildPaddleBillingEvent(event, NOW)
      expect(result).toBeNull()
    })

    it('returns null for subscription.created (no money)', () => {
      const event = { ...baseEvent, event_type: 'subscription.created' }
      const result = buildPaddleBillingEvent(event, NOW)
      expect(result).toBeNull()
    })

    it('handles missing billed_at gracefully', () => {
      const event = { ...baseEvent, data: { ...baseEvent.data, billed_at: undefined } }
      const result = buildPaddleBillingEvent(event, NOW)
      expect(result!.record.occurredAt).toBe(NOW)
    })
  })
})