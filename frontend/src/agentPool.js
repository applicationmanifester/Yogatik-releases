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

const DEFAULT_LIMIT = 4    // semaphore's idle value before any batch configures it
const MIN_LIMIT = 1
const MAX_LIMIT = 16       // safety ceiling: beyond this providers 429 hard

let limit = DEFAULT_LIMIT
let active = 0
const waiters = [] // queued acquire() callbacks

/** Set the global concurrency budget (clamped). */
export function configureConcurrency(n) {
  const v = Math.floor(Number(n))
  if (Number.isFinite(v)) limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, v))
  // A raised limit may let queued waiters proceed immediately.
  while (active < limit && waiters.length) waiters.shift()()
  return limit
}

export function getConfiguredConcurrency() { return limit }
export function activeCount() { return active }

function acquire() {
  return new Promise((resolve) => {
    const attempt = () => {
      if (active < limit) { active++; resolve() }
      else waiters.push(attempt)
    }
    attempt()
  })
}

function release() {
  active = Math.max(0, active - 1)
  const next = waiters.shift()
  if (next) next()
}

/** Run fn while holding one global slot; the slot is always released. */
export async function withSlot(fn) {
  await acquire()
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
export async function runAgentPool(items, worker) {
  if (!Array.isArray(items) || items.length === 0) return []
  const configured = await getAgentConcurrency()
  const limit = configured ?? Math.min(items.length, MAX_LIMIT) // auto = one slot per task
  configureConcurrency(limit)
  return Promise.all(items.map((item, i) =>
    withSlot(() => worker(item, i)).catch((e) => ({ error: e?.message || String(e) }))
  ))
}

/** Test hook: reset the semaphore to defaults. */
export function _resetAgentPool() {
  limit = DEFAULT_LIMIT
  active = 0
  waiters.length = 0
}
