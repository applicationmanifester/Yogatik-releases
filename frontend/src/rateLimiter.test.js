import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as rl from './rateLimiter.js'

describe('rateLimiter token bucket', () => {
  it('allows burst up to limit without waiting', async () => {
    const provider = 'test_burst_provider'
    // Default burst is 3 — all 3 acquire immediately
    await rl.acquireProviderSlot(provider)
    await rl.acquireProviderSlot(provider)
    await rl.acquireProviderSlot(provider)
    // 4th should throw because bucket is empty (no queuing)
    await expect(rl.acquireProviderSlot(provider)).rejects.toThrow()
  })

  it('releaseProviderSlot marks success and closes circuit', () => {
    const provider = 'test_success_provider'
    expect(() => rl.releaseProviderSlot(provider, true)).not.toThrow()
    const state = rl.getLimiterState(provider)
    expect(state.circuitState).toBe('closed')
    expect(state.failures).toBe(0)
  })

  it('releaseProviderSlot marks failure', () => {
    const provider = 'test_failure_provider'
    for (let i = 0; i < 5; i++) rl.releaseProviderSlot(provider, false)
    const state = rl.getLimiterState(provider)
    expect(state.circuitState).toBe('open')
    expect(state.failures).toBe(5)
  })

  it('circuit open rejects acquires immediately until cooldown', async () => {
    const provider = 'test_circuit_provider'
    // Trip the circuit
    for (let i = 0; i < 5; i++) rl.releaseProviderSlot(provider, false)

    // Now acquire should reject immediately (no cooldown elapsed)
    await expect(rl.acquireProviderSlot(provider)).rejects.toThrow()

    const state = rl.getLimiterState(provider)
    expect(state.circuitState).toBe('open')
    expect(state.cooldownRemainingMs).toBeGreaterThan(0)
  })

  it('getLimiterState returns diagnostics', () => {
    const provider = 'test_state_provider'
    rl.releaseProviderSlot(provider, true)
    const state = rl.getLimiterState(provider)
    expect(state).toHaveProperty('providerId', provider)
    expect(state).toHaveProperty('tokens')
    expect(state).toHaveProperty('burst')
    expect(state).toHaveProperty('ratePerMin')
    expect(state).toHaveProperty('circuitState')
    expect(state).toHaveProperty('failures')
    expect(state).toHaveProperty('cooldownRemainingMs')
    expect(state).toHaveProperty('queued')
  })

  it('configureProvider updates rate and burst', () => {
    const provider = 'test_configure_provider'
    rl.configureProvider(provider, { ratePerMin: 120, burst: 10 })
    const state = rl.getLimiterState(provider)
    expect(state.ratePerMin).toBe(120)
    expect(state.burst).toBe(10)
  })

  it('resetCircuit reopens a tripped circuit', () => {
    const provider = 'test_reset_provider'
    for (let i = 0; i < 5; i++) rl.releaseProviderSlot(provider, false)
    expect(rl.getLimiterState(provider).circuitState).toBe('open')

    rl.resetCircuit(provider)
    expect(rl.getLimiterState(provider).circuitState).toBe('closed')
    expect(rl.getLimiterState(provider).failures).toBe(0)
  })
})

describe('rateLimiter edge cases', () => {
  it('handles unknown provider gracefully', () => {
    const state = rl.getLimiterState('never_used_provider_xyz')
    expect(state.circuitState).toBe('closed')
    expect(state.failures).toBe(0)
  })

  it('acquire + release round trip does not throw', async () => {
    const provider = 'test_roundtrip_provider'
    await rl.acquireProviderSlot(provider)
    rl.releaseProviderSlot(provider, true)
    const state = rl.getLimiterState(provider)
    expect(state.circuitState).toBe('closed')
  })

  it('default ratePerMin and burst are sane', () => {
    const provider = 'test_defaults_provider'
    const state = rl.getLimiterState(provider)
    expect(state.ratePerMin).toBeGreaterThan(0)
    expect(state.burst).toBeGreaterThan(0)
  })
})

describe('rateLimiter exports', () => {
  it('exports named functions', () => {
    expect(typeof rl.acquireProviderSlot).toBe('function')
    expect(typeof rl.releaseProviderSlot).toBe('function')
    expect(typeof rl.getLimiterState).toBe('function')
    expect(typeof rl.configureProvider).toBe('function')
    expect(typeof rl.resetCircuit).toBe('function')
    expect(typeof rl.getBucket).toBe('function')
    expect(typeof rl.getCircuit).toBe('function')
  })

  it('default export has key methods', () => {
    const def = rl.default
    expect(typeof def.acquireProviderSlot).toBe('function')
    expect(typeof def.releaseProviderSlot).toBe('function')
    expect(typeof def.getLimiterState).toBe('function')
  })
})
