/**
 * A fresh key's very first connection test must never land on a randomly
 * bad model. Every built-in provider now discovers its model list live
 * (`models: [], default: ''`), so `testProvider`/`getModels()`/`addProvider`
 * all fall back to a curated `preferred` list before ever taking the
 * alphabetically-first entry of a provider's live catalog — a real, observed
 * failure for NVIDIA (80+ models, many retired/embedding-only) and, before
 * this fix, for OpenRouter (100+ models, no curated list at all).
 *
 * This file pins the one part of that fix that is easy to silently undo:
 * Quick Add can save a custom provider under a built-in id (e.g. 'nvidia'),
 * which SHADOWS the built-in entry in getProviders() — including its
 * `preferred` list, unless the saved record explicitly carries one forward.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { getBuiltinProvider, getProviders, registerCustomProviders } from './llm'

afterEach(() => registerCustomProviders({}))

describe('provider preferred-model list', () => {
  it('every remote built-in provider ships a non-empty preferred list', () => {
    const skip = new Set(['local', 'ollama', 'chromeai'])
    for (const [id, p] of Object.entries(getProviders())) {
      if (skip.has(id)) continue
      expect(Array.isArray(p.preferred), `${id} should have a preferred array`).toBe(true)
      expect(p.preferred.length, `${id}'s preferred list should not be empty`).toBeGreaterThan(0)
    }
  })

  it('getBuiltinProvider bypasses a custom override that shadows the same id', () => {
    // Simulate what addProvider() persists when Quick Add reuses a built-in
    // id WITHOUT carrying `preferred` forward — the bug this test exists to
    // catch if it regresses.
    registerCustomProviders({ nvidia: { name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', models: [], default: '' } })

    // The merged view now returns the shadowing custom record, which has none.
    expect(getProviders().nvidia.preferred).toBeUndefined()

    // getBuiltinProvider must still see the ORIGINAL curated list underneath
    // the shadow — this is what addProvider() reads to carry it forward.
    const builtin = getBuiltinProvider('nvidia')
    expect(builtin?.preferred?.length).toBeGreaterThan(0)
    expect(builtin.preferred).toContain('meta/llama-3.3-70b-instruct')
  })

  it('a custom record that DOES carry `preferred` forward is what getProviders() then returns', () => {
    const carried = getBuiltinProvider('nvidia').preferred
    registerCustomProviders({
      nvidia: { name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', models: ['meta/llama-3.3-70b-instruct'], default: 'meta/llama-3.3-70b-instruct', preferred: carried },
    })
    // This is exactly what testProvider()'s `p?.preferred?.[0]` and
    // getModels()'s default_model computation both read.
    expect(getProviders().nvidia.preferred).toEqual(carried)
  })

  it('getBuiltinProvider returns null for an unknown id rather than throwing', () => {
    expect(getBuiltinProvider('not-a-real-provider')).toBeNull()
  })
})
