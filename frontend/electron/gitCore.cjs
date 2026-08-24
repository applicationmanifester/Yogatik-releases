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
}

function buildWriteArgs(op, { paths = [], message = '' } = {}) {
  if (op === 'commit') {
    const msg = String(message || '').trim()
    if (!msg) return { error: 'A commit message is required.' }
    if (msg.length > 4000) return { error: 'Commit message is too long.' }
    // -m takes the message as ONE argv entry; newlines and quotes in it are
    // data, not syntax, because nothing here goes through a shell.
    return { args: ['commit', '-m', msg] }
  }
  const build = WRITE_OPS[op]
  if (!build) return { error: `Unsupported git operation: ${op}` }
  const list = (Array.isArray(paths) ? paths : [paths]).filter(p => typeof p === 'string' && p)
  if (build.length > 0 && !list.length) return { error: 'No files selected.' }
  // A path may legitimately contain almost anything; what it must NOT do is
  // escape the repository or look like a flag once `--` has been passed.
  for (const p of list) {
    if (p.includes('\0') || /(^|[\\/])\.\.([\\/]|$)/.test(p)) {
      return { error: `Refusing a path that escapes the repository: ${p}` }
    }
  }
  return { args: build(list) }
}

/** `git status --porcelain` (v1). */
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
  }
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
  parseStatus, parseLog, parseBranches, summarizeStatus, isSafeGitArgs,
  buildWriteArgs, WRITE_OPS, READ_ONLY, REC, FIELD,
}
