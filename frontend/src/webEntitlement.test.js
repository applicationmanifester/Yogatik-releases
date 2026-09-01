// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

/**
 * ONE SUBSCRIPTION, TWO SURFACES.
 *
 * The subscription belongs to the account: buy it on the website and the
 * desktop app unlocks, buy it in the desktop app and the website stops showing
 * ads. Both read the same `accounts/{uid}` document, which only the provider
 * webhook writes (`allow write: if false` for everyone else).
 *
 * What is pinned here is the WEB half, because it is new and because two of its
 * decisions are easy to get backwards:
 *
 *  - `locked` stays false on the web. Nothing there is gated, so gating on it
 *    would remove features people already have for free. Ad removal keys off
 *    `isPro()` instead, which is about what a paying customer gains.
 *  - a TRIAL is not Pro. It is unlocked but unpaid, so a trialling user still
 *    sees ads. Ads are the free tier's price; the trial previews Pro's
 *    capabilities, not its ad-free-ness. Testing `!locked` here would have made
 *    every trial ad-free by accident.
 */
const DAY = 24 * 60 * 60 * 1000
const account = { data: null, user: { uid: 'u1' } }

vi.mock('./firebaseAuth', () => ({
  getFirebase: async () => ({
    auth: { get currentUser() { return account.user } },
    db: {},
    doc: (_db, col, id) => ({ col, id }),
    getDoc: async () => ({ exists: () => !!account.data, data: () => account.data }),
  }),
}))

let E
beforeEach(async () => {
  vi.resetModules()
  account.data = null
  account.user = { uid: 'u1' }
  // No __YOGATIK_ELECTRON__ and no __YOGATIK_ENTITLEMENT__ === the web build.
  delete window.__YOGATIK_ELECTRON__
  delete window.__YOGATIK_ENTITLEMENT__
  E = await import('./entitlement')
})
afterEach(() => { vi.resetModules() })

describe('web entitlement', () => {
  it('reports the web surface and never locks it', async () => {
    const st = await E.loadEntitlement()
    expect(E.isDesktopBuild()).toBe(false)
    expect(st.surface).toBe('web')
    expect(st.locked).toBe(false)
  })

  it('no account document means free, not an error', async () => {
    expect((await E.loadEntitlement()).state).toBe('free')
    expect(E.isPro()).toBe(false)
  })

  it('an active subscription is Pro, and ads come off', async () => {
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 20 * DAY }
    const st = await E.loadEntitlement()
    expect(st.state).toBe('pro')
    expect(E.isPro()).toBe(true)
    expect(st.daysLeft).toBeGreaterThanOrEqual(19)
  })

  it('past_due keeps access, and cancelled auto-renew retains Pro until paid period ends', async () => {
    // A failed renewal is a dunning window, not a termination.
    account.data = { plan: 'pro', status: 'past_due', currentPeriodEnd: Date.now() + 3 * DAY }
    expect((await E.loadEntitlement()).state).toBe('pro')

    // Cancelling recurring auto-debit honors the remaining paid duration.
    account.data = { plan: 'pro', status: 'cancelled', currentPeriodEnd: Date.now() + 3 * DAY }
    expect((await E.loadEntitlement()).state).toBe('pro')
    expect(E.isPro()).toBe(true)

    // Once the paid duration has elapsed, access reverts to free.
    account.data = { plan: 'pro', status: 'cancelled', currentPeriodEnd: Date.now() - 1 * DAY }
    expect((await E.loadEntitlement()).state).toBe('free')
    expect(E.isPro()).toBe(false)
  })

  it('a TRIAL is not Pro — trialling users still see ads', async () => {
    account.data = { trialStartedAt: Date.now() - 2 * DAY }
    expect((await E.loadEntitlement()).state).toBe('trial')
    expect(E.isPro()).toBe(false)
  })

  it('an expired trial falls back to free', async () => {
    account.data = { trialStartedAt: Date.now() - 40 * DAY }
    expect((await E.loadEntitlement()).state).toBe('free')
  })

  it('signing out drops Pro locally', async () => {
    // Otherwise the next person at this browser is ad-free on someone else's
    // subscription.
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 20 * DAY }
    await E.loadEntitlement()
    expect(E.isPro()).toBe(true)
    await E.signOutEntitlement()
    expect(E.isPro()).toBe(false)
  })

  it('a signed-out session is free even with a paid account on file', async () => {
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 20 * DAY }
    account.user = null
    expect((await E.loadEntitlement()).state).toBe('free')
  })

  it('fails to the FREE side when Firestore is unreachable', async () => {
    // Failing open would hand an ad-free experience to anyone who can make a
    // network request fail.
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 20 * DAY }
    await E.loadEntitlement()
    account.user = { get uid() { throw new Error('offline') } }
    expect((await E.loadEntitlement()).state).toBe('free')
  })

  it('notifies listeners so the ad slot can disappear without a reload', async () => {
    const seen = []
    E.onEntitlementChange((st) => seen.push(st.state))
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 5 * DAY }
    await E.loadEntitlement()
    expect(seen).toContain('pro')
  })
})
