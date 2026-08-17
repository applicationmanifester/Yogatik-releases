import { describe, it, expect } from 'vitest'
import { parseStatus, parseLog, parseBranches, summarizeStatus, isSafeGitArgs, REC, FIELD } from '../electron/gitCore.cjs'

describe('parseStatus', () => {
  it('parses porcelain v1 codes into staged/unstaged/untracked', () => {
    const out = parseStatus('M  staged.js\n M unstaged.js\n?? new.js\n')
    expect(out.find(f => f.path === 'staged.js').staged).toBe(true)
    expect(out.find(f => f.path === 'unstaged.js').staged).toBe(false)
    expect(out.find(f => f.path === 'new.js').untracked).toBe(true)
  })

  it('handles a file both staged and modified', () => {
    const out = parseStatus('MM both.js\n')
    expect(out[0].staged).toBe(true)
    expect(out[0].unstaged).toBe(true)
  })

  it('parses a rename with its origin', () => {
    const out = parseStatus('R  old.js -> new.js\n')
    expect(out[0].path).toBe('new.js')
    expect(out[0].from).toBe('old.js')
  })

  it('parses deletions', () => {
    expect(parseStatus(' D gone.js\n')[0].deleted).toBe(true)
  })

  it('is empty for a clean tree', () => {
    expect(parseStatus('')).toEqual([])
    expect(parseStatus('\n')).toEqual([])
  })

  it('keeps paths containing spaces intact', () => {
    expect(parseStatus('?? my file.txt\n')[0].path).toBe('my file.txt')
  })
})

describe('summarizeStatus', () => {
  it('counts each category', () => {
    const s = summarizeStatus(parseStatus('M  a.js\n M b.js\n?? c.js\n D d.js\n'))
    expect(s.staged).toBe(1)
    expect(s.unstaged).toBe(2) // b.js modified + d.js deleted
    expect(s.untracked).toBe(1)
  })

  it('reports a clean tree', () => {
    expect(summarizeStatus([]).clean).toBe(true)
  })
})

describe('parseLog', () => {
  it('parses the delimited format into commits', () => {
    // Built from the exported separators rather than literal control
    // characters: invisible bytes in source are trivially destroyed by an
    // editor and the failure would be baffling.
    const raw = ['abc123', 'Ada', '2026-01-01', 'First commit'].join(FIELD) + REC +
                ['def456', 'Grace', '2026-01-02', 'Second commit'].join(FIELD) + REC
    const out = parseLog(raw)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ hash: 'abc123', author: 'Ada', date: '2026-01-01', subject: 'First commit' })
    expect(out[1].subject).toBe('Second commit')
  })

  it('is empty for no output', () => {
    expect(parseLog('')).toEqual([])
  })

  it('tolerates a trailing separator', () => {
    expect(parseLog('abcd\n')).toHaveLength(1)
  })
})

describe('parseBranches', () => {
  it('marks the current branch', () => {
    const out = parseBranches('  main\n* feature/x\n  other\n')
    expect(out.find(b => b.current).name).toBe('feature/x')
    expect(out).toHaveLength(3)
  })

  it('ignores detached-HEAD noise', () => {
    const out = parseBranches('* (HEAD detached at abc123)\n  main\n')
    expect(out.map(b => b.name)).toEqual(['main'])
  })
})

describe('isSafeGitArgs', () => {
  it('allows the read-only subcommands', () => {
    expect(isSafeGitArgs(['status'])).toBe(true)
    expect(isSafeGitArgs(['log'])).toBe(true)
    expect(isSafeGitArgs(['diff'])).toBe(true)
  })

  it('rejects anything that could reach the network or rewrite history', () => {
    expect(isSafeGitArgs(['push'])).toBe(false)
    expect(isSafeGitArgs(['reset', '--hard'])).toBe(false)
    expect(isSafeGitArgs(['clean', '-fdx'])).toBe(false)
  })

  it('rejects shell metacharacters smuggled into an argument', () => {
    expect(isSafeGitArgs(['status', '; rm -rf /'])).toBe(false)
    expect(isSafeGitArgs(['log', '`whoami`'])).toBe(false)
    expect(isSafeGitArgs(['log', '$(id)'])).toBe(false)
  })

  it('rejects an empty command', () => {
    expect(isSafeGitArgs([])).toBe(false)
  })
})
