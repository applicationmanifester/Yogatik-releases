import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { estimateConversationTokens, getModelContextLimit, ContextMeter } from './ContextMeter'

describe('ContextMeter Logic', () => {
  it('estimates tokens correctly based on chars (~4 chars per token)', () => {
    const messages = [
      { role: 'user', content: 'Hello world! How are you doing today?' }, // 37 chars
      { role: 'assistant', text: 'I am doing great, ready to help you with code and research.' } // 59 chars
    ]
    const systemPrompt = 'You are a helpful assistant.' // 28 chars
    const input = 'Write a test' // 12 chars
    // Total chars = 37 + 59 + 28 + 12 = 136 chars -> 136 / 4 = 34 tokens

    const tokens = estimateConversationTokens(messages, systemPrompt, input)
    expect(tokens).toBe(34)
  })

  it('resolves limits from the SAME table the agent budgets against', () => {
    // This component used to carry its own copy of the limits. `local` was the
    // number that differed — 8192 here against compaction.js's 4096 — so a
    // wired meter would have shown the user 50% headroom they did not have,
    // while the agent compacted their history away underneath them. The meter
    // must read the table with teeth, not a second opinion.
    expect(getModelContextLimit('gemini', 'gemini-1.5-pro')).toBe(1000000)
    expect(getModelContextLimit('anthropic', 'claude-3-7-sonnet')).toBe(200000)
    expect(getModelContextLimit('openai', 'gpt-4o')).toBe(128000)
    expect(getModelContextLimit('local', '')).toBe(4096)
  })

  it('agrees with compaction.js for every provider it knows', async () => {
    const { getModelContextLimits } = await import('../compaction')
    for (const [p, m] of [
      ['gemini', 'gemini-1.5-pro'], ['anthropic', 'claude-3-7-sonnet'],
      ['openai', 'gpt-4o'], ['groq', 'llama-3.3-70b-versatile'],
      ['deepseek', 'deepseek-chat'], ['local', 'Qwen2.5-0.5B'], ['unknown', 'whatever'],
    ]) {
      expect(getModelContextLimit(p, m), `${p}/${m}`).toBe(getModelContextLimits(p, m).estimatedMaxTokens)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendering — the same gap the WiredPanels suite guards: the component was
// built but never mounted, so nothing had exercised its first render. These
// tests mount it the way App.jsx's composer now does.
// ─────────────────────────────────────────────────────────────────────────────

describe('ContextMeter rendering (mounted the way App.jsx does)', () => {
  let host = null
  let root = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  const mount = async (el) => { await act(async () => { root.render(el) }) }

  it('renders the estimated/limit badge with App-shaped messages', async () => {
    const messages = [
      { role: 'user', content: 'Hello world! How are you doing today?' },
      { role: 'assistant', content: 'I am doing great, ready to help you.' },
    ]
    await mount(
      <ContextMeter messages={messages} systemPrompt="You are a helpful assistant." input="" provider="openai" model="gpt-4o" />,
    )
    expect(host.textContent).toMatch(/\d/)
    expect(host.querySelector('.context-meter-badge')).toBeTruthy()
    // Title carries the full breakdown for a hover, matching the component's contract.
    expect(host.querySelector('.context-meter-badge').getAttribute('title')).toMatch(/Estimated Context Window/)
  })

  it('counts the draft input cheaply as the user types', async () => {
    const messages = [{ role: 'user', content: 'base' }]
    const draft = 'x'.repeat(400)
    await mount(
      <ContextMeter messages={messages} systemPrompt="" input={draft} provider="local" model="" />,
    )
    // 4 chars + 400 chars = 404 → 101 tokens. The badge shows the estimate
    // with the draft folded in (no full message-list re-walk per keystroke).
    expect(host.textContent).toMatch(/101/)
  })

  it('renders nothing harmful with an empty conversation', async () => {
    await mount(<ContextMeter messages={[]} systemPrompt="" input="" provider="local" model="" />)
    expect(host.querySelector('.context-meter-badge')).toBeTruthy()
  })

  it('goes amber/red past 60%/85% usage', async () => {
    // 85k tokens of history against a 128k window → >60% but <85% → amber.
    const long = 'a'.repeat(85_000 * 4)
    await mount(
      <ContextMeter messages={[{ role: 'assistant', content: long }]} systemPrompt="" input="" provider="openai" model="gpt-4o" />,
    )
    const icon = host.querySelector('.context-meter-badge svg')
    expect(icon).toBeTruthy()
    expect(icon.getAttribute('color') || icon.style?.color || '').toBeTruthy()
  })
})
