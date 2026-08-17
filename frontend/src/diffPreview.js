/**
 * Diff preview — shows what a write will actually change, so the permission
 * card can display the patch instead of just a filename. Approving "write
 * src/app.js" tells you nothing; approving a visible patch does.
 *
 * Standard LCS line diff. Pure, no dependencies.
 */

function splitLines(text) {
  const s = String(text ?? '')
  if (s === '') return []
  return s.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
}

/** Rows of { type: 'same'|'add'|'del', text }. */
export function lineDiff(before, after) {
  const a = splitLines(before)
  const b = splitLines(after)

  // LCS table. Files here are approval-sized; O(n*m) is fine and exact.
  const n = a.length, m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const rows = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { rows.push({ type: 'del', text: a[i] }); i++ }
    else { rows.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < n) { rows.push({ type: 'del', text: a[i] }); i++ }
  while (j < m) { rows.push({ type: 'add', text: b[j] }); j++ }
  return rows
}

export function summarizeDiff(rows) {
  return {
    added: rows.filter(r => r.type === 'add').length,
    removed: rows.filter(r => r.type === 'del').length,
  }
}

/**
 * Unified-ish text rendering, context-trimmed and hard-capped so an enormous
 * rewrite cannot flood the approval card or the prompt.
 */
export function unifiedDiff(before, after, { maxLines = 200, context = 2 } = {}) {
  const rows = lineDiff(before, after)
  const { added, removed } = summarizeDiff(rows)
  if (!added && !removed) return 'No changes.'

  const keep = new Array(rows.length).fill(false)
  rows.forEach((r, idx) => {
    if (r.type === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep[k] = true
  })

  const out = []
  let elided = false
  for (let idx = 0; idx < rows.length; idx++) {
    if (!keep[idx]) { elided = true; continue }
    if (elided) { out.push('…'); elided = false }
    const r = rows[idx]
    out.push((r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' ') + r.text)
    if (out.length >= maxLines) {
      const remaining = rows.length - idx - 1
      if (remaining > 0) out.push(`… ${remaining} more lines`)
      break
    }
  }
  return out.join('\n')
}
