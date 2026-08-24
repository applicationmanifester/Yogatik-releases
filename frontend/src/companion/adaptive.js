/**
 * How often the companion looks, decided by what it has been seeing.
 *
 * watch.js answers "may I look now"; this answers "when should I next bother".
 * A fixed cadence is wrong in both directions: 20s is far too eager while the
 * user reads one page for ten minutes, and far too slow while they are moving
 * through a task. So the interval breathes — it backs off geometrically while
 * nothing changes and snaps back to the floor the moment something does.
 *
 * The capture itself is cheap and local (a canvas draw and a 64-bit hash); it
 * is the MODEL call that costs money, and watch.js already gates that on a
 * real pixel change. This layer exists to stop even the cheap work from
 * spinning a laptop fan at 3 looks a minute for an hour.
 *
 * Pure and clock-injected — the whole point is behaviour over time, which is
 * untestable if it reads the clock itself.
 */

export const FLOOR_MS = 6_000       // fastest cadence, right after a change
export const CEILING_MS = 120_000   // slowest cadence, on a static screen
export const GROWTH = 1.6           // how fast boredom sets in
export const ACTIVE_STREAK = 3      // consecutive changes before we call it "busy"

export function createAdaptiveState(overrides = {}) {
  return {
    floorMs: FLOOR_MS,
    ceilingMs: CEILING_MS,
    growth: GROWTH,
    intervalMs: overrides.floorMs ?? FLOOR_MS,
    idleRounds: 0,
    changeStreak: 0,
    ...overrides,
  }
}

/**
 * Fold one observation into the cadence.
 *
 * @param {object} state         from createAdaptiveState
 * @param {object} opts
 * @param {boolean} opts.changed did the screen actually differ this round
 * @param {boolean} opts.engaged the user is typing/talking to the companion —
 *                               keep up with them regardless of the pixels
 * @returns {object} the same state, mutated and returned for chaining
 */
export function noteObservation(state, { changed = false, engaged = false } = {}) {
  if (changed || engaged) {
    state.idleRounds = 0
    state.changeStreak = changed ? state.changeStreak + 1 : state.changeStreak
    state.intervalMs = state.floorMs
    return state
  }
  state.changeStreak = 0
  state.idleRounds += 1
  state.intervalMs = Math.min(
    state.ceilingMs,
    Math.round(state.intervalMs * state.growth),
  )
  return state
}

/** Milliseconds until the next capture should be attempted. */
export function nextDelay(state, { now = Date.now(), lastAt = 0 } = {}) {
  const due = lastAt + state.intervalMs
  return Math.max(0, due - now)
}

/** True while the user is visibly working through something. */
export function isBusy(state) {
  return state.changeStreak >= ACTIVE_STREAK
}

/**
 * A human-readable cadence, for the status line. "Every 6s" reads as
 * surveillance; "every 2 min" reads as ambient, and both are worth saying out
 * loud so the user is never guessing how often this thing is looking.
 */
export function describeCadence(state) {
  const s = Math.round(state.intervalMs / 1000)
  if (s < 60) return `every ${s}s`
  const m = Math.round(s / 60)
  return `every ${m} min`
}
