import { describe, it, expect } from 'vitest'
import {
  nodeLabel, isInteractive, truncateText,
  simplify, assignRefs, parseRef, isStaleRef,
} from '../../electron/browserTree.cjs'

describe('browserTree — node classification', () => {
  it('prefers the accessible name over text', () => {
    expect(nodeLabel({ role: 'button', name: 'Submit form', text: 'Go' })).toBe('Submit form')
  })

  it('falls back to text when there is no name', () => {
    expect(nodeLabel({ role: 'link', name: '', text: 'Read more' })).toBe('Read more')
  })

  it('falls back to the role when there is neither', () => {
    expect(nodeLabel({ role: 'img', name: '', text: '' })).toBe('img')
  })

  it('treats known interactive roles as interactive', () => {
    expect(isInteractive({ role: 'button' })).toBe(true)
    expect(isInteractive({ role: 'link' })).toBe(true)
    expect(isInteractive({ role: 'textbox' })).toBe(true)
    expect(isInteractive({ role: 'generic' })).toBe(false)
  })

  it('honours an explicit interactive flag from the page', () => {
    expect(isInteractive({ role: 'generic', interactive: true })).toBe(true)
  })

  it('truncates long text and marks it', () => {
    expect(truncateText('x'.repeat(200), 10)).toBe('xxxxxxxxxx…')
    expect(truncateText('short', 10)).toBe('short')
  })
})

describe('browserTree — simplification', () => {
  it('drops non-interactive nodes that carry no label', () => {
    const raw = [
      { depth: 0, role: 'generic', name: '', text: '' },
      { depth: 1, role: 'heading', name: 'Title', text: 'Title' },
      { depth: 1, role: 'button', name: 'OK', text: 'OK' },
    ]
    const out = simplify(raw)
    expect(out).toHaveLength(2)
    expect(out.map(n => n.role)).toEqual(['heading', 'button'])
  })

  it('keeps an interactive node even with no label', () => {
    const raw = [{ depth: 0, role: 'button', name: '', text: '' }]
    expect(simplify(raw)).toHaveLength(1)
  })

  it('keeps invisible nodes out of the tree', () => {
    const raw = [
      { depth: 0, role: 'button', name: 'Hidden', visible: false },
      { depth: 0, role: 'button', name: 'Shown', visible: true },
    ]
    expect(simplify(raw).map(n => n.name)).toEqual(['Shown'])
  })
})

describe('browserTree — refs', () => {
  it('numbers only interactive nodes, in document order', () => {
    const nodes = [
      { role: 'heading', name: 'T' },
      { role: 'button', name: 'A' },
      { role: 'link', name: 'B' },
    ]
    const out = assignRefs(nodes, 3)
    expect(out[0].ref).toBeUndefined()
    expect(out[1].ref).toBe('ref_3_0')
    expect(out[2].ref).toBe('ref_3_1')
  })

  it('is stable within an epoch and changes across epochs', () => {
    const mk = () => [{ role: 'button', name: 'A' }]
    expect(assignRefs(mk(), 1)[0].ref).toBe(assignRefs(mk(), 1)[0].ref)
    expect(assignRefs(mk(), 2)[0].ref).not.toBe(assignRefs(mk(), 1)[0].ref)
  })

  it('parses a ref into epoch and index', () => {
    expect(parseRef('ref_7_12')).toEqual({ epoch: 7, index: 12 })
  })

  it('rejects malformed refs rather than guessing', () => {
    expect(parseRef('ref_x')).toBeNull()
    expect(parseRef('12')).toBeNull()
    expect(parseRef('')).toBeNull()
    expect(parseRef(null)).toBeNull()
  })

  it('flags refs from a superseded epoch as stale', () => {
    expect(isStaleRef('ref_1_0', 2)).toBe(true)
    expect(isStaleRef('ref_2_0', 2)).toBe(false)
    expect(isStaleRef('garbage', 2)).toBe(true)
  })
})
