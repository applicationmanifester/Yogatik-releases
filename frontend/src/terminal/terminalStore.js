// Renderer state for the shared terminal timeline.
//
// A module store rather than React state, for the same reason StreamingMessage
// exists: output arrives as a stream of small chunks, and putting every one of
// them through setState re-renders the whole drawer per chunk. A build emits
// thousands. Subscribers get a coalesced notification instead.
//
// PURE-ish: no DOM, no bridge. The hook wires it to IPC.

const MAX_BLOCKS = 200

/** chatId -> { blocks: Map<id, block>, order: string[] } */
const timelines = new Map()
const listeners = new Set()

let notifyScheduled = false
function notify() {
  // Coalesce to one notification per frame. Main already batches output at
  // ~60ms; this covers the case of several blocks changing at once.
  if (notifyScheduled) return
  notifyScheduled = true
  const fire = () => {
    notifyScheduled = false
    for (const fn of listeners) { try { fn() } catch { /* a bad listener is not our problem */ } }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire)
  else setTimeout(fire, 16)
}

const EMPTY_ARRAY = Object.freeze([])

function timelineFor(chatId) {
  const key = String(chatId ?? '')
  if (!timelines.has(key)) timelines.set(key, { blocks: new Map(), order: [], cachedList: EMPTY_ARRAY })
  return timelines.get(key)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Newest last, which is how a terminal reads. Referentially stable between mutations. */
export function getBlocks(chatId) {
  const t = timelineFor(chatId)
  if (!t.cachedList) {
    t.cachedList = t.order.map(id => t.blocks.get(id)).filter(Boolean)
  }
  return t.cachedList
}

export function getBlock(chatId, id) {
  return timelineFor(chatId).blocks.get(String(id)) || null
}

/** Replace the whole timeline — the answer to terminal:session on open. */
export function setSession(chatId, blocks) {
  const t = timelineFor(chatId)
  t.blocks = new Map()
  t.order = []
  for (const b of blocks || []) {
    t.blocks.set(b.id, { ...b, output: b.output || '' })
    t.order.push(b.id)
  }
  t.cachedList = null
  notify()
}

/**
 * A block started or finished. Merging rather than replacing matters: the
 * `finished` event carries the full output from main's ring buffer, but a
 * `started` event carries none — and replacing wholesale on start would wipe
 * output that arrived first if the two ever raced.
 */
export function upsertBlock(chatId, block) {
  if (!block?.id) return
  const t = timelineFor(chatId)
  const prev = t.blocks.get(block.id)
  t.blocks.set(block.id, {
    ...prev,
    ...block,
    output: block.output != null ? block.output : (prev?.output || ''),
  })
  if (!prev) {
    t.order.push(block.id)
    while (t.order.length > MAX_BLOCKS) {
      const dropped = t.order.shift()
      // Never evict a RUNNING block: output would keep arriving for a row the
      // UI has forgotten, and its Stop button would vanish with it.
      if (t.blocks.get(dropped)?.status === 'running') { t.order.unshift(dropped); break }
      t.blocks.delete(dropped)
    }
  }
  t.cachedList = null
  notify()
}

export function appendOutput(chatId, blockId, chunk) {
  const t = timelineFor(chatId)
  const b = t.blocks.get(String(blockId))
  if (!b || !chunk) return
  t.blocks.set(b.id, { ...b, output: (b.output || '') + chunk })
  t.cachedList = null
  notify()
}

export function clearTimeline(chatId, keep = []) {
  setSession(chatId, keep)
}

export function _reset() {
  timelines.clear()
  listeners.clear()
}

/* ── derived ────────────────────────────────────────────────────────────── */

export function runningBlocks(chatId) {
  return getBlocks(chatId).filter(b => b.status === 'running')
}

/** Is the AGENT running something right now — the thing the badge reports. */
export function agentIsBusy(chatId) {
  return runningBlocks(chatId).some(b => b.author === 'agent')
}

export function statusLabel(b) {
  if (!b) return ''
  if (b.status === 'running') return 'running'
  if (b.status === 'failed') return b.error || 'did not start'
  if (b.status === 'killed') return 'stopped'
  return b.exitCode === 0 ? 'done' : `exit ${b.exitCode}`
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  return `${m}m ${Math.round((ms % 60000) / 1000)}s`
}
