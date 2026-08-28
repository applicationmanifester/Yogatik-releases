// Git porcelain parsing + argument safety. Pure and electron-free.
//
// Implementation note: this drives the SYSTEM git binary rather than bundling
// isomorphic-git. Git is itself open source and present on essentially every
// machine that would use the desktop app's file tools, it needs no new npm
// dependency, and it gives full fidelity. If a machine has no git, the tool
// says so plainly — isomorphic-git remains the option for that case.
//
// git is spawned with an ARGUMENT ARRAY, never a shell string, so nothing here
// is interpolated into a command line. isSafeGitArgs is defence in depth on top
// of that, and restricts the tool to read-only subcommands.

const READ_ONLY = new Set([
  'status', 'log', 'diff', 'branch', 'show', 'blame',
  'rev-parse', 'ls-files', 'remote', 'describe', 'shortlog', 'tag',
])

// Rejected even though we never use a shell: an argument carrying these is a
// sign of an injection attempt and is never legitimate for these subcommands.
const DANGEROUS = /[;&|`$><\n\r]/

function isSafeGitArgs(args) {
  if (!Array.isArray(args) || !args.length) return false
  if (!READ_ONLY.has(String(args[0]))) return false
  return args.every(a => typeof a === 'string' && !DANGEROUS.test(a))
}

// ── Write operations, for the Source Control panel only ────────────────────
//
// isSafeGitArgs stays READ-ONLY on purpose. The panel needs to stage and commit,
// and the wrong way to allow that is to widen that allowlist — the model can
// reach git_run, and `git checkout .` or `git reset --hard` would then be one
// hallucinated argument array away from destroying uncommitted work.
//
// Instead: a SEPARATE handler that takes an operation NAME plus data, and
// builds the argument array itself. There is no path by which a caller-supplied
// string becomes a git flag, so no argument can change what the command does.
// Every destructive operation is deliberately absent — nothing here can lose a
// committed or uncommitted change. `--` terminates options, so a file literally
// named `--hard` is still just a path.
const WRITE_OPS = {
  stage: (paths) => ['add', '--', ...paths],
  unstage: (paths) => ['reset', '-q', 'HEAD', '--', ...paths],
  stage_all: () => ['add', '-A'],
  unstage_all: () => ['reset', '-q', 'HEAD'],
  // Additive history/branch operations. None of these can lose a change:
  // a stash is a commit, a new branch only adds a ref, and fetch only writes
  // remote-tracking refs.
  stash_push: () => ['stash', 'push', '-u', '-m', 'yogatik'],
  stash_pop: () => ['stash', 'pop'],
  fetch: () => ['fetch', '--all', '--prune'],
  pull: () => ['pull', '--ff-only'],   // never --rebase, never a merge commit the user did not ask for
  push: () => ['push'],
  push_upstream: () => ['push', '-u', 'origin', 'HEAD'],
}

/**
 * Operations that can destroy work, and are therefore NOT in WRITE_OPS.
 *
 * The reason the two tables are separate is the same reason isSafeGitArgs is
 * read-only: the model reaches git_run, and anything that lives in one table
 * with the rest is one wrong lookup away from being reachable. These require
 * an explicit `confirm: true` from a human action in the panel, and git.cjs
 * journals a snapshot before running them so `fs_undo` can still recover the
 * working-tree state.
 *
 * `git checkout <branch>` is deliberately here rather than above: git refuses
 * to switch when it would overwrite a local change, but it happily carries
 * uncommitted work onto another branch, which is not what a user clicking a
 * branch name expects.
 */
const DESTRUCTIVE_OPS = {
  discard: (paths) => ['checkout', '--', ...paths],
  discard_all: () => ['checkout', '--', '.'],
  clean: () => ['clean', '-fd'],
  reset_hard: () => ['reset', '--hard', 'HEAD'],
  stash_drop: () => ['stash', 'drop'],
  unstage_hard: (paths) => ['reset', '--hard', '--', ...paths],
}

/** Branch operations take a NAME, which is validated as a ref rather than
 *  passed through — a branch called `--force` would otherwise be a flag. */
const BRANCH_OPS = {
  checkout: (name) => ['checkout', name],
  create_branch: (name) => ['checkout', '-b', name],
}
/** git check-ref-format's rules, as much of them as matters here. */
const VALID_REF = /^(?!-)(?!.*\.\.)(?!.*[~^:?*[\\\s])(?!.*\/\/)(?!.*\/$)(?!.*\.lock$)[^\0]{1,255}$/

function safePaths(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(p => typeof p === 'string' && p)
  for (const p of list) {
    // A path may legitimately contain almost anything; what it must NOT do is
    // escape the repository or look like a flag once `--` has been passed.
    if (p.includes('\0') || /(^|[\\/])\.\.([\\/]|$)/.test(p)) {
      return { error: `Refusing a path that escapes the repository: ${p}` }
    }
  }
  return { list }
}

function buildWriteArgs(op, { paths = [], message = '', name = '', amend = false, confirm = false } = {}) {
  if (op === 'commit') {
    const msg = String(message || '').trim()
    // --amend REWRITES the last commit. It is not destructive to the working
    // tree, but it does discard the previous message and can rewrite a commit
    // that has already been pushed, so it is confirmed like a branch switch.
    if (amend && !confirm) return { error: 'Amending the last commit needs confirmation.', needsConfirm: true }
    if (!msg) return { error: 'A commit message is required.' }
    if (msg.length > 4000) return { error: 'Commit message is too long.' }
    // -m takes the message as ONE argv entry; newlines and quotes in it are
    // data, not syntax, because nothing here goes through a shell.
    return { args: amend ? ['commit', '--amend', '-m', msg] : ['commit', '-m', msg] }
  }

  if (BRANCH_OPS[op]) {
    const ref = String(name || '').trim()
    if (!ref) return { error: 'A branch name is required.' }
    if (!VALID_REF.test(ref)) return { error: `Not a valid branch name: ${ref}` }
    if (op === 'checkout' && !confirm) {
      return { error: 'Switching branches needs confirmation.', needsConfirm: true }
    }
    return { args: BRANCH_OPS[op](ref) }
  }

  if (DESTRUCTIVE_OPS[op]) {
    if (!confirm) {
      return { error: `"${op}" permanently discards changes and needs confirmation.`, needsConfirm: true }
    }
    const build = DESTRUCTIVE_OPS[op]
    if (build.length === 0) return { args: build(), destructive: true }
    const { list, error } = safePaths(paths)
    if (error) return { error }
    if (!list.length) return { error: 'No files selected.' }
    return { args: build(list), destructive: true }
  }

  const build = WRITE_OPS[op]
  if (!build) return { error: `Unsupported git operation: ${op}` }
  if (build.length === 0) return { args: build() }
  const { list, error } = safePaths(paths)
  if (error) return { error }
  if (!list.length) return { error: 'No files selected.' }
  return { args: build(list) }
}

/**
 * `git status --porcelain=v2 -z --branch`.
 *
 * v1 was WRONG, not merely poorer. With the default core.quotePath, v1 emits a
 * non-ASCII path C-quoted — MEASURED: `src/café.js` comes back as the literal
 * eleven characters `"src/caf\303\251.js"`. Nothing in the app un-quotes that,
 * so every such file silently failed to match a tree row and simply had no
 * decoration; the panel listed a filename that does not exist on disk. v1 also
 * separates a rename with the string " -> ", which a filename may legitimately
 * contain, and separates records with newlines, which a filename may also
 * contain. `-z` removes all three problems at once: fields are NUL-separated
 * and paths are emitted raw.
 *
 * v2 additionally reports the upstream branch and the ahead/behind counts,
 * which v1 cannot express at all.
 *
 * @returns {{files: Array, branch: object}}
 */
function parseStatusV2(raw) {
  const rec = String(raw || '').split('\0')
  const files = []
  const branch = { head: null, upstream: null, ahead: 0, behind: 0, oid: null, detached: false }

  for (let i = 0; i < rec.length; i++) {
    const line = rec[i]
    if (!line) continue

    if (line[0] === '#') {
      const [, key, ...rest] = line.split(' ')
      const value = rest.join(' ')
      if (key === 'branch.oid') branch.oid = value === '(initial)' ? null : value
      else if (key === 'branch.head') {
        branch.detached = value === '(detached)'
        branch.head = branch.detached ? null : value
      } else if (key === 'branch.upstream') branch.upstream = value
      else if (key === 'branch.ab') {
        const m = /^\+(\d+) -(\d+)$/.exec(value)
        if (m) { branch.ahead = Number(m[1]); branch.behind = Number(m[2]) }
      }
      continue
    }

    if (line[0] === '?' || line[0] === '!') {
      // An ignored entry only appears when explicitly asked for; it is not a
      // change, so it is not reported as one.
      if (line[0] === '?') {
        files.push({
          path: line.slice(2), from: null,
          staged: false, unstaged: false, untracked: true,
          deleted: false, renamed: false, conflicted: false, x: '?', y: '?',
        })
      }
      continue
    }

    // `1 XY sub mH mI mW hH hI path` / `2 XY sub mH mI mW hH hI Xscore path` +
    // a SEPARATE NUL-terminated field holding the original path.
    // `u XY sub m1 m2 m3 mW h1 h2 h3 path`
    const kind = line[0]
    if (kind !== '1' && kind !== '2' && kind !== 'u') continue

    // Index of the path field. `1` has 8 fields before it, `2` adds the rename
    // score, `u` carries three stage hashes instead of two.
    const pathAt = kind === 'u' ? 10 : (kind === '2' ? 9 : 8)
    // Split off exactly the fixed fields; the path is whatever is left, spaces
    // included. A path is never truncated at a space this way.
    const parts = line.split(' ')
    const xy = parts[1] || '  '
    const filePath = parts.slice(pathAt).join(' ')
    let from = null
    if (kind === '2') { from = rec[++i] ?? null }   // consumes the next record

    const x = xy[0]
    const y = xy[1]
    files.push({
      path: filePath,
      from,
      staged: kind !== 'u' && x !== '.' && x !== ' ',
      unstaged: kind === 'u' || (y !== '.' && y !== ' '),
      untracked: false,
      deleted: x === 'D' || y === 'D',
      renamed: kind === '2',
      conflicted: kind === 'u',
      x, y,
    })
  }

  return { files, branch }
}

/** `git status --porcelain` (v1). Retained for `git_run`, which still lets the
 *  model ask for v1 directly, and for reading output produced elsewhere. */
function parseStatus(raw) {
  const out = []
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const x = line[0]
    const y = line[1]
    let rest = line.slice(3)
    let from = null
    if (rest.includes(' -> ')) {
      const [a, b] = rest.split(' -> ')
      from = a
      rest = b
    }
    out.push({
      path: rest,
      from,
      staged: x !== ' ' && x !== '?',
      unstaged: y !== ' ' && y !== '?',
      untracked: x === '?' || y === '?',
      deleted: x === 'D' || y === 'D',
      renamed: x === 'R' || y === 'R',
    })
  }
  return out
}

function summarizeStatus(files) {
  const list = files || []
  return {
    clean: list.length === 0,
    total: list.length,
    staged: list.filter(f => f.staged && !f.untracked).length,
    unstaged: list.filter(f => f.unstaged && !f.untracked).length,
    untracked: list.filter(f => f.untracked).length,
    conflicted: list.filter(f => f.conflicted).length,
  }
}

/**
 * What operation the repository is in the middle of, read from the presence of
 * marker files in .git. A panel that offers "commit" during an unresolved
 * rebase is offering the wrong thing, and git's own error message arrives only
 * after the user has typed a message.
 *
 * Pure: takes the set of names that exist, so the fs call stays in git.cjs.
 */
function operationInProgress(present) {
  const has = (n) => present?.includes?.(n)
  if (has('rebase-merge') || has('rebase-apply')) return 'rebase'
  if (has('MERGE_HEAD')) return 'merge'
  if (has('CHERRY_PICK_HEAD')) return 'cherry-pick'
  if (has('REVERT_HEAD')) return 'revert'
  if (has('BISECT_LOG')) return 'bisect'
  return null
}

// Record/field separators for `git log --format=...`. Control characters are
// used because they cannot occur in a commit subject, unlike any printable
// delimiter someone might legitimately type.
const REC = '\x1e'
const FIELD = '\x1f'

function parseLog(raw) {
  return String(raw || '')
    .split(REC)
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => {
      const [hash, author, date, ...subject] = r.split(FIELD)
      return { hash, author, date, subject: subject.join(FIELD) }
    })
}

function parseBranches(raw) {
  const out = []
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const current = line.startsWith('*')
    const name = line.replace(/^\*?\s+/, '').trim()
    if (!name || name.startsWith('(')) continue // detached HEAD placeholder
    out.push({ name, current })
  }
  return out
}

module.exports = {
  parseStatus, parseStatusV2, parseLog, parseBranches, summarizeStatus,
  operationInProgress, isSafeGitArgs, buildWriteArgs,
  WRITE_OPS, DESTRUCTIVE_OPS, BRANCH_OPS, READ_ONLY, VALID_REF, REC, FIELD,
}
