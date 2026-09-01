import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatAmount, describeEvent, openReceipt } from './billing'

describe('formatAmount', () => {
  it('formats a smallest-unit amount into a localised currency string', () => {
    // Both INR and USD are 2-decimal currencies — amount/100 is exact.
    expect(formatAmount(9900, 'INR')).toMatch(/99/)
    expect(formatAmount(9900, 'INR')).toMatch(/[₹]|INR/)
    expect(formatAmount(900, 'USD')).toMatch(/9/)
    expect(formatAmount(900, 'USD')).toMatch(/\$|USD/)
  })

  it('renders — for a null/undefined amount rather than a fake $0.00', () => {
    expect(formatAmount(null, 'USD')).toBe('—')
    expect(formatAmount(undefined, 'INR')).toBe('—')
  })

  it('falls back to a plain number for a currency code Intl does not recognise, rather than throwing', () => {
    expect(() => formatAmount(1000, 'NOTACODE')).not.toThrow()
    expect(formatAmount(1000, 'NOTACODE')).toContain('10.00')
  })

  it('defaults to USD when no currency is given', () => {
    expect(formatAmount(500, undefined)).toMatch(/\$|USD/)
  })
})

describe('describeEvent', () => {
  it('labels a charge row distinctly from a failure or cancellation', () => {
    expect(describeEvent({ type: 'charge' }).label).toBe('Charge')
    expect(describeEvent({ type: 'failed' }).label).toBe('Payment failed')
    expect(describeEvent({ type: 'cancelled' }).label).toBe('Subscription cancelled')
    expect(describeEvent({ type: 'something-unrecognised' }).label).toBe('Billing event')
  })

  it('carries a tone the UI can colour: ok for a charge, err for a failure', () => {
    expect(describeEvent({ type: 'charge' }).tone).toBe('ok')
    expect(describeEvent({ type: 'failed' }).tone).toBe('err')
    expect(describeEvent({ type: 'cancelled' }).tone).toBe('neutral')
  })

  it('reports hasReceipt only when a receiptUrl is actually present, never assumed', () => {
    expect(describeEvent({ type: 'charge', receiptUrl: 'https://rzp.io/i/x' }).hasReceipt).toBe(true)
    expect(describeEvent({ type: 'charge' }).hasReceipt).toBe(false)
    expect(describeEvent({ type: 'charge', receiptUrl: null }).hasReceipt).toBe(false)
  })

  it('formats the amount inline so a card never has to call formatAmount separately', () => {
    expect(describeEvent({ type: 'charge', amount: 9900, currency: 'INR' }).amountText).toMatch(/99/)
    expect(describeEvent({ type: 'failed', amount: null }).amountText).toBe('—')
  })

  it('handles a bare/empty event without throwing', () => {
    expect(() => describeEvent()).not.toThrow()
    expect(() => describeEvent({})).not.toThrow()
  })
})

describe('openReceipt', () => {
  const realWindow = global.window

  afterEach(() => {
    global.window = realWindow
    vi.restoreAllMocks()
  })

  it('does nothing when no url is given', () => {
    global.window = { open: vi.fn() }
    openReceipt(null)
    expect(global.window.open).not.toHaveBeenCalled()
  })

  it('opens via the desktop bridge (shell.openExternal) when present, never a plain window.open on desktop', () => {
    const openExternal = vi.fn()
    global.window = { __YOGATIK_DESKTOP__: { openExternal }, open: vi.fn() }
    openReceipt('https://rzp.io/i/abc')
    expect(openExternal).toHaveBeenCalledWith('https://rzp.io/i/abc')
    expect(global.window.open).not.toHaveBeenCalled()
  })

  it('falls back to window.open on the web build, where there is no desktop bridge', () => {
    global.window = { open: vi.fn() }
    openReceipt('https://rzp.io/i/abc')
    expect(global.window.open).toHaveBeenCalledWith('https://rzp.io/i/abc', '_blank', 'noopener')
  })
})
