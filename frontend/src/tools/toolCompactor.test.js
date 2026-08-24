import { describe, it, expect } from 'vitest'
import { compactToolResult, stripHeavyFields } from './toolCompactor'

describe('toolCompactor', () => {
  it('strips heavy base64 and binary fields', () => {
    const raw = {
      title: 'Screenshot taken',
      image: 'data:image/png;base64,' + 'A'.repeat(5000),
      nested: { screenshot: 'B'.repeat(1000) },
    }
    const stripped = stripHeavyFields(raw)
    expect(stripped.image).toContain('binary omitted')
    expect(stripped.nested.screenshot).toContain('binary omitted')
    expect(stripped.title).toBe('Screenshot taken')
  })

  it('compacts oversized arrays while retaining head and tail items', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` }))
    const result = { success: true, items }
    const compacted = compactToolResult(result, 5000)
    const parsed = JSON.parse(compacted)
    expect(parsed.items.length).toBe(21)
    expect(parsed.items[0].id).toBe(0)
    expect(parsed.items[20].id).toBe(99)
    expect(parsed.items[15]._compacted).toBeDefined()
  })

  it('compacts long text strings with head/tail preservation', () => {
    const longText = 'START ' + 'X'.repeat(20000) + ' END'
    const compacted = compactToolResult(longText, 500)
    expect(compacted.startsWith('START')).toBe(true)
    expect(compacted.endsWith('END')).toBe(true)
    expect(compacted).toContain('characters compacted')
  })
})
