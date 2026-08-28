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

describe('parseStatusV2', () => {
  // MEASURED against a real repository: with the default core.quotePath, v1
  // emits `"src/caf\303\251.js"` — the literal escape sequence — for a file
  // called src/café.js. Nothing un-quoted it, so the panel listed a path that
  // does not exist and the tree row never matched. -z emits paths raw.
  const REC_ = (s) => s.replace(/\n/g, '\0')

  it('reads a non-ASCII path unquoted', () => {
    const raw = REC_('1 A. N... 000000 100644 100644 0000000 c1b0730 src/café.js\n')
    const { files } = core.parseStatusV2(raw)
    expect(files[0].path).toBe('src/café.js')
    expect(files[0].staged).toBe(true)
    expect(files[0].unstaged).toBe(false)
  })

  it('keeps spaces in a path instead of truncating at one', () => {
    const raw = REC_('1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb my notes/two words.md\n')
    const { files } = core.parseStatusV2(raw)
    expect(files[0].path).toBe('my notes/two words.md')
    expect(files[0].staged).toBe(false)
    expect(files[0].unstaged).toBe(true)
  })

  it('takes a rename original from its own record, not from a " -> " split', () => {
    // v1 split on the STRING " -> ", which a filename may legitimately contain.
    const raw = REC_(
      '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 new -> name.js\nold -> name.js\n' +
      '? untracked.txt\n'
    )
    const { files } = core.parseStatusV2(raw)
    expect(files[0].path).toBe('new -> name.js')
    expect(files[0].from).toBe('old -> name.js')
    expect(files[0].renamed).toBe(true)
    // The rename's second record must be CONSUMED, not parsed as another file.
    expect(files).toHaveLength(2)
    expect(files[1]).toMatchObject({ path: 'untracked.txt', untracked: true })
  })

  it('reports upstream, ahead/behind, detached HEAD and conflicts', () => {
    const raw = REC_(
      '# branch.oid abc123\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -3\n' +
      'u UU N... 100644 100644 100644 100644 a b c src/conflict.js\n'
    )
    const { files, branch } = core.parseStatusV2(raw)
    expect(branch).toMatchObject({ head: 'main', upstream: 'origin/main', ahead: 2, behind: 3, detached: false })
    expect(files[0].conflicted).toBe(true)
    expect(core.summarizeStatus(files).conflicted).toBe(1)

    const det = core.parseStatusV2(REC_('# branch.head (detached)\n')).branch
    expect(det.detached).toBe(true)
    expect(det.head).toBeNull()
  })

  it('names the operation in progress from the .git marker files', () => {
    expect(core.operationInProgress(['HEAD', 'MERGE_HEAD'])).toBe('merge')
    expect(core.operationInProgress(['rebase-merge'])).toBe('rebase')
    expect(core.operationInProgress(['CHERRY_PICK_HEAD'])).toBe('cherry-pick')
    expect(core.operationInProgress(['HEAD', 'index'])).toBeNull()
    expect(core.operationInProgress(undefined)).toBeNull()
  })
})

describe('buildWriteArgs', () => {
  it('builds the argv itself — a caller cannot inject a flag', () => {
    const { args } = core.buildWriteArgs('stage', { paths: ['--hard', 'src/a.js'] })
    // `--` terminates options, so a file literally named `--hard` is a path.
    expect(args).toEqual(['add', '--', '--hard', 'src/a.js'])
  })

  it('keeps every destructive operation OUT of the safe table', () => {
    // The two tables are separate on purpose: an op that can lose work must not
    // sit one wrong lookup away from the ones that cannot.
    expect(Object.keys(core.WRITE_OPS)).toEqual([
      'stage', 'unstage', 'stage_all', 'unstage_all',
      'stash_push', 'stash_pop', 'fetch', 'pull', 'push', 'push_upstream',
    ])
    for (const op of Object.keys(core.DESTRUCTIVE_OPS)) {
      expect(core.WRITE_OPS[op]).toBeUndefined()
    }
    // Nothing in the safe table can discard a change: no reset --hard, no
    // clean, no checkout of a path, no force push.
    for (const [op, build] of Object.entries(core.WRITE_OPS)) {
      const argv = build(['a']).join(' ')
      expect(argv, op).not.toMatch(/--hard|--force|-f\b|^clean|^checkout/)
    }
  })

  it('refuses a destructive operation without confirm, and runs it with one', () => {
    for (const op of ['discard', 'discard_all', 'clean', 'reset_hard', 'stash_drop', 'unstage_hard']) {
      const gated = core.buildWriteArgs(op, { paths: ['a'] })
      expect(gated.error, op).toBeTruthy()
      // needsConfirm is the panel's cue to ASK. Reported as a plain error, a
      // deliberate gate looks like a broken button and gets clicked twice.
      expect(gated.needsConfirm, op).toBe(true)
      const allowed = core.buildWriteArgs(op, { paths: ['a'], confirm: true })
      expect(allowed.args, op).toBeTruthy()
      expect(allowed.destructive, op).toBe(true)
    }
    // An unknown op is still unknown, confirmed or not.
    expect(core.buildWriteArgs('rm', { paths: ['a'], confirm: true }).error).toBeTruthy()
    expect(core.buildWriteArgs('revert', { paths: ['a'], confirm: true }).error).toBeTruthy()
  })

  it('gates a branch switch and an amend, but not creating a branch', () => {
    expect(core.buildWriteArgs('checkout', { name: 'main' }).needsConfirm).toBe(true)
    expect(core.buildWriteArgs('checkout', { name: 'main', confirm: true }).args).toEqual(['checkout', 'main'])
    expect(core.buildWriteArgs('create_branch', { name: 'feat/x' }).args).toEqual(['checkout', '-b', 'feat/x'])
    expect(core.buildWriteArgs('commit', { message: 'm', amend: true }).needsConfirm).toBe(true)
    expect(core.buildWriteArgs('commit', { message: 'm', amend: true, confirm: true }).args)
      .toEqual(['commit', '--amend', '-m', 'm'])
  })

  it('validates a branch name as a ref — a name cannot become a flag', () => {
    for (const bad of ['--force', 'a b', 'a..b', 'x~1', 'y^', 'a:b', 'q?', 'w*', 'refs/', 'a//b', 'x.lock']) {
      expect(core.buildWriteArgs('create_branch', { name: bad }).error, bad).toBeTruthy()
    }
    expect(core.buildWriteArgs('create_branch', { name: 'feature/JIRA-12_fix.v2' }).args).toBeTruthy()
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
