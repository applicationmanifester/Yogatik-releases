/**
 * agentPool — one global concurrency budget shared by every sub-agent runner
 * (spawn_agents, crew_orchestrator, map-reduce, best-of-N). Running many agent
 * instances at once is what cuts wall-clock time and enables best-of-N quality,
 * but unbounded fan-out storms provider rate limits — so ALL of them draw from a
 * single semaphore. A finished slot immediately starts the next queued task
 * (rolling window, not batch-of-N), results keep input order, and one failing
 * task never sinks the batch.
 *
 * By default concurrency is AUTO: a batch runs as many instances at once as it
 * has tasks — "as many as necessary" — bounded only by MAX_LIMIT, a safety
 * ceiling that exists because providers hard-429 past a point (an unbounded
 * fan-out would just fail). Setting chat_prefs.max_parallel_agents overrides the
 * auto default with an explicit number. Works identically in the web and desktop
 * builds. The semaphore is DOM-free and unit-tested.
 */

// These were set to Infinity. That does not make the app faster — it deletes
// the one mechanism the paragraph above describes. An "unbounded autonomous
// swarm" against Groq, OpenAI or OpenRouter is a 429 storm: a 40-item
// map_reduce fires 40 simultaneous requests, most of them fail, and the failure
// surfaces to the user as the app being broken rather than as a rate limit. The
// ceiling is not an arbitrary limit, it is the number past which providers
// refuse, so removing it makes large fan-outs slower AND less reliable.
//
// configureConcurrency was also failing OPEN: `configureConcurrency(0)` and any
// non-numeric input both returned Infinity, so a bad or empty preference
// silently uncapped a rate-limit guard. Bad input must clamp to the safe end.
const DEFAULT_LIMIT = 4    // semaphore's idle value before any batch configures it
const MIN_LIMIT = 1
const MAX_LIMIT = 16       // safety ceiling: beyond this providers 429 hard

let limit = DEFAULT_LIMIT
let active = 0

/**
 * Queued acquires, GROUPED BY CHAT, served round-robin.
 *
 * A single FIFO array starves. Chat A fires a 40-item map_reduce and takes all
 * 16 slots with 24 queued; chat B then asks for 2 sub-agents and lands at
 * positions 25 and 26, so B waits for 24 of A's tasks before starting any of
 * its own. The pool exists to protect the provider from the fleet, not to let
 * whichever chat asked first monopolise it.
 *
 * Round-robin does NOT add concurrency — the global ceiling is unchanged and
 * still the only thing standing between a large fan-out and a 429 storm. It
 * changes who gets the next free slot, so every active chat makes progress.
 */
const queues = new Map()   // scope -> [attempt fns]
let cursor = 0             // round-robin position across scope keys

/** Set the global concurrency budget (clamped to MIN_LIMIT..MAX_LIMIT). */
export function configureConcurrency(n) {
  const v = Math.floor(Number(n))
  if (Number.isFinite(v)) limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, v))
  // A raised limit may let queued waiters proceed immediately.
  pump()
  return limit
}

/**
 * Raise the budget toward what a batch needs, never lower it.
 *
 * THE BUG THIS REPLACES: runAgentPool called configureConcurrency(batchSize) on
 * every batch, and the budget is global. Chat A starting a 40-item batch set it
 * to 16; chat B then starting a 2-item batch set it to 2 — throttling chat A's
 * sixteen in-flight agents down to two. One chat silently strangled another's
 * fan-out, and nothing anywhere reported it. Same class as every other global
 * mutated per-caller in this codebase.
 */
export function requestConcurrency(n) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return limit
  const want = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, v))
  if (want > limit) { limit = want; pump() }
  return limit
}

export function getConfiguredConcurrency() { return limit }
export function activeCount() { return active }
/** How many distinct chats currently have work queued or running. */
export function queuedScopes() { return queues.size }

/** Start as many queued waiters as the budget allows, fairly across chats. */
function pump() {
  while (active < limit && queues.size) {
    const keys = [...queues.keys()]
    const key = keys[cursor % keys.length]
    cursor++
    const q = queues.get(key)
    const next = q.shift()
    if (!q.length) queues.delete(key)
    if (next) next()
    else if (!queues.size) break
  }
}

function acquire(scope) {
  const key = scope == null ? '' : String(scope)
  return new Promise((resolve) => {
    const attempt = () => { active++; resolve() }
    if (active < limit && !queues.size) { attempt(); return }
    // Queue even when a slot looks free if others are already waiting —
    // jumping the queue is what makes round-robin meaningless.
    if (!queues.has(key)) queues.set(key, [])
    queues.get(key).push(attempt)
    pump()
  })
}

function release() {
  active = Math.max(0, active - 1)
  pump()
}

/**
 * Run fn while holding one global slot; the slot is always released.
 * `scope` is the chat the work belongs to, so the queue can be fair across
 * chats. Omitting it is safe — everything unscoped shares one bucket.
 */
export async function withSlot(fn, scope) {
  await acquire(scope)
  try { return await fn() }
  finally { release() }
}

export const MAX_CONCURRENCY = MAX_LIMIT

/**
 * The user's configured agent concurrency, or null for AUTO (as many as the
 * batch needs). An explicit chat_prefs.max_parallel_agents overrides auto.
 */
export async function getAgentConcurrency() {
  try {
    const { getSetting } = await import('./db')
    const prefs = (await getSetting('chat_prefs', {})) || {}
    const n = Number(prefs.max_parallel_agents)
    if (Number.isFinite(n) && n >= MIN_LIMIT) return Math.min(MAX_LIMIT, Math.floor(n))
  } catch { /* settings unavailable → auto */ }
  return null // auto
}

/**
 * Run `worker(item, i)` over `items` under the shared global budget.
 * Concurrency defaults to as many as the batch needs (capped by MAX_LIMIT); an
 * explicit max_parallel_agents pref overrides it. Rolling-window (via the
 * semaphore), order-preserving. A worker that throws yields `{ error }` in its
 * slot instead of rejecting the whole batch.
 */
export async function runAgentPool(items, worker, scope) {
  if (!Array.isArray(items) || items.length === 0) return []
  const configured = await getAgentConcurrency()
  const want = configured ?? Math.min(items.length, MAX_LIMIT) // auto = one slot per task
  // REQUEST, never set. Setting it lowered the ceiling for every other chat's
  // in-flight batch; requesting raises it toward what this batch needs and
  // leaves a larger neighbour alone.
  requestConcurrency(want)
  return Promise.all(items.map((item, i) =>
    withSlot(() => worker(item, i), scope).catch((e) => ({ error: e?.message || String(e) }))
  ))
}

/** Test hook: reset the semaphore to defaults. */
export function _resetAgentPool() {
  limit = DEFAULT_LIMIT
  active = 0
  queues.clear()
  cursor = 0
}
