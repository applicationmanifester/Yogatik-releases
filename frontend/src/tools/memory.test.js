import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for the IndexedDB settings store.
let store = {}
vi.mock('../db', () => ({
  getSetting: async (k, fb) => (k in store ? store[k] : fb),
  setSetting: async (k, v) => { store[k] = v },
}))

const { memoryTool } = await import('./memory')

describe('memory tool', () => {
  beforeEach(() => { store = {} })

  it('saves, recalls, dedupes and forgets', async () => {
    await memoryTool.execute({ action: 'save', text: 'User prefers dark mode', tag: 'preference' })
    await memoryTool.execute({ action: 'save', text: 'Working on the Yogatik app' })

    const dup = await memoryTool.execute({ action: 'save', text: 'user prefers DARK mode' })
    expect(dup.note).toMatch(/already/i)

    const recall = await memoryTool.execute({ action: 'recall', text: 'dark mode' })
    expect(recall.memories[0].text).toMatch(/dark mode/i)

    const list = await memoryTool.execute({ action: 'list' })
    expect(list.total).toBe(2)

    const id = list.memories.find(m => /dark/i.test(m.text)).id
    const forgot = await memoryTool.execute({ action: 'forget', id })
    expect(forgot.removed).toBe(1)
    expect(forgot.count).toBe(1)
  })

  it('rejects empty save', async () => {
    const r = await memoryTool.execute({ action: 'save', text: '  ' })
    expect(r.success).toBe(false)
  })
})
