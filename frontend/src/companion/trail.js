/**
 * What the companion noticed, and why it stayed quiet.
 *
 * A well-behaved companion is silent most of the time — the speak gate exists
 * so it does not narrate every window switch. But from outside, "working
 * correctly and saying nothing" and "broken and saying nothing" look identical,
 * and the second reading is the one users reach for. They then turn watching
 * off, which is the only outcome that makes the feature worthless.
 *
 * So every round leaves a receipt: it looked, it skipped, it saw a change, it
 * had nothing to add, the budget ran out. Cheap, local, and never sent to a
 * model — this is UI evidence, not context.
 *
 * PURE: a ring buffer and a formatter, no DOM, no imports.
 */

export const KIND = {
  LOOK: 'look',          // a frame was captured and sent
  SKIP: 'skip',          // the loop decided not to look
  QUIET: 'quiet',        // it looked, and chose to say nothing
  SPOKE: 'spoke',        // it said something
  ERROR: 'error',
  SOURCE: 'source',      // watching started/stopped, share revoked
}

/** Kept small on purpose: this is a glanceable trail, not a log file. */
export const CAPACITY = 40

export function createTrail({ capacity = CAPACITY, now = () => Date.now() } = {}) {
  let entries = []
  let seq = 0
  const listeners = new Set()

  function emit() {
    const snapshot = entries
    for (const fn of listeners) { try { fn(snapshot) } catch { /* a bad listener must not stop the loop */ } }
  }

  function push(kind, detail = {}) {
    const entry = { id: ++seq, kind, at: now(), ...detail }

    // Collapse a repeat of the same skip reason into a count instead of
    // printing it forty times. An idle desktop emits one identical "screen has
    // not changed" every few seconds, and forty of those rows push every
    // interesting event off the end of the buffer.
    const last = entries[entries.length - 1]
    if (last && last.kind === kind && last.reason === entry.reason && kind === KIND.SKIP) {
      const merged = { ...last, at: entry.at, count: (last.count || 1) + 1 }
      entries = [...entries.slice(0, -1), merged]
      emit()
      return merged
    }

    entries = [...entries, entry].slice(-capacity)
    emit()
    return entry
  }

  return {
    push,
    look: (detail) => push(KIND.LOOK, detail),
    skip: (reason) => push(KIND.SKIP, { reason }),
    quiet: (reason) => push(KIND.QUIET, { reason }),
    spoke: (text) => push(KIND.SPOKE, { text: String(text || '').slice(0, 240) }),
    error: (message) => push(KIND.ERROR, { reason: String(message || 'Unknown error') }),
    source: (reason) => push(KIND.SOURCE, { reason }),
    all: () => entries,
    clear: () => { entries = []; emit() },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

/** One short line per entry, for the trail strip. */
export function describeEntry(e) {
  if (!e) return ''
  const times = e.count > 1 ? ` ×${e.count}` : ''
  switch (e.kind) {
    case KIND.LOOK: return `Looked${e.reason ? ` — ${e.reason}` : ''}`
    case KIND.SKIP: return `${e.reason || 'Skipped'}${times}`
    case KIND.QUIET: return `Nothing worth interrupting for${e.reason ? ` — ${e.reason}` : ''}`
    case KIND.SPOKE: return e.text || 'Said something'
    case KIND.ERROR: return `Could not look — ${e.reason}`
    case KIND.SOURCE: return e.reason || 'Source changed'
    default: return e.reason || e.kind
  }
}

/**
 * A one-line answer to "is it actually doing anything?", derived from the
 * trail rather than from a separate counter that can drift out of step with it.
 */
export function summarize(entries = [], { now = Date.now() } = {}) {
  const looks = entries.filter(e => e.kind === KIND.LOOK).length
  const spoke = entries.filter(e => e.kind === KIND.SPOKE).length
  const last = entries[entries.length - 1]
  const quiet = entries.filter(e => e.kind === KIND.QUIET).length
  return {
    looks,
    spoke,
    quiet,
    lastAt: last?.at ?? null,
    idleMs: last ? Math.max(0, now - last.at) : null,
    // Said plainly, because the honest version of "0 spoken" is not "idle" —
    // it is "watching and nothing needed saying", and those read very
    // differently to someone deciding whether to leave the feature on.
    headline: looks === 0
      ? 'Nothing looked at yet'
      : spoke === 0
        ? `${looks} look${looks === 1 ? '' : 's'} · nothing worth interrupting for`
        : `${looks} look${looks === 1 ? '' : 's'} · spoke ${spoke}×`,
  }
}
