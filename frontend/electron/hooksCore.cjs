// Hook configuration parsing and matching. Pure, electron-free, testable.
//
// SECURITY NOTE. A hooks file is executable content that arrives inside a
// repository — cloning a project must never be enough to run commands on the
// user's machine. So:
//   * hooks are DISABLED for a root until the user explicitly trusts that root;
//   * the trust list lives in app state, never in the repo;
//   * the number of hooks is capped so a hostile file cannot queue thousands of
//     processes.
// This mirrors the working-folder grant: the repo proposes, the human disposes.

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'TurnComplete']
const EVENTS = new Set(HOOK_EVENTS)
const MAX_HOOKS = 50

function parseHooksFile(text) {
  let parsed
  try { parsed = JSON.parse(String(text || '')) } catch { return [] }
  const list = Array.isArray(parsed?.hooks) ? parsed.hooks : []
  const out = []
  for (const h of list) {
    if (!h || typeof h.command !== 'string' || !h.command.trim()) continue
    if (!EVENTS.has(h.event)) continue
    out.push({
      event: h.event,
      match: typeof h.match === 'string' && h.match.trim() ? h.match.trim() : '*',
      command: h.command.trim(),
      timeout: Number.isFinite(h.timeout) ? Math.min(h.timeout, 120000) : 30000,
    })
    if (out.length >= MAX_HOOKS) break
  }
  return out
}

function globToRegExp(glob) {
  const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + esc + '$', 'i')
}

function matchHooks(hooks, event, toolName) {
  return (hooks || []).filter(h => h.event === event && globToRegExp(h.match).test(String(toolName || '')))
}

/** Hooks run ONLY for roots the user explicitly trusted. Default: off. */
function hooksEnabledFor(state, rootPath) {
  const trusted = Array.isArray(state?.trustedHookRoots) ? state.trustedHookRoots : []
  return trusted.includes(rootPath)
}

module.exports = { HOOK_EVENTS, parseHooksFile, matchHooks, hooksEnabledFor, MAX_HOOKS }
