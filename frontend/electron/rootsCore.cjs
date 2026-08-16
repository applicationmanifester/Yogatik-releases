// Pure workspace-root logic. Deliberately imports NO electron: vitest runs these
// under jsdom where require('electron') throws, and this is the security-critical
// half, so it must be unit-testable.

const path = require('path')
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

module.exports = { rootIdFor, emptyState, bindingKeys, resolveRootIds, resolveRootPaths }
