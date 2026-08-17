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

module.exports = { parseStatus, parseLog, parseBranches, summarizeStatus, isSafeGitArgs, READ_ONLY, REC, FIELD }
