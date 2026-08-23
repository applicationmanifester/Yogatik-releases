// File journal — the undo half of the safety story.
//
// fs_write overwrote bytes in place and fs_delete --recursive called fs.rm on a
// tree, with no backup anywhere. The permission broker asks BEFORE; this is what
// lets you take it back AFTER.
//
// Electron-free so vitest can drive it against real temp directories.

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const MUTATING_OPS = ['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir']
const MUTATING = new Set(MUTATING_OPS)

function isMutating(op) { return MUTATING.has(String(op)) }

function copyTree(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) copyTree(path.join(src, name), path.join(dest, name))
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

/**
 * @param storeDir  where backups + index.jsonl live (userData/yogatik-journal)
 * @param maxBytes  soft cap; oldest entries are pruned past it
 * @param maxAgeMs  entries older than this are pruned on open
 */
function createJournal({ storeDir, maxBytes = 200 * 1024 * 1024, maxAgeMs = 14 * 24 * 3600 * 1000 } = {}) {
  const blobsDir = path.join(storeDir, 'blobs')
  const indexFile = path.join(storeDir, 'index.jsonl')

  fs.mkdirSync(blobsDir, { recursive: true })

  function readIndex() {
    try {
      return fs.readFileSync(indexFile, 'utf8')
        .split(/\r?\n/).filter(Boolean)
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .filter(Boolean)
        // Append order is the only reliable ordering: several ops inside one
        // millisecond share a ts, and a stable sort then leaves the OLDEST first
        // — "newest first" silently returned the wrong entry, and revert-the-last
        // reverted the wrong file.
        .map((e, i) => ({ ...e, _seq: i }))
    } catch { return [] }
  }

  // Newest first, with append order breaking same-millisecond ties.
  const newestFirst = (a, b) => (b.ts - a.ts) || (b._seq - a._seq)

  function append(entry) {
    try { fs.appendFileSync(indexFile, JSON.stringify(entry) + '\n', 'utf8') } catch { /* best effort */ }
  }

  /**
   * Capture the CURRENT state of `target` before a mutation. Returns the entry
   * (with id) so the caller can reference it. Never throws: a journal failure
   * must not block the operation the user approved.
   */
  function record({ chatId, op, target, note }) {
    const id = crypto.randomBytes(8).toString('hex')
    const entry = {
      id, chatId: String(chatId ?? ''), op, target, note: note || '',
      ts: Date.now(), existed: false, kind: null, blob: null,
    }
    try {
      const stat = fs.statSync(target)
      entry.existed = true
      entry.kind = stat.isDirectory() ? 'dir' : 'file'
      const blob = path.join(blobsDir, id)
      copyTree(target, blob)
      entry.blob = blob
    } catch {
      // Target does not exist yet — reverting means deleting whatever gets made.
      entry.existed = false
    }
    append(entry)
    return entry
  }

  /** Put `target` back the way it was when the entry was recorded. */
  function revert(id) {
    const entry = readIndex().find(e => e.id === id)
    if (!entry) return { success: false, error: 'No such journal entry.' }
    try {
      if (!entry.existed) {
        try { fs.rmSync(entry.target, { recursive: true, force: true }) } catch { /* already gone */ }
        return { success: true, restored: entry.target, removed: true }
      }
      if (!entry.blob || !fs.existsSync(entry.blob)) {
        return { success: false, error: 'The saved copy is no longer available.' }
      }
      try { fs.rmSync(entry.target, { recursive: true, force: true }) } catch { /* may not exist */ }
      copyTree(entry.blob, entry.target)
      return { success: true, restored: entry.target }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  /** Entries for a chat (or all), newest first. */
  function list(chatId) {
    const all = readIndex()
    const filtered = chatId == null ? all : all.filter(e => e.chatId === String(chatId))
    return filtered.slice().sort(newestFirst)
  }

  /** Drop entries past the age/size caps and delete their blobs. */
  function prune() {
    const all = readIndex()
    const now = Date.now()
    const kept = []
    let bytes = 0
    for (const e of all.slice().sort(newestFirst)) {
      let size = 0
      try { size = e.blob ? fs.statSync(e.blob).size : 0 } catch { size = 0 }
      const tooOld = now - e.ts > maxAgeMs
      if (tooOld || bytes + size > maxBytes) {
        if (e.blob) { try { fs.rmSync(e.blob, { recursive: true, force: true }) } catch { /* ignore */ } }
        continue
      }
      bytes += size
      kept.push(e)
    }
    try {
      // Rewrite in APPEND order (oldest first) and drop the read-time _seq:
      // the index is ordered by construction, and writing it back newest-first
      // would invert the file and make every later ordering wrong.
      const lines = kept
        .slice()
        .sort((a, b) => a._seq - b._seq)
        .map(({ _seq, ...e }) => JSON.stringify(e))
      fs.writeFileSync(indexFile, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
    } catch { /* ignore */ }
    return { kept: kept.length, dropped: all.length - kept.length }
  }

  prune()
  return { record, revert, list, prune }
}

module.exports = { createJournal, MUTATING_OPS, isMutating }
