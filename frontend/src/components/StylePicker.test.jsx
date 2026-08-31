// @vitest-environment jsdom
//
// styles.js shipped complete — six built-in styles, custom styles, and
// agent.js appending the active one to EVERY reply — and no component ever
// rendered a selector. The feature was reachable only by editing IndexedDB by
// hand. So the assertions that matter here are as much about WIRING as about
// behaviour: a picker nobody renders is the same bug again.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const state = { global: 'default', chat: undefined }

vi.mock('../styles', () => ({
  getStyles: async () => ([
    { id: 'default', name: 'Default', description: 'Balanced, natural responses.' },
    { id: 'concise', name: 'Concise', description: 'Short and direct — minimal words.' },
    { id: 'formal', name: 'Formal', description: 'Professional, polished prose.' },
  ]),
  getActiveStyleId: async (cid) => (cid && state.chat !== undefined ? state.chat : state.global),
  setActiveStyle: async (id, cid) => { if (cid) state.chat = id; else state.global = id },
  inheritActiveStyle: async () => { state.chat = undefined },
}))
vi.mock('../chatScope', () => ({
  hasOwnBinding: async (_k, cid) => !!cid && state.chat !== undefined,
}))

const { StylePicker } = await import('./StylePicker')

beforeEach(() => { state.global = 'default'; state.chat = undefined })
afterEach(() => { cleanup() })

describe('the picker reflects per-chat inheritance', () => {
  it('shows every style and the resolved value', async () => {
    render(<StylePicker conversationId="chat-1" />)
    const select = await screen.findByLabelText('Response style')
    expect(select.value).toBe('default')
    expect([...select.options].map(o => o.value)).toEqual(['default', 'concise', 'formal'])
  })

  it('says it is FOLLOWING the default rather than showing a bare value', async () => {
    // "Default" is ambiguous on its own: the user cannot tell whether they
    // chose it or merely inherited it, which is the whole reason a per-chat
    // setting needs three states in the UI and not two.
    render(<StylePicker conversationId="chat-1" />)
    expect(await screen.findByText('Following the default')).toBeTruthy()
    expect(screen.queryByText('this chat')).toBeNull()
  })

  it('marks the chat as bound once a style is chosen here', async () => {
    render(<StylePicker conversationId="chat-1" />)
    const select = await screen.findByLabelText('Response style')
    fireEvent.change(select, { target: { value: 'concise' } })
    await waitFor(() => expect(screen.getByText('this chat')).toBeTruthy())
    expect(state.chat).toBe('concise')
    expect(state.global).toBe('default')   // the default must NOT move
  })

  it('can go back to following the default', async () => {
    state.chat = 'formal'
    render(<StylePicker conversationId="chat-1" />)
    fireEvent.click(await screen.findByText('Follow the default'))
    await waitFor(() => expect(screen.getByText('Following the default')).toBeTruthy())
    expect(state.chat).toBeUndefined()
  })

  it('"Set as default" writes the global AND releases this chat to follow it', async () => {
    // Leaving the chat binding in place would pin this conversation to a value
    // it can no longer track — it would stop following the default it just set.
    state.chat = 'concise'
    render(<StylePicker conversationId="chat-1" />)
    fireEvent.click(await screen.findByText('Set as default'))
    await waitFor(() => expect(state.global).toBe('concise'))
    expect(state.chat).toBeUndefined()
  })

  it('hides the per-chat controls when there is no chat', async () => {
    // The settings surface edits the global default; scope actions are
    // meaningless without a conversation to scope to.
    render(<StylePicker conversationId={null} />)
    await screen.findByLabelText('Response style')
    expect(screen.queryByText('Set as default')).toBeNull()
    expect(screen.queryByText('Following the default')).toBeNull()
  })
})

describe('wiring', () => {
  const app = fs.readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')
  const css = fs.readFileSync(path.join(HERE, '..', 'styles.css'), 'utf8')

  it('App imports AND renders the picker', () => {
    // A finished component that nothing imports is exactly what this replaces.
    expect(app).toMatch(/import \{ StylePicker \} from '\.\/components\/StylePicker'/)
    expect(app).toMatch(/<StylePicker\b/)
  })

  it('is scoped to the chat, using the same identity as the agent', () => {
    // scopeId is `conv.id || conv.clientId`, matching what runAgent resolves.
    // Passing anything else writes a key the agent never reads.
    expect(app).toMatch(/<StylePicker[^>]*conversationId=\{scopeId\}/)
  })

  it('.style-select is actually styled', () => {
    // It had no rule anywhere, so LiveSettings and PersonalisePanel rendered
    // browser-default dropdowns — light controls on a dark panel.
    expect(css).toMatch(/^\.style-select\s*\{/m)
    expect(css).toMatch(/\.style-select option/)
  })
})
