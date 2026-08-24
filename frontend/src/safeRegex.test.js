// @vitest-environment node
/**
 * The pattern guard, and glob translation.
 *
 * MEASURED 2026-08-24 in a bare Node process:
 *   new RegExp('(a+)+$').test('a'.repeat(40) + '!')
 * did not return, and a setTimeout scheduled BEFORE it never fired. The regex
 * engine holds the thread through backtracking, so the event loop stops dead.
 *
 * fs_search compiled exactly that — a pattern the MODEL wrote — on the Electron
 * main process, which is also the process that composites the window. One such
 * pattern froze the entire desktop app with no dialog, no cancel and no timeout
 * possible, until it was killed from Task Manager.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { assessPattern, safeRegExp, globToRegExp } = require_('../electron/safeRegex.cjs')

describe('assessPattern', () => {
  it('refuses the shape that actually hangs the engine', () => {
    // A quantifier inside a quantified group: the classic exponential case.
    for (const evil of ['(a+)+$', '(a*)*b', '(\\w+\\s?)*$', '(x+x+)+y']) {
      const v = assessPattern(evil)
      expect(v.safe, evil).toBe(false)
      expect(v.reason).toMatch(/exponential|repetition/i)
    }
  })

  it('refuses a repeated group of overlapping alternatives', () => {
    expect(assessPattern('(a|a)*$').safe).toBe(false)
    expect(assessPattern('(foo|foo|bar)+').safe).toBe(false)
  })

  it('allows the patterns people actually search with', () => {
    for (const ok of [
      'TODO', 'function \\w+', '^import .* from', 'const [A-Z_]+ =',
      '\\bfs_read\\b', 'v\\d+\\.\\d+\\.\\d+', 'foo|bar', '\\s+$',
    ]) {
      expect(assessPattern(ok).safe, ok).toBe(true)
    }
  })

  it('refuses an invalid regex with the engine’s own message', () => {
    const v = assessPattern('(unclosed')
    expect(v.safe).toBe(false)
    expect(v.reason).toMatch(/not a valid/i)
  })

  it('refuses an empty or absurdly long pattern', () => {
    expect(assessPattern('').safe).toBe(false)
    expect(assessPattern('a'.repeat(600)).safe).toBe(false)
  })
})

describe('safeRegExp', () => {
  it('returns null and a reason rather than throwing', () => {
    const { regex, reason } = safeRegExp('(a+)+$')
    expect(regex).toBeNull()
    expect(reason).toBeTruthy()
  })

  it('compiles a safe pattern normally', () => {
    const { regex } = safeRegExp('^const \\w+')
    expect(regex.test('const foo = 1')).toBe(true)
  })

  it('completes instantly on the input that used to hang', () => {
    // The guarantee, stated as a test: this must not merely be fast, it must
    // never reach the engine at all.
    const started = Date.now()
    const { regex } = safeRegExp('(a+)+$')
    expect(regex).toBeNull()
    expect(Date.now() - started).toBeLessThan(50)
  })
})

describe('globToRegExp', () => {
  it('keeps * inside one path segment', () => {
    // The old translator turned * into .*, so this matched a nested file and
    // "everything in this folder" quietly meant "everything, recursively".
    const re = globToRegExp('src/*.js')
    expect(re.test('src/app.js')).toBe(true)
    expect(re.test('src/deep/nested.js')).toBe(false)
  })

  it('lets ** cross directories, including zero of them', () => {
    const re = globToRegExp('**/*.js')
    expect(re.test('app.js')).toBe(true)
    expect(re.test('src/app.js')).toBe(true)
    expect(re.test('src/a/b/c/app.js')).toBe(true)
  })

  it('supports brace alternation', () => {
    const re = globToRegExp('*.{js,jsx,ts}')
    expect(re.test('a.js')).toBe(true)
    expect(re.test('a.jsx')).toBe(true)
    expect(re.test('a.css')).toBe(false)
  })

  it('? matches one character but never a separator', () => {
    const re = globToRegExp('a?.js')
    expect(re.test('ab.js')).toBe(true)
    expect(re.test('a/.js')).toBe(false)
  })

  it('treats regex metacharacters in the glob as literal text', () => {
    const re = globToRegExp('v1.2.3+build')
    expect(re.test('v1.2.3+build')).toBe(true)
    expect(re.test('v1X2X3+build')).toBe(false)
  })
})
