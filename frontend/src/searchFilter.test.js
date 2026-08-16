import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SKIP_DIRS, shouldSkipDir, looksBinary, parseGitignore, makeIgnoreMatcher,
} from '../electron/searchFilter.cjs'

describe('shouldSkipDir', () => {
  it('skips the directories that make search unusable', () => {
    for (const d of ['.git', 'node_modules', 'dist', 'build', 'target', '.next', 'venv']) {
      expect(shouldSkipDir(d)).toBe(true)
    }
  })

  it('does not skip ordinary source directories', () => {
    for (const d of ['src', 'lib', 'app', 'components', 'docs']) {
      expect(shouldSkipDir(d)).toBe(false)
    }
  })

  it('every default entry is actually skipped', () => {
    for (const d of DEFAULT_SKIP_DIRS) expect(shouldSkipDir(d)).toBe(true)
  })
})

describe('looksBinary', () => {
  it('detects a NUL byte as binary', () => {
    expect(looksBinary(Buffer.from([0x41, 0x42, 0x00, 0x43]))).toBe(true)
  })

  it('treats plain text as text', () => {
    expect(looksBinary(Buffer.from('const a = 1\nconst b = 2\n', 'utf8'))).toBe(false)
  })

  it('treats UTF-8 text with accents as text', () => {
    expect(looksBinary(Buffer.from('café — naïve\n', 'utf8'))).toBe(false)
  })

  it('treats an empty buffer as text', () => {
    expect(looksBinary(Buffer.alloc(0))).toBe(false)
  })

  it('detects a PNG header as binary', () => {
    expect(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe(true)
  })
})

describe('parseGitignore', () => {
  it('ignores comments and blank lines', () => {
    expect(parseGitignore('# a comment\n\n  \nfoo\n')).toEqual(['foo'])
  })

  it('keeps real patterns and trims them', () => {
    expect(parseGitignore('  dist  \n*.log\n')).toEqual(['dist', '*.log'])
  })

  it('drops negations rather than mishandling them', () => {
    // Honouring "!" properly needs full git semantics; excluding them is the
    // safe reading (we ignore less, never more).
    expect(parseGitignore('dist\n!dist/keep.txt\n')).toEqual(['dist'])
  })
})

describe('makeIgnoreMatcher', () => {
  it('matches a bare directory name at any depth', () => {
    const m = makeIgnoreMatcher(['dist'])
    expect(m('dist/app.js')).toBe(true)
    expect(m('packages/web/dist/app.js')).toBe(true)
    expect(m('src/app.js')).toBe(false)
  })

  it('matches a glob extension', () => {
    const m = makeIgnoreMatcher(['*.log'])
    expect(m('server.log')).toBe(true)
    expect(m('logs/server.log')).toBe(true)
    expect(m('server.js')).toBe(false)
  })

  it('matches a rooted pattern only at the root', () => {
    const m = makeIgnoreMatcher(['/build'])
    expect(m('build/x.js')).toBe(true)
    expect(m('packages/build/x.js')).toBe(false)
  })

  it('matches a trailing-slash directory pattern', () => {
    const m = makeIgnoreMatcher(['coverage/'])
    expect(m('coverage/lcov.info')).toBe(true)
  })

  it('is a no-op with no patterns', () => {
    const m = makeIgnoreMatcher([])
    expect(m('anything/at/all.js')).toBe(false)
  })

  it('normalises Windows separators so rules work on either platform', () => {
    const m = makeIgnoreMatcher(['dist'])
    expect(m('packages\\web\\dist\\app.js')).toBe(true)
  })
})
