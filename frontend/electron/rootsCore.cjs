// Pure workspace-root logic. Deliberately imports NO electron: vitest runs these
// under jsdom where require('electron') throws, and this is the security-critical
// half, so it must be unit-testable.

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const isWin = process.platform === 'win32'

/** Case-folded on Windows so C:\Work and c:\work are one root. */
function normaliseForId(p) {
  const n = path.resolve(p)
  return isWin ? n.toLowerCase() : n
}

/** Stable short id for a directory, so re-granting reuses the entry. */
function rootIdFor(p) {
  return crypto.createHash('sha256').update(normaliseForId(p)).digest('hex').slice(0, 12)
}

function emptyState() {
  return { version: 1, roots: {}, bindings: {} }
}

/** Binding keys in precedence order for a call context. */
function bindingKeys(ctx = {}) {
  const keys = []
  if (ctx.conversationId != null && ctx.conversationId !== '') keys.push(`chat:${ctx.conversationId}`)
  if (ctx.projectId != null && ctx.projectId !== '') keys.push(`project:${ctx.projectId}`)
  keys.push('default')
  return keys
}

/**
 * First binding that yields at least one REGISTERED root. Unknown ids are
 * dropped: the registry is the only authority, so a forged or stale id can
 * never widen access.
 */
function resolveRootIds(state, ctx) {
  const st = state || emptyState()
  for (const key of bindingKeys(ctx)) {
    const ids = (st.bindings?.[key] || []).filter(id => !!st.roots?.[id])
    if (ids.length) return ids
  }
  return []
}

function resolveRootPaths(state, ctx) {
  const st = state || emptyState()
  return resolveRootIds(st, ctx).map(id => st.roots[id].path)
}

function samePath(a, b) {
  return isWin ? a.toLowerCase() === b.toLowerCase() : a === b
}
function isUnder(child, parent) {
  const withSep = parent.endsWith(path.sep) ? parent : parent + path.sep
  return isWin
    ? child.toLowerCase().startsWith(withSep.toLowerCase())
    : child.startsWith(withSep)
}

/** The bound root that contains `abs`, or null. */
function containingRoot(rootPaths, abs) {
  for (const r of rootPaths) {
    const base = path.resolve(r)
    if (samePath(abs, base) || isUnder(abs, base)) return base
  }
  return null
}

/** Nearest ancestor of `p` that exists — the anchor for the symlink re-check. */
function nearestExisting(p) {
  let cur = path.resolve(p)
  for (;;) {
    if (fs.existsSync(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) return cur
    cur = parent
  }
}

/**
 * Resolve `target` inside one of `rootPaths`, or throw.
 *
 * Absolute paths ARE allowed (the model needs to name a file across several
 * roots, as Claude Code does) — safety comes from the containment check, not
 * from banning them. The realpath re-check runs against the nearest EXISTING
 * ancestor, so a symlinked parent cannot be used to create a file outside a
 * root; checking only when the target itself exists was the old gap.
 */
function resolveWithin(rootPaths, target) {
  const roots = (rootPaths || []).filter(Boolean)
  if (!roots.length) throw new Error('no folder granted')

  const primary = path.resolve(roots[0])
  const raw = target == null || target === '' ? '.' : String(target)
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(primary, raw)

  const rootPath = containingRoot(roots, abs)
  if (!rootPath) throw new Error(`${raw} is outside this chat's folders`)

  let realProbe
  let realRoot
  try { realProbe = fs.realpathSync(nearestExisting(abs)) } catch { realProbe = nearestExisting(abs) }
  try { realRoot = fs.realpathSync(rootPath) } catch { realRoot = rootPath }

  if (!samePath(realProbe, realRoot) && !isUnder(realProbe, realRoot)) {
    throw new Error(`${raw} is outside this chat's folders`)
  }
  return { absolutePath: abs, rootPath }
}

module.exports = {
  rootIdFor, emptyState, bindingKeys, resolveRootIds, resolveRootPaths,
  containingRoot, resolveWithin,
}
