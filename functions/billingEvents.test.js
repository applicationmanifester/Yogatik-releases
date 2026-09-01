const { dedupeKey, buildRazorpayBillingEvent, buildPaddleBillingEvent } = require('./billingEvents')

describe('billingEvents.dedupeKey', () => {
  it('is stable for the same id and namespaced per provider', () => {
    expect(dedupeKey('razorpay', 'pay_ABC123')).toBe('razorpay_pay_ABC123')
    expect(dedupeKey('paddle', 'txn_ABC123')).toBe('paddle_txn_ABC123')
    expect(dedupeKey('razorpay', 'pay_ABC123')).not.toBe(dedupeKey('paddle', 'pay_ABC123'))
  })

  it('sanitises characters Firestore doc ids reject and never produces an empty segment', () => {
    expect(dedupeKey('razorpay', 'pay/with/slashes')).toBe('razorpay_pay_with_slashes')
    expect(dedupeKey('razorpay', '')).toBe('razorpay_unknown')
    expect(dedupeKey('razorpay', null)).toBe('razorpay_unknown')
  })
})

describe('buildRazorpayBillingEvent', () => {
  const NOW = 1_700_000_000_000

  it('turns subscription.charged + payment.entity into a charge row, amounts untouched', () => {
    const evt = {
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: {
            id: 'sub_1', notes: { uid: 'uid1' },
            current_start: 1_699_000_000, current_end: 1_701_000_000,
          },
        },
        payment: {
          entity: { id: 'pay_1', amount: 9900, currency: 'INR', status: 'captured', created_at: 1_699_000_050 },
        },
      },
    }
    const out = buildRazorpayBillingEvent(evt, NOW)
    expect(out.uid).toBe('uid1')
    expect(out.key).toBe('razorpay_pay_1')
    expect(out.record).toMatchObject({
      provider: 'razorpay', type: 'charge', status: 'captured',
      amount: 9900, currency: 'INR', subscriptionId: 'sub_1',
    })
    // Razorpay timestamps are SECONDS in the payload — this must be ms.
    expect(out.record.occurredAt).toBe(1_699_000_050 * 1000)
    expect(out.record.periodStart).toBe(1_699_000_000 * 1000)
    expect(out.record.periodEnd).toBe(1_701_000_000 * 1000)
    expect(out.record.receiptUrl).toBeNull()
  })

  it('carries the invoice short_url through when Razorpay includes one, never fabricates one when absent', () => {
    const withInvoice = {
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_1', notes: { uid: 'uid1' } } },
        payment: { entity: { id: 'pay_1', amount: 9900, currency: 'INR' } },
        invoice: { entity: { short_url: 'https://rzp.io/i/abc123' } },
      },
    }
    expect(buildRazorpayBillingEvent(withInvoice, NOW).record.receiptUrl).toBe('https://rzp.io/i/abc123')

    const without = {
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_1', notes: { uid: 'uid1' } } },
        payment: { entity: { id: 'pay_1', amount: 9900, currency: 'INR' } },
      },
    }
    expect(buildRazorpayBillingEvent(without, NOW).record.receiptUrl).toBeNull()
  })

  it('subscription.halted becomes a "failed" row with no amount, distinct from cancelled', () => {
    const halted = {
      event: 'subscription.halted',
      payload: { subscription: { entity: { id: 'sub_1', notes: { uid: 'uid1' }, status: 'halted' } } },
    }
    const out = buildRazorpayBillingEvent(halted, NOW)
    expect(out.record.type).toBe('failed')
    expect(out.record.amount).toBeNull()
    expect(out.record.occurredAt).toBe(NOW)
  })

  it('subscription.cancelled becomes a "cancelled" row', () => {
    const cancelled = {
      event: 'subscription.cancelled',
      payload: { subscription: { entity: { id: 'sub_1', notes: { uid: 'uid1' }, status: 'cancelled' } } },
    }
    expect(buildRazorpayBillingEvent(cancelled, NOW).record.type).toBe('cancelled')
  })

  it('returns null for an event with no billing-relevant row (e.g. bare activation)', () => {
    const activated = {
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_1', notes: { uid: 'uid1' } } } },
    }
    expect(buildRazorpayBillingEvent(activated, NOW)).toBeNull()
  })

  it('returns null when there is no uid to file the row under, mirroring the webhook\'s own guard', () => {
    const noUid = {
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_1', notes: {} } },
        payment: { entity: { id: 'pay_1', amount: 9900 } },
      },
    }
    expect(buildRazorpayBillingEvent(noUid, NOW)).toBeNull()
  })

  it('returns null for a malformed/empty payload rather than throwing', () => {
    expect(buildRazorpayBillingEvent({}, NOW)).toBeNull()
    expect(buildRazorpayBillingEvent(null, NOW)).toBeNull()
    expect(buildRazorpayBillingEvent(undefined, NOW)).toBeNull()
  })

  it('a charged event with no payment.entity produces no row rather than a zero-amount lie', () => {
    const noPayment = {
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_1', notes: { uid: 'uid1' } } } },
    }
    expect(buildRazorpayBillingEvent(noPayment, NOW)).toBeNull()
  })
})

describe('buildPaddleBillingEvent', () => {
  const NOW = 1_700_000_000_000

  it('turns transaction.completed into a charge row, amount read from a string total exactly', () => {
    const evt = {
      event_type: 'transaction.completed',
      data: {
        id: 'txn_1', status: 'completed', currency_code: 'USD',
        custom_data: { uid: 'uid1' },
        subscription_id: 'sub_paddle_1',
        billed_at: '2026-09-01T12:00:00Z',
        billing_period: { starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' },
        details: { totals: { grand_total: '900' } },
      },
    }
    const out = buildPaddleBillingEvent(evt, NOW)
    expect(out.uid).toBe('uid1')
    expect(out.key).toBe('paddle_txn_1')
    expect(out.record).toMatchObject({
      provider: 'paddle', type: 'charge', status: 'completed',
      amount: 900, currency: 'USD', subscriptionId: 'sub_paddle_1', receiptUrl: null,
    })
    expect(out.record.occurredAt).toBe(Date.parse('2026-09-01T12:00:00Z'))
    expect(out.record.periodStart).toBe(Date.parse('2026-09-01T00:00:00Z'))
    expect(out.record.periodEnd).toBe(Date.parse('2026-10-01T00:00:00Z'))
  })

  it('falls back to totals.total when grand_total is absent', () => {
    const evt = {
      event_type: 'transaction.completed',
      data: {
        id: 'txn_2', custom_data: { uid: 'uid1' },
        details: { totals: { total: '1200' } },
      },
    }
    expect(buildPaddleBillingEvent(evt, NOW).record.amount).toBe(1200)
  })

  it('transaction.payment_failed becomes a "failed" row', () => {
    const evt = {
      event_type: 'transaction.payment_failed',
      data: { id: 'txn_3', status: 'past_due', custom_data: { uid: 'uid1' }, details: { totals: { grand_total: '900' } } },
    }
    const out = buildPaddleBillingEvent(evt, NOW)
    expect(out.record.type).toBe('failed')
    expect(out.record.occurredAt).toBe(NOW)
  })

  it('returns null for an unrelated event type, no uid, or a malformed payload', () => {
    expect(buildPaddleBillingEvent({ event_type: 'subscription.updated', data: { custom_data: { uid: 'uid1' } } }, NOW)).toBeNull()
    expect(buildPaddleBillingEvent({ event_type: 'transaction.completed', data: { id: 'txn_1' } }, NOW)).toBeNull()
    expect(buildPaddleBillingEvent({}, NOW)).toBeNull()
    expect(buildPaddleBillingEvent(null, NOW)).toBeNull()
  })
})
