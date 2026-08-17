// Filtering rules for fs_search. Pure and electron-free so vitest can reach it.
//
// The original fs_search walked up to 20 000 entries and read EVERY file as
// UTF-8 with no gitignore handling, no binary detection and no size cap. Point
// that at a repo containing node_modules or .git and it reads hundreds of
// megabytes of binary data into strings — the most likely cause of the app
// appearing frozen.

const DEFAULT_SKIP_DIRS = [
  '.git', '.hg', '.svn',
  'node_modules', 'bower_components', 'vendor',
  'dist', 'build', 'out', 'target', 'coverage',
  '.next', '.nuxt', '.cache', '.parcel-cache', '.turbo',
  'venv', '.venv', '__pycache__', '.tox',
  '.gradle', '.idea', '.vscode',
  'release-electron', 'dist-electron',
]

const SKIP_SET = new Set(DEFAULT_SKIP_DIRS)

function shouldSkipDir(name) {
  return SKIP_SET.has(String(name))
}

/**
 * A NUL byte in the first 8 KB is the same heuristic git uses. Cheap, and it
 * keeps images, archives and compiled output out of a text search.
 */
function looksBinary(buf) {
  if (!buf || !buf.length) return false
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

/** Extract usable patterns from .gitignore text. */
function parseGitignore(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('!'))
}

function patternToRegExp(pattern) {
  let p = pattern.trim()
  const rooted = p.startsWith('/')
  if (rooted) p = p.slice(1)
  const dirOnly = p.endsWith('/')
  if (dirOnly) p = p.slice(0, -1)

  const body = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')      // placeholder so * does not eat it
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '[^/]')

  // A bare name matches at any depth; a rooted one only from the top.
  const prefix = rooted ? '^' : '^(?:.*/)?'
  return new RegExp(`${prefix}${body}(?:/.*)?$`, 'i')
}

/**
 * Build a matcher over repo-relative paths. Returns a function; with no
 * patterns it is a constant false, so callers need no special case.
 */
function makeIgnoreMatcher(patterns = []) {
  const regexes = patterns.filter(Boolean).map(patternToRegExp)
  if (!regexes.length) return () => false
  return (relPath) => {
    const norm = String(relPath).split('\\').join('/').replace(/^\.\//, '')
    return regexes.some(re => re.test(norm))
  }
}

module.exports = {
  DEFAULT_SKIP_DIRS, shouldSkipDir, looksBinary, parseGitignore, makeIgnoreMatcher,
}
