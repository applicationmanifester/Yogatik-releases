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
  ensureFirebaseAuth: async () => {},
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

  it('Yogatik Pro is active without payment and with zero restrictions', async () => {
    const st = await E.loadEntitlement()
    expect(st.state).toBe('pro')
    expect(E.isPro()).toBe(true)
    expect(E.isLocked()).toBe(false)
    expect(E.isUnlocked()).toBe(true)
  })

  it('an account remains Pro and ads are off', async () => {
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 20 * DAY }
    const st = await E.loadEntitlement()
    expect(st.state).toBe('pro')
    expect(E.isPro()).toBe(true)
  })

  it('never puts restrictions on users regardless of payment history', async () => {
    account.data = { plan: 'pro', status: 'cancelled', currentPeriodEnd: Date.now() - 1 * DAY }
    expect((await E.loadEntitlement()).state).toBe('pro')
    expect(E.isPro()).toBe(true)
    expect(E.isLocked()).toBe(false)
  })

  it('trial state is superseded by free unrestricted Pro access', async () => {
    account.data = { trialStartedAt: Date.now() - 2 * DAY }
    expect((await E.loadEntitlement()).state).toBe('pro')
    expect(E.isPro()).toBe(true)
  })

  it('expired trial accounts remain on unrestricted Pro', async () => {
    account.data = { trialStartedAt: Date.now() - 40 * DAY }
    expect((await E.loadEntitlement()).state).toBe('pro')
    expect(E.isPro()).toBe(true)
  })

  it('keeps Pro active and unrestricted across all sessions', async () => {
    account.data = { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 20 * DAY }
    await E.loadEntitlement()
    expect(E.isPro()).toBe(true)
    await E.signOutEntitlement()
    expect(E.isPro()).toBe(true)
    expect(E.isLocked()).toBe(false)
  })

  it('signed-out session retains Pro access with zero restrictions', async () => {
    account.user = null
    expect((await E.loadEntitlement()).state).toBe('pro')
    expect(E.isPro()).toBe(true)
  })

  it('offline/unreachable state keeps Pro unrestricted rather than locking out', async () => {
    account.user = { get uid() { throw new Error('offline') } }
    expect((await E.loadEntitlement()).state).toBe('pro')
    expect(E.isPro()).toBe(true)
  })

  it('exposes voluntary charity contribution plans for developer support', () => {
    expect(E.PLANS.in.note).toMatch(/charity/i)
    expect(E.PLANS.intl.note).toMatch(/charity/i)
  })
})

