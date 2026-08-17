/**
 * Permission broker — the enforcement layer for tool calls.
 *
 * Before this existed, `disabled_tools` was a global on/off switch and nothing
 * else: with fs_delete and terminal_run enabled, the model could delete any tree
 * inside the granted folders or run any shell command with no confirmation. The
 * "confirm before irreversible actions" line in the system prompt is guidance a
 * model can simply ignore; this is the part it cannot.
 *
 * Design rules:
 *  - FAIL CLOSED. No prompt handler, or a handler that throws, means DENY.
 *  - A denial is a normal tool result, not an exception, so the model adapts
 *    instead of the turn hanging.
 *  - Rules are layered chat -> project -> global, like the working-folder
 *    bindings, and DENY always beats ALLOW.
 */

import { getSetting, setSetting } from './db'

/** Tools that do something worth stopping for. Everything else reads. */
export const TOOL_RISK = {
  fs_read: 'read',
  fs_list: 'read',
  fs_search: 'read',
  fs_write: 'write',
  fs_edit: 'write',
  fs_mkdir: 'write',
  fs_move: 'write',
  fs_delete: 'destructive',
  terminal_run: 'destructive',
  // proc_start spawns a shell exactly like terminal_run — the only difference
  // is that it keeps running, which makes it MORE consequential, not less.
  proc_start: 'destructive',
  // Reading output, stopping a process you started, and read-only git are safe.
  proc_output: 'read',
  proc_stop: 'read',
  proc_list: 'read',
  git_status: 'read',
  git_log: 'read',
  git_diff: 'read',
  watch: 'read',
  fs_undo: 'write',
}

/** Unknown tools are 'read': this layer must not silently gate the other 80
 *  tools (weather, calculator, …) that never touch the user's machine. */
export function riskOf(tool) {
  return TOOL_RISK[tool] || 'read'
}

/** The argument that best identifies what a call will act on. */
function targetOf(tool, args = {}) {
  if (tool === 'terminal_run') return args.command || ''
  return args.path || args.src || args.dest || ''
}

function globToRegExp(glob) {
  const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + esc + '$', 'i')
}

export function ruleMatches(rule, tool, args) {
  if (!rule || rule.tool !== tool) return false
  if (!rule.pattern) return true
  return globToRegExp(rule.pattern).test(targetOf(tool, args))
}

function inScope(rule, ctx = {}) {
  if (rule.scope === 'chat') return rule.conversationId != null && String(rule.conversationId) === String(ctx.conversationId)
  if (rule.scope === 'project') return rule.projectId != null && String(rule.projectId) === String(ctx.projectId)
  return true // global
}

/**
 * Pure decision: 'allow' | 'deny' | 'ask'. Deny wins over allow regardless of
 * order or scope — a stored "never" must not be overridable by a broader yes.
 */
export function decide(rules, tool, args, ctx) {
  const applicable = (rules || []).filter(r => inScope(r, ctx) && ruleMatches(r, tool, args))
  if (applicable.some(r => r.outcome === 'deny')) return { outcome: 'deny', reason: 'a saved rule denies this' }
  if (applicable.some(r => r.outcome === 'allow')) return { outcome: 'allow', reason: 'a saved rule allows this' }
  if (riskOf(tool) === 'read') return { outcome: 'allow', reason: 'read-only' }
  return { outcome: 'ask', reason: 'no rule' }
}

/** Human-readable one-liner for the approval card. */
export function describeCall(tool, args = {}) {
  switch (tool) {
    case 'terminal_run':
      return `Run shell command: ${args.command || '(empty)'}`
    case 'fs_delete':
      return `Delete ${args.recursive ? 'recursively (whole directory tree): ' : ''}${args.path || '(unknown)'}`
    case 'fs_write':
      return `Write file: ${args.path || '(unknown)'}`
    case 'fs_edit':
      return `Edit file: ${args.path || '(unknown)'}`
    case 'fs_mkdir':
      return `Create directory: ${args.path || '(unknown)'}`
    case 'fs_move':
      return `Move ${args.src || '?'} → ${args.dest || '?'}`
    default:
      return `${tool} ${JSON.stringify(args).slice(0, 200)}`
  }
}

/**
 * Compute the patch a write would apply, by reading the file's current
 * contents. Returns null when there is nothing useful to show (new file with no
 * prior version, non-file tool, or the read failed).
 */
async function buildDiffPreview(tool, args = {}) {
  if (tool !== 'fs_write' && tool !== 'fs_edit') return null
  const { isDesktop } = await import('./tools/localFs')
  if (!isDesktop()) return null

  const core = window.__TAURI__?.core
  if (!core?.invoke) return null

  const { getWorkspaceCtx } = await import('./tools/localFs')
  let before = ''
  try {
    before = await core.invoke('fs_read', { path: args.path, ctx: getWorkspaceCtx() }) || ''
  } catch { before = '' } // new file

  let after
  if (tool === 'fs_write') {
    after = args.content ?? ''
  } else {
    const { oldString, newString, replaceAll } = args
    if (!oldString || !before.includes(oldString)) return null
    after = replaceAll
      ? before.split(oldString).join(newString ?? '')
      : before.replace(oldString, newString ?? '')
  }

  const { unifiedDiff, lineDiff, summarizeDiff } = await import('./diffPreview')
  const text = unifiedDiff(before, after, { maxLines: 120 })
  if (text === 'No changes.') return { text, ...summarizeDiff([]) }
  return { text, ...summarizeDiff(lineDiff(before, after)) }
}

// ── Runtime wiring ──────────────────────────────────────────────────────────

const RULES_KEY = 'permission_rules'
let promptFn = null
let rulesCache = null

/** App.jsx installs the UI here. Absent = deny (fail closed). */
export function setPermissionPrompt(fn) {
  promptFn = typeof fn === 'function' ? fn : null
}

export function _resetPermissions() {
  promptFn = null
  rulesCache = null
}

async function loadRules() {
  if (rulesCache) return rulesCache
  try { rulesCache = (await getSetting(RULES_KEY, [])) || [] } catch { rulesCache = [] }
  return rulesCache
}

async function saveRule(rule) {
  const rules = await loadRules()
  rulesCache = [...rules, rule]
  try { await setSetting(RULES_KEY, rulesCache) } catch { /* stays in memory */ }
}

export async function getPermissionRules() { return loadRules() }

export async function clearPermissionRules() {
  rulesCache = []
  try { await setSetting(RULES_KEY, []) } catch { /* ignore */ }
}

/**
 * Gate one tool call. Returns {allowed, reason} — never throws, so a refusal
 * flows back to the model as an ordinary tool result.
 */
export async function requestPermission(tool, args, ctx = {}) {
  let rules = []
  try { rules = await loadRules() } catch { rules = [] }

  const verdict = decide(rules, tool, args, ctx)
  if (verdict.outcome === 'allow') return { allowed: true, reason: verdict.reason }
  if (verdict.outcome === 'deny') return { allowed: false, reason: `Denied: ${verdict.reason}` }

  if (!promptFn) {
    return { allowed: false, reason: 'Denied: no approval UI is available to confirm this action.' }
  }

  // Show the actual patch for a write — approving "write src/app.js" tells you
  // nothing; approving a visible diff does. Best-effort: never block on it.
  let diff = null
  try { diff = await buildDiffPreview(tool, args) } catch { diff = null }

  let answer
  try {
    answer = await promptFn({
      tool,
      args,
      ctx,
      risk: riskOf(tool),
      description: describeCall(tool, args),
      diff,
    })
  } catch {
    return { allowed: false, reason: 'Denied: the approval prompt failed.' }
  }

  if (!answer || answer.outcome !== 'allow') {
    return { allowed: false, reason: 'Denied by the user.' }
  }

  // remember: 'once' (default) | 'chat' | 'project' | 'global'
  if (answer.remember && answer.remember !== 'once') {
    const rule = { tool, outcome: 'allow', scope: answer.remember, at: Date.now() }
    if (answer.remember === 'chat') rule.conversationId = ctx.conversationId
    if (answer.remember === 'project') rule.projectId = ctx.projectId
    if (answer.pattern) rule.pattern = answer.pattern
    await saveRule(rule)
  }
  return { allowed: true, reason: 'Approved by the user.' }
}
