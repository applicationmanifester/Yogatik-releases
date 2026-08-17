import { describe, it, expect } from 'vitest'
import { lineDiff, unifiedDiff, summarizeDiff } from './diffPreview'

describe('lineDiff', () => {
  it('reports no changes for identical text', () => {
    const d = lineDiff('a\nb\n', 'a\nb\n')
    expect(d.every(r => r.type === 'same')).toBe(true)
  })

  it('detects an added line', () => {
    const d = lineDiff('a\n', 'a\nb\n')
    expect(d.filter(r => r.type === 'add').map(r => r.text)).toEqual(['b'])
  })

  it('detects a removed line', () => {
    const d = lineDiff('a\nb\n', 'a\n')
    expect(d.filter(r => r.type === 'del').map(r => r.text)).toEqual(['b'])
  })

  it('detects a replacement as one delete plus one add', () => {
    const d = lineDiff('hello\n', 'goodbye\n')
    expect(d.filter(r => r.type === 'del').map(r => r.text)).toEqual(['hello'])
    expect(d.filter(r => r.type === 'add').map(r => r.text)).toEqual(['goodbye'])
  })

  it('handles creating a file from nothing', () => {
    const d = lineDiff('', 'new\n')
    expect(d.filter(r => r.type === 'add').map(r => r.text)).toEqual(['new'])
  })

  it('keeps unchanged context between edits', () => {
    const d = lineDiff('a\nb\nc\n', 'a\nX\nc\n')
    expect(d.filter(r => r.type === 'same').map(r => r.text)).toEqual(['a', 'c'])
  })
})

describe('summarizeDiff', () => {
  it('counts additions and deletions', () => {
    expect(summarizeDiff(lineDiff('a\nb\n', 'a\nX\nY\n'))).toEqual({ added: 2, removed: 1 })
  })

  it('is zero for no change', () => {
    expect(summarizeDiff(lineDiff('a\n', 'a\n'))).toEqual({ added: 0, removed: 0 })
  })
})

describe('unifiedDiff', () => {
  it('renders +/- markers', () => {
    const out = unifiedDiff('a\nb\n', 'a\nc\n')
    expect(out).toContain('-b')
    expect(out).toContain('+c')
  })

  it('says so plainly when nothing changed', () => {
    expect(unifiedDiff('a\n', 'a\n')).toMatch(/no changes/i)
  })

  it('caps output so a huge rewrite cannot flood the prompt', () => {
    const before = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n')
    const after = Array.from({ length: 5000 }, (_, i) => `changed ${i}`).join('\n')
    const out = unifiedDiff(before, after, { maxLines: 40 })
    expect(out.split('\n').length).toBeLessThanOrEqual(45)
    expect(out).toMatch(/more/i)
  })
})
