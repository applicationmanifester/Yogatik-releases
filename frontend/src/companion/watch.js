/**
 * When the companion is allowed to LOOK at the screen.
 *
 * A screen watcher that fires on a timer is a token furnace: most seconds the
 * screen has not meaningfully changed, and every look costs a vision call. This
 * decides three things, all of them cheaply and without a DOM:
 *
 *   1. has enough time passed since the last look?
 *   2. has the screen actually changed since then?
 *   3. is there budget left this hour?
 *
 * Same change-gating idea as video/video.js, which skips unchanged frames
 * rather than re-encoding them.
 */

export const DEFAULTS = {
  intervalMs: 20_000,      // never look more often than this
  maxPerHour: 40,          // hard ceiling on vision calls
  diffThreshold: 8,        // bits of a 64-bit aHash that must differ
}

export function createWatchState(overrides = {}) {
  return {
    ...DEFAULTS,
    ...overrides,
    lastLookAt: 0,
    lastHash: null,
    looks: [],             // timestamps, pruned to the trailing hour
    paused: false,
  }
}

/** Bits that differ between two equal-length hash strings. */
export function hammingDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

function pruneLooks(state, now) {
  const cutoff = now - 3_600_000
  state.looks = state.looks.filter((t) => t > cutoff)
  return state.looks
}

export function remainingBudget(state, now = Date.now()) {
  return Math.max(0, state.maxPerHour - pruneLooks(state, now).length)
}

/**
 * @returns {{ look: boolean, reason: string }} — reason is for the UI, so the
 * user can see WHY it is or is not watching rather than guessing.
 */
export function shouldLook(state, { now = Date.now(), hash = null, force = false } = {}) {
  if (state.paused) return { look: false, reason: 'Watching is paused.' }
  if (force) return { look: true, reason: 'Asked to look.' }

  if (now - state.lastLookAt < state.intervalMs) {
    const wait = Math.ceil((state.intervalMs - (now - state.lastLookAt)) / 1000)
    return { look: false, reason: `Too soon — ${wait}s to go.` }
  }
  if (remainingBudget(state, now) <= 0) {
    return { look: false, reason: 'Hourly look budget spent.' }
  }
  // First look has nothing to compare against, so it always goes.
  if (state.lastHash == null) return { look: true, reason: 'First look.' }
  if (hash == null) return { look: true, reason: 'No screen fingerprint available.' }

  const diff = hammingDistance(hash, state.lastHash)
  if (diff < state.diffThreshold) {
    return { look: false, reason: 'Screen has not changed.' }
  }
  return { look: true, reason: `Screen changed (${diff} bits).` }
}

/** Record that a look happened. Call ONLY when one actually did. */
export function noteLook(state, { now = Date.now(), hash = null } = {}) {
  state.lastLookAt = now
  if (hash != null) state.lastHash = hash
  state.looks.push(now)
  pruneLooks(state, now)
  return state
}

export function setPaused(state, paused) {
  state.paused = !!paused
  return state
}
