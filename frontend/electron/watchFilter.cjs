// What the recursive watcher is allowed to wake the UI for. Pure and
// electron-free, so it is reachable from vitest — watcher.cjs itself requires
// electron at the top and is not.
//
// WHY THIS EXISTS: fs.watch(recursive) on Windows is ReadDirectoryChangesW over
// the WHOLE granted tree. One `npm install` or `git checkout` is thousands of
// events, and each used to cost a debounce timer, an IPC message, a full cache
// invalidation and a re-listing of whichever folder was open — while nothing
// the user could see had changed. Dropping the churn at the source is the fix;
// debouncing it only spreads the same work out.

/** Directories whose contents are never what the user is editing. */
const NOISE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'build', 'out',
  '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache', 'coverage',
  '.vite', '.svelte-kit', 'target', '__pycache__', '.pytest_cache',
  'release-electron', '.venv', 'venv',
])

// Editors write-then-rename through temporaries; vim even creates a file
// literally called `4913` to probe whether a directory is writable. Reporting
// those makes rows appear and vanish in the tree for no reason.
const NOISE_FILE = /(^|\/)(\.#|~\$)|\.(swp|swx|tmp|temp|part|crdownload|lock)$|(^|\/)4913$|~$/i

/**
 * `.git` is noise for the FILE TREE and the only signal that exists for the
 * Source Control panel. Dropping it wholesale leaves the panel stale after
 * every commit; forwarding all of it replays the hundreds of object writes a
 * checkout makes. Only the paths that mean "the repository state moved" pass.
 */
const GIT_SIGNAL = /^\.git\/(HEAD|index|ORIG_HEAD|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|refs\/|packed-refs)/

function isNoise(rel) {
  if (!rel) return false
  const parts = String(rel).split('/')
  // Only the DIRECTORY segments are checked: a file legitimately named
  // `build` or `target` is content, not churn.
  for (let i = 0; i < parts.length - 1; i++) if (NOISE_DIRS.has(parts[i])) return true
  return NOISE_FILE.test(rel)
}

function isGitSignal(rel) {
  return GIT_SIGNAL.test(String(rel || ''))
}

/** 'git' | 'tree' | null — null means "do not wake anyone for this". */
function classify(rel) {
  if (isGitSignal(rel)) return 'git'
  if (isNoise(rel)) return null
  return 'tree'
}

module.exports = { classify, isNoise, isGitSignal, NOISE_DIRS, NOISE_FILE, GIT_SIGNAL }
