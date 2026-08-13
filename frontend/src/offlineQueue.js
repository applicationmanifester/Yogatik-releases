/**
 * Offline outbox — messages typed while disconnected are queued in localStorage
 * and replayed when the connection returns, instead of being lost to an error
 * modal. Pure and storage-backed so it survives a reload and is unit-testable.
 */
const KEY = 'yogatik.outbox'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode / full */ }
}

export function getOutbox() { return read() }
export function outboxSize() { return read().length }

/** Queue a message; returns the stored item. Blank text is ignored. */
export function enqueueOutbox(text) {
  const t = String(text || '').trim()
  if (!t) return null
  const item = { id: `ob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, text: t, at: Date.now() }
  write([...read(), item])
  return item
}

export function removeOutbox(id) { write(read().filter(i => i.id !== id)) }
export function clearOutbox() { write([]) }

/**
 * Replay the queue oldest-first through `sendFn(text)`. Each item is removed
 * BEFORE sending so a throwing send never loops it forever; a failed send is
 * re-queued at the back. Stops early if `isOnline()` goes false again.
 * @returns {Promise<number>} how many were sent
 */
export async function flushOutbox(sendFn, isOnline = () => navigator.onLine) {
  let sent = 0
  while (isOnline()) {
    const list = read()
    if (!list.length) break
    const [head, ...rest] = list
    write(rest)                      // remove before sending
    try {
      await sendFn(head.text)
      sent++
    } catch {
      write([...read(), head])       // re-queue at the back and stop
      break
    }
  }
  return sent
}
