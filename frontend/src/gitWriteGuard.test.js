// The Source Control panel can WRITE to a repository. This file is the guard on
// what that means, and it exists because widening `isSafeGitArgs` would have
// been the obvious way to ship staging — and would have put `git reset --hard`
// one hallucinated argument array away from the model, which reaches git_run.
//
// gitCore.cjs is pure (no require('electron')), which is the only reason this
// can be asserted from vitest at all. createRequire is needed because vitest
// hands .cjs to Node's CJS loader, where a vi.mock never reaches.

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require_ = createRequire(import.meta.url)
const core = require_('../electron/gitCore.cjs')

describe('git read-only allowlist', () => {
  it('still refuses every mutating subcommand', () => {
    for (const cmd of ['add', 'commit', 'reset', 'checkout', 'clean', 'push', 'rm', 'restore']) {
      expect(core.isSafeGitArgs([cmd])).toBe(false)
    }
    expect(core.isSafeGitArgs(['status', '--porcelain'])).toBe(true)
  })

  it('refuses shell metacharacters even though git is never spawned through a shell', () => {
    expect(core.isSafeGitArgs(['log', '; rm -rf /'])).toBe(false)
    expect(core.isSafeGitArgs(['diff', '--', 'a`whoami`.js'])).toBe(false)
  })
})

describe('buildWriteArgs', () => {
  it('builds the argv itself — a caller cannot inject a flag', () => {
    const { args } = core.buildWriteArgs('stage', { paths: ['--hard', 'src/a.js'] })
    // `--` terminates options, so a file literally named `--hard` is a path.
    expect(args).toEqual(['add', '--', '--hard', 'src/a.js'])
  })

  it('has NO destructive operation at all', () => {
    for (const op of ['checkout', 'reset_hard', 'clean', 'discard', 'push', 'rm', 'restore', 'revert']) {
      expect(core.buildWriteArgs(op, { paths: ['a'] }).error).toBeTruthy()
    }
    expect(Object.keys(core.WRITE_OPS)).toEqual(['stage', 'unstage', 'stage_all', 'unstage_all'])
  })

  it('rejects a path that climbs out of the repository', () => {
    expect(core.buildWriteArgs('stage', { paths: ['../../etc/passwd'] }).error).toMatch(/escapes/)
    expect(core.buildWriteArgs('stage', { paths: ['a/../b.js'] }).error).toMatch(/escapes/)
    expect(core.buildWriteArgs('stage', { paths: ['a\0b'] }).error).toBeTruthy()
    // A file whose NAME merely contains dots is legitimate.
    expect(core.buildWriteArgs('stage', { paths: ['src/..hidden.js'] }).args).toBeTruthy()
  })

  it('passes a commit message as one argv entry, so quotes and newlines are data', () => {
    const { args } = core.buildWriteArgs('commit', { message: 'fix: "quoted"\n\n$(id)' })
    expect(args).toEqual(['commit', '-m', 'fix: "quoted"\n\n$(id)'])
  })

  it('requires a message, and refuses an empty selection', () => {
    expect(core.buildWriteArgs('commit', { message: '   ' }).error).toMatch(/message/i)
    expect(core.buildWriteArgs('stage', { paths: [] }).error).toMatch(/No files/)
    // stage_all takes no paths and must NOT be blocked by that check.
    expect(core.buildWriteArgs('stage_all', {}).args).toEqual(['add', '-A'])
  })
})
