// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

// A fake settings table with the REAL db.js semantics, which are the whole
// reason this module needs a sentinel: getSetting returns the FALLBACK for a
// row holding null, so null and "no row" are indistinguishable to a reader.
const rows = new Map()
vi.mock('./db', () => ({
  getSetting: async (k, fallback = null) => {
    const v = rows.has(k) ? rows.get(k) : null
    return v != null ? v : fallback
  },
  setSetting: async (k, v) => { rows.set(k, v) },
}))

const { getScoped, setScoped, clearScoped, hasOwnBinding, copyChatScope, scopedKey, NONE } =
  await import('./chatScope')

beforeEach(() => rows.clear())

describe('per-chat settings with inheritance', () => {
  it('a chat with no binding follows the global default', async () => {
    await setScoped('active_agent', null, 'agent_coder')      // global
    expect(await getScoped('active_agent', 'chat-1')).toBe('agent_coder')
  })

  it('a chat with a binding keeps it when the default moves', async () => {
    await setScoped('active_agent', null, 'agent_coder')
    await setScoped('active_agent', 'chat-1', 'agent_writer')
    await setScoped('active_agent', null, 'agent_analyst')    // default changes
    expect(await getScoped('active_agent', 'chat-1')).toBe('agent_writer')
    expect(await getScoped('active_agent', 'chat-2')).toBe('agent_analyst')
  })

  it('one chat cannot change another', async () => {
    // The bug this replaces: a single global key meant activating the Coder
    // agent in one conversation changed the agent answering in every other
    // one — including a conversation that was already mid-turn.
    await setScoped('active_skill', 'chat-A', 'preset_dev')
    await setScoped('active_skill', 'chat-B', 'preset_research')
    expect(await getScoped('active_skill', 'chat-A')).toBe('preset_dev')
    expect(await getScoped('active_skill', 'chat-B')).toBe('preset_research')
  })

  it('"explicitly none" does NOT fall back to the global default', async () => {
    // The subtle one. db.getSetting returns the fallback for a null row, so
    // storing null to mean "off" reads back as "inherit" and hands the chat
    // the global skill again on the very next turn — which looks exactly like
    // the toggle not working. Hence the NONE sentinel.
    await setScoped('active_skill', null, 'preset_dev')       // global
    await setScoped('active_skill', 'chat-1', null)           // off, in this chat
    expect(rows.get(scopedKey('active_skill', 'chat-1'))).toBe(NONE)
    expect(await getScoped('active_skill', 'chat-1')).toBeNull()
    expect(await getScoped('active_skill', 'chat-2')).toBe('preset_dev')
  })

  it('clearing a binding restores inheritance', async () => {
    await setScoped('active_style', null, 'concise')
    await setScoped('active_style', 'chat-1', 'formal')
    expect(await hasOwnBinding('active_style', 'chat-1')).toBe(true)
    await clearScoped('active_style', 'chat-1')
    expect(await hasOwnBinding('active_style', 'chat-1')).toBe(false)
    expect(await getScoped('active_style', 'chat-1')).toBe('concise')
  })

  it('falls back past an unset global to the caller default', async () => {
    expect(await getScoped('active_style', 'chat-1', 'default')).toBe('default')
  })

  it('no conversationId reads and writes the global default', async () => {
    // Every caller that has no chat in hand — a migration, a background job,
    // the delete-cleanup paths — must land on the global key, not on a key
    // named after the empty string.
    expect(scopedKey('active_agent', null)).toBeNull()
    await setScoped('active_agent', null, 'agent_general')
    expect(rows.get('active_agent')).toBe('agent_general')
  })

  it('a branch inherits the bindings of the chat it came from', async () => {
    await setScoped('active_agent', 'chat-A', 'agent_coder')
    await setScoped('disabled_tools', 'chat-A', ['tts'])
    await copyChatScope('chat-A', 'chat-B')
    expect(await getScoped('active_agent', 'chat-B')).toBe('agent_coder')
    expect(await getScoped('disabled_tools', 'chat-B')).toEqual(['tts'])
  })

  it('copying carries an explicit "none" as explicit, not as inherit', async () => {
    await setScoped('active_skill', null, 'preset_dev')
    await setScoped('active_skill', 'chat-A', null)
    await copyChatScope('chat-A', 'chat-B')
    expect(await getScoped('active_skill', 'chat-B')).toBeNull()
  })

  it('keys never collide across bases or chats', async () => {
    const keys = new Set([
      scopedKey('active_agent', '1'), scopedKey('active_skill', '1'),
      scopedKey('active_agent', '2'), scopedKey('active_agent', '11'),
    ])
    expect(keys.size).toBe(4)
  })
})
