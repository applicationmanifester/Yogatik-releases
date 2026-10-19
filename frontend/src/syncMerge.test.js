import { describe, it, expect } from 'vitest'
import { conversationSignature, selectIncoming, countNewConversations, mergeSnapshotsLWW, pickConversationWinner, pickDocumentWinner } from './syncMerge'

const mk = (id, title, createdAt, msgs) => ({
  conversations: [{ id, title, createdAt, updatedAt: createdAt }],
  messages: msgs.map((c, i) => ({ id: id * 100 + i, conversationId: id, content: c })),
  format: 'yogatik-backup', version: 1,
})

describe('syncMerge', () => {
  it('derives a stable signature independent of local id', () => {
    const a = { id: 1, title: 'Hi', createdAt: 10 }
    const b = { id: 999, title: 'Hi', createdAt: 10 }
    const msgs = [{ conversationId: 1, content: 'hello' }]
    const msgs2 = [{ conversationId: 999, content: 'hello' }]
    expect(conversationSignature(a, msgs)).toBe(conversationSignature(b, msgs2))
  })

  it('prefers an explicit syncId when present', () => {
    expect(conversationSignature({ syncId: 'abc', title: 'x' })).toBe('id:abc')
  })

  it('imports conversations that do not exist locally', () => {
    const local = mk(1, 'A', 100, ['hello'])
    const incoming = mk(5, 'B', 200, ['world'])
    const sel = selectIncoming(incoming, local)
    expect(sel.conversations).toHaveLength(1)
    expect(sel.conversations[0].title).toBe('B')
    expect(sel.messages).toHaveLength(1)
  })

  it('does NOT re-import a conversation already present (the duplication bug)', () => {
    const same = mk(1, 'A', 100, ['hello'])
    const incoming = { ...same, conversations: [{ ...same.conversations[0], id: 42 }], messages: [{ conversationId: 42, content: 'hello' }] }
    expect(countNewConversations(incoming, same)).toBe(0)
  })

  it('LWW: takes the incoming copy only when newer AND longer', () => {
    const local = mk(1, 'A', 100, ['hello'])
    // same signature (title+createdAt+first msg), newer updatedAt, extra message
    const incoming = {
      format: 'yogatik-backup', version: 1,
      conversations: [{ id: 7, title: 'A', createdAt: 100, updatedAt: 500 }],
      messages: [{ conversationId: 7, content: 'hello' }, { conversationId: 7, content: 'more' }],
    }
    expect(countNewConversations(incoming, local)).toBe(1)
  })

  it('preserves the backup envelope so importAll accepts it', () => {
    const sel = selectIncoming(mk(2, 'X', 1, ['q']), { conversations: [], messages: [] })
    expect(sel.format).toBe('yogatik-backup')
  })

  it('skips incoming documents already stored locally (hash identity)', () => {
    const local = { ...mk(1, 'A', 100, ['hello']), documents: [{ id: 1, hash: 'h1', name: 'd.pdf', updatedAt: 100 }] }
    const incoming = { ...mk(5, 'B', 200, ['world']), documents: [{ id: 9, hash: 'h1', name: 'd.pdf', updatedAt: 100 }] }
    const sel = selectIncoming(incoming, local)
    expect(sel.documents).toHaveLength(0)
    expect(sel.conversations).toHaveLength(1)
  })

  it('keeps an incoming document only when its metadata is newer', () => {
    const local = { conversations: [], messages: [], documents: [{ id: 1, hash: 'h1', name: 'old.pdf', updatedAt: 100 }] }
    const incoming = { conversations: [], messages: [], format: 'yogatik-backup', version: 1, documents: [{ id: 9, hash: 'h1', name: 'new.pdf', updatedAt: 900 }] }
    expect(selectIncoming(incoming, local).documents).toHaveLength(1)
  })

  it('mergeSnapshotsLWW: newer metadata wins, messages union, ties keep local', () => {
    const local = {
      conversations: [{ id: 1, syncId: 's1', title: 'T', updatedAt: 100 }],
      messages: [{ id: 1, conversationId: 1, role: 'user', content: 'a' }],
      documents: [],
    }
    const remote = {
      conversations: [{ id: 2, syncId: 's1', title: 'T2', updatedAt: 200 }],
      messages: [
        { id: 1, conversationId: 2, role: 'user', content: 'a' },
        { id: 2, conversationId: 2, role: 'assistant', content: 'b' },
      ],
      documents: [],
    }
    const m = mergeSnapshotsLWW(local, remote)
    expect(m.conversations[0].title).toBe('T2')
    expect(m.messages.map(x => x.content).sort()).toEqual(['a', 'b'])
    expect(pickConversationWinner(local.conversations[0], { ...local.conversations[0], updatedAt: 100 })).toBe(local.conversations[0])
    expect(pickDocumentWinner(null, { hash: 'x' })).toEqual({ hash: 'x' })
  })
})
