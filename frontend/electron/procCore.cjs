// Bookkeeping for long-running processes. Pure and electron-free so vitest can
// drive it; the spawning itself lives in processes.cjs.
//
// terminal:exec was fire-and-wait with a 30 s timeout and output only at the
// end, so a dev server, a log tail or a watch-mode test run was impossible —
// which ruled out the core inner loop of real development.

/** Output store that keeps the NEWEST bytes and reports when it dropped some. */
function createRingBuffer(maxChars = 200000) {
  let buf = ''
  let dropped = false
  let written = 0

  return {
    push(chunk) {
      const s = String(chunk ?? '')
      if (!s) return
      written += s.length
      buf += s
      if (buf.length > maxChars) {
        buf = buf.slice(buf.length - maxChars)
        dropped = true
      }
    },
    text() { return buf },
    truncated() { return dropped },
    /** Monotonic count of characters ever written — usable as a cursor. */
    cursor() { return written },
    /** Everything written after `cursor` (as much as still fits in the ring). */
    since(cursor) {
      const n = written - (Number(cursor) || 0)
      if (n <= 0) return ''
      return n >= buf.length ? buf : buf.slice(buf.length - n)
    },
  }
}

function createRegistry({ maxPerChat = 8 } = {}) {
  const procs = new Map()

  return {
    add(entry) { procs.set(entry.id, entry); return entry },
    get(id) { return procs.get(id) },
    remove(id) { procs.delete(id) },
    list(chatId) {
      return [...procs.values()].filter(p => String(p.chatId) === String(chatId))
    },
    idsFor(chatId) { return this.list(chatId).map(p => p.id) },
    all() { return [...procs.values()] },
    canAdd(chatId) { return this.list(chatId).length < maxPerChat },
  }
}

module.exports = { createRingBuffer, createRegistry }
