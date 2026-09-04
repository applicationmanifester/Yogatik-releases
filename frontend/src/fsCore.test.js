// @vitest-environment node
/**
 * The functions that decide what happens to the user's bytes.
 *
 * fsBridge is where they are wired up; this is where they are proved. The
 * split exists for the same reason rootsCore.cjs is separate from roots.cjs —
 * anything behind require('electron') can only be tested through a harness,
 * and these are the parts that must never be wrong.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
// Imported rather than taken as a global: eslint's flat config lints src/ with
// browser globals, and `Buffer` there is a no-undef error, not a warning.
import { Buffer } from 'node:buffer'

const require_ = createRequire(import.meta.url)
const core = require_('../electron/fsCore.cjs')

let dir
beforeAll(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-fscore-'))) })
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ } })

describe('applyEdit', () => {
  it('refuses an empty old_string', () => {
    // With replace_all this used to insert new_string between every character.
    expect(() => core.applyEdit('hello', '', 'X', true)).toThrow(/non-empty/i)
    expect(() => core.applyEdit('hello', '', 'X', false)).toThrow(/non-empty/i)
  })

  it('refuses a no-op edit rather than reporting success', () => {
    expect(() => core.applyEdit('hello', 'ell', 'ell')).toThrow(/identical/i)
  })

  it('names which failure it was — not found vs not unique', () => {
    expect(() => core.applyEdit('a b c', 'zzz', 'x')).toThrow(/not found/i)
    expect(() => core.applyEdit('a a a', 'a', 'x')).toThrow(/not unique \(3 matches\)/i)
  })

  it('replaces once, or all, as asked', () => {
    expect(core.applyEdit('a b a', 'b', 'B')).toEqual({ text: 'a B a', replaced: 1 })
    expect(core.applyEdit('a b a', 'a', 'A', true)).toEqual({ text: 'A b A', replaced: 2 })
  })

  it('treats the needle as literal text, not a pattern', () => {
    // String.replace() gives $& $1 $` special meaning in the REPLACEMENT, which
    // silently corrupts any edit whose new text contains a dollar sign.
    expect(core.applyEdit('cost: X', 'X', '$100 ($&)').text).toBe('cost: $100 ($&)')
    expect(core.applyEdit('a.c', 'a.c', 'ok').text).toBe('ok')
  })

  it('constrains replacement to a specific startLine and endLine', () => {
    const text = [
      'line 1: return true',
      'line 2: middle',
      'line 3: return true',
      'line 4: end',
    ].join('\n')

    // Replacing "return true" globally without replaceAll would fail because it's not unique
    expect(() => core.applyEdit(text, 'return true', 'return false')).toThrow(/not unique/)

    // With startLine and endLine = 1..2, only the first occurrence is in scope
    const res = core.applyEdit(text, 'return true', 'return false', false, { startLine: 1, endLine: 2 })
    expect(res.text).toBe([
      'line 1: return false',
      'line 2: middle',
      'line 3: return true',
      'line 4: end',
    ].join('\n'))

    // With startLine and endLine = 3..4, only the second occurrence is in scope
    const res2 = core.applyEdit(text, 'return true', 'return null', false, { startLine: 3, endLine: 4 })
    expect(res2.text).toBe([
      'line 1: return true',
      'line 2: middle',
      'line 3: return null',
      'line 4: end',
    ].join('\n'))
  })

  it('counts without allocating a fragment per match', () => {
    const big = 'x'.repeat(100_000)
    expect(core.countOccurrences(big, 'x')).toBe(100_000)
    expect(core.countOccurrences(big, '')).toBe(0)
  })
})

describe('line endings', () => {
  it('detects the file’s own convention and refuses to guess when there is none', () => {
    expect(core.detectEol('a\r\nb\r\n')).toBe('\r\n')
    expect(core.detectEol('a\nb\n')).toBe('\n')
    expect(core.detectEol('no newline here')).toBe(null)
  })

  it('calls a mixed file by its majority', () => {
    expect(core.detectEol('a\r\nb\r\nc\n')).toBe('\r\n')
  })

  it('round-trips text back to the original endings', () => {
    expect(core.applyEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n')
    // Already-CRLF input must not become CRCRLF.
    expect(core.applyEol('a\r\nb\r\n', '\r\n')).toBe('a\r\nb\r\n')
    expect(core.applyEol('a\r\nb\r\n', '\n')).toBe('a\nb\n')
  })
})

describe('encoding', () => {
  it('keeps a UTF-8 BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('hi', 'utf8')])
    const d = core.decodeBuffer(buf)
    expect(d.text).toBe('hi')
    expect(d.bom).toBe(true)
    expect(core.encodeText(d.text, d)).toEqual(buf)
  })

  it('reads UTF-16LE rather than calling it binary', () => {
    // Interleaved NULs trip a naive binary check, and the file then reads as
    // unusable rather than as text.
    const buf = Buffer.from('hello', 'utf16le')
    const d = core.decodeBuffer(buf)
    expect(d.binary).toBe(false)
    expect(d.text).toBe('hello')
    expect(d.encoding).toBe('utf16le')
  })

  it('still calls real binary content binary', () => {
    expect(core.decodeBuffer(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x1A])).binary).toBe(true)
  })
})

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temp behind', async () => {
    const f = path.join(dir, 'atomic.txt')
    await core.writeFileAtomic(f, Buffer.from('first'))
    await core.writeFileAtomic(f, Buffer.from('second'))
    expect(fs.readFileSync(f, 'utf8')).toBe('second')
    expect(fs.readdirSync(dir).filter(n => n.includes('.tmp'))).toEqual([])
  })

  it('leaves the original intact when the write fails', async () => {
    const f = path.join(dir, 'keep.txt')
    fs.writeFileSync(f, 'original')
    // A directory as the destination fails at rename, after the temp is written.
    const asDir = path.join(dir, 'a-directory')
    fs.mkdirSync(asDir, { recursive: true })
    fs.writeFileSync(path.join(asDir, 'child'), 'x')
    await expect(core.writeFileAtomic(asDir, Buffer.from('nope'))).rejects.toThrow()
    expect(fs.readFileSync(f, 'utf8')).toBe('original')
    expect(fs.readdirSync(dir).filter(n => n.includes('.tmp'))).toEqual([])
  })
})

describe('readFileSmart', () => {
  it('is honest about truncation and cuts on a line boundary', async () => {
    const f = path.join(dir, 'big.txt')
    fs.writeFileSync(f, Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'))
    const res = await core.readFileSmart(f, { maxBytes: 120 })
    expect(res.truncated).toBe(true)
    expect(res.content.endsWith('\n')).toBe(false)
    expect(res.content).not.toMatch(/�/)      // never cut mid-codepoint
    expect(res.note).toMatch(/TRUNCATED/)
  })

  it('returns a requested line range', async () => {
    const f = path.join(dir, 'ranged.txt')
    fs.writeFileSync(f, 'a\nb\nc\nd\ne\n')
    const res = await core.readFileSmart(f, { offset: 2, limit: 2 })
    expect(res.content).toBe('b\nc')
    expect(res.range).toEqual({ firstLine: 2, lastLine: 3 })
  })

  it('reports a hash that changes with the content', async () => {
    const f = path.join(dir, 'hashed.txt')
    fs.writeFileSync(f, 'one')
    const a = await core.readFileSmart(f)
    fs.writeFileSync(f, 'two')
    const b = await core.readFileSmart(f)
    expect(a.hash).not.toBe(b.hash)
  })

  it('supports tail reads to inspect end of file', async () => {
    const f = path.join(dir, 'tail.txt')
    fs.writeFileSync(f, '1\n2\n3\n4\n5\n6\n7\n8\n9\n10')
    const res = await core.readFileSmart(f, { tail: 3 })
    expect(res.content).toBe('8\n9\n10')
    expect(res.range).toEqual({ firstLine: 8, lastLine: 10 })
    expect(res.truncated).toBe(true)
  })

  it('supports find and surround for symbol lookup', async () => {
    const f = path.join(dir, 'find.txt')
    const lines = Array.from({ length: 30 }, (_, i) => i === 15 ? 'function executeSecretTask() {' : `line ${i}`)
    fs.writeFileSync(f, lines.join('\n'))

    const res = await core.readFileSmart(f, { find: 'executeSecretTask', surround: 2 })
    expect(res.match_line).toBe(16)
    expect(res.content).toContain('function executeSecretTask() {')
    expect(res.range.firstLine).toBe(14)
    expect(res.range.lastLine).toBe(18)
  })

  it('provides numbered_content when lineNumbers option is true', async () => {
    const f = path.join(dir, 'numbered.txt')
    fs.writeFileSync(f, 'alpha\nbeta\ngamma')
    const res = await core.readFileSmart(f, { lineNumbers: true })
    expect(res.numbered_content).toBeDefined()
    expect(res.numbered_content).toContain('1 | alpha')
    expect(res.numbered_content).toContain('2 | beta')
    expect(res.numbered_content).toContain('3 | gamma')
    expect(res.estimated_tokens).toBeGreaterThan(0)
  })

  it('declines to decode a binary file as text', async () => {
    const f = path.join(dir, 'blob.bin')
    fs.writeFileSync(f, Buffer.from([0, 1, 2, 3, 0, 255]))
    const res = await core.readFileSmart(f)
    expect(res.binary).toBe(true)
    expect(res.content).toBe('')
    expect(res.note).toMatch(/binary/i)
  })
})

