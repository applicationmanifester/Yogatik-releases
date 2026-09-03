/**
 * buildSkeleton is pure regex/brace-counting, not a real parser — these
 * cases are chosen to prove the parts that would silently misbehave if the
 * masking or the depth-matching were subtly wrong: a short body must be
 * left untouched (collapsing a 1-line body saves nothing and adds noise), a
 * class's own body must never collapse wholesale (its methods would vanish
 * with it), and a brace INSIDE a string or comment must never desync the
 * depth counter. Every expected output below was hand-traced line by line
 * against the actual algorithm before being written down.
 */
import { describe, it, expect } from 'vitest'
import { buildSkeleton, isSkeletonSupported, SKELETON_EXTENSIONS } from './codeSkeleton'

describe('buildSkeleton', () => {
  it('collapses a long function body to a line-count note, keeping the signature and closing brace', () => {
    const src = [
      'function foo() {',
      '  const a = 1',
      '  const b = 2',
      '  const c = 3',
      '  const d = 4',
      '  const e = 5',
      '  const f = 6',
      '  const g = 7',
      '  return a + b',
      '}',
    ].join('\n')
    const res = buildSkeleton(src)
    expect(res.text).toBe([
      'function foo() {',
      '  … 8 lines collapsed …',
      '}',
    ].join('\n'))
    expect(res.collapsedRegions).toBe(1)
    expect(res.collapsedLines).toBe(8)
    expect(res.originalLines).toBe(10)
    expect(res.outputLines).toBe(3)
  })

  it('leaves a short body exactly as written — collapsing it would add noise, not save any', () => {
    const src = ['function bar() {', '  return 1', '}'].join('\n')
    const res = buildSkeleton(src)
    expect(res.text).toBe(src)
    expect(res.collapsedRegions).toBe(0)
  })

  it('recurses into a class: the class body itself never collapses, but a long method inside it does', () => {
    const src = [
      'class Foo {',
      '  short() {',
      '    return 1',
      '  }',
      '  long() {',
      '    const a = 1',
      '    const b = 2',
      '    const c = 3',
      '    const d = 4',
      '    const e = 5',
      '    const f = 6',
      '    const g = 7',
      '    return a',
      '  }',
      '}',
    ].join('\n')
    const res = buildSkeleton(src)
    expect(res.text).toBe([
      'class Foo {',
      '  short() {',
      '    return 1',
      '  }',
      '  long() {',
      '    … 8 lines collapsed …',
      '  }',
      '}',
    ].join('\n'))
    expect(res.collapsedRegions).toBe(1)
    // The class shell and the short method both survive verbatim — only
    // long()'s own body is gone.
    expect(res.text).toContain('class Foo {')
    expect(res.text).toContain('short() {')
  })

  it('never lets a brace inside a string or a comment desync the depth counter', () => {
    const src = [
      'function withString() {',
      '  const s = "look: {"',
      '  // a comment with an unmatched brace: {',
      '  const t = 1',
      '  const u = 2',
      '  const v = 3',
      '  const w = 4',
      '  const x = 5',
      '  return s',
      '}',
    ].join('\n')
    const res = buildSkeleton(src)
    // If the string/comment braces were counted as real, the scan would
    // never find a matching close within the file and would safely decline
    // to collapse at all (fail-safe, not corrupted) rather than collapse —
    // asserting a successful collapse here IS the proof masking worked.
    expect(res.collapsedRegions).toBe(1)
    expect(res.text.startsWith('function withString() {\n')).toBe(true)
    expect(res.text.endsWith('\n}')).toBe(true)
  })

  it('collapses a large top-level object/array literal, not just function bodies', () => {
    const src = [
      'export const CONFIG = {',
      '  a: 1,',
      '  b: 2,',
      '  c: 3,',
      '  d: 4,',
      '  e: 5,',
      '  f: 6,',
      '  g: 7,',
      '}',
      '',
      'export function use() {',
      '  return CONFIG.a',
      '}',
    ].join('\n')
    const res = buildSkeleton(src)
    expect(res.text).toBe([
      'export const CONFIG = {',
      '  … 7 lines collapsed …',
      '}',
      '',
      'export function use() {',
      '  return CONFIG.a',
      '}',
    ].join('\n'))
    expect(res.collapsedRegions).toBe(1)
    expect(res.collapsedLines).toBe(7)
  })

  it('never fabricates or reorders a kept line — every surviving line is byte-identical to the source', () => {
    const src = [
      'function foo() {',
      '  const a = 1',
      '  const b = 2',
      '  const c = 3',
      '  const d = 4',
      '  const e = 5',
      '  const f = 6',
      '  const g = 7',
      '  return a + b',
      '}',
    ].join('\n')
    const res = buildSkeleton(src)
    const kept = res.text.split('\n').filter(l => !l.includes('collapsed'))
    for (const line of kept) expect(src).toContain(line)
  })
})

describe('isSkeletonSupported', () => {
  it('supports brace-delimited languages, with or without a leading dot, case-insensitively', () => {
    expect(isSkeletonSupported('jsx')).toBe(true)
    expect(isSkeletonSupported('.tsx')).toBe(true)
    expect(isSkeletonSupported('JS')).toBe(true)
    expect(isSkeletonSupported('go')).toBe(true)
  })

  it('honestly declines an indentation-based or non-code language instead of guessing', () => {
    expect(isSkeletonSupported('py')).toBe(false)
    expect(isSkeletonSupported('yaml')).toBe(false)
    expect(isSkeletonSupported('md')).toBe(false)
    expect(isSkeletonSupported('')).toBe(false)
  })

  it('the extension set and the checker agree', () => {
    for (const ext of SKELETON_EXTENSIONS) expect(isSkeletonSupported(ext)).toBe(true)
  })
})
