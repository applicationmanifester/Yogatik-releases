/**
 * The companion's eyes: a capture loop that is allowed to be continuous
 * because almost none of its rounds cost anything.
 *
 * Three layers, and keeping them separate is the whole design:
 *
 *   capture + hash   local, ~1ms, free            — runs every round
 *   watch.js gate    time / change / budget       — decides if the model sees it
 *   adaptive.js      how often to bother at all   — breathes with the screen
 *
 * Before this existed the web companion had an "Ambient" switch and a "Watch"
 * switch, both wired to state that nothing read: companionAwareness's
 * shouldObserve/shouldSpeak/contextChanged/buildObservationPrompt were imported
 * into FloatingCompanion and never called once. The toggles lit up and the
 * companion did not look at anything.
 *
 * Everything the loop needs is injected — capture, hash, the turn runner, the
 * clock and the timer — so the interesting behaviour (does it skip a static
 * screen? does it stop at the budget? does it overlap a slow turn with the
 * next tick?) is testable with no browser and no model.
 */

import { createWatchState, shouldLook, noteLook, remainingBudget, hammingDistance, setPaused } from './watch'
import { createAdaptiveState, noteObservation, describeCadence, isBusy } from './adaptive'

export const STATUS = {
  IDLE: 'idle',
  WATCHING: 'watching',
  CAPTURING: 'capturing',
  THINKING: 'thinking',
  BLOCKED: 'blocked',
}

/**
 * @param {object} deps
 * @param {() => Promise<string|null>} deps.capture   screenshot as a data URL
 * @param {(d: string) => Promise<string|null>} deps.hash  perceptual fingerprint
 * @param {(look: object) => Promise<any>} deps.onLook  runs the actual turn
 * @param {(s: object) => void} [deps.onStatus]        UI feed
 * @param {object} [deps.watchOverrides]               interval / budget / threshold
 * @param {object} [deps.adaptiveOverrides]
 * @param {() => number} [deps.now]
 * @param {Function} [deps.schedule]  setTimeout-alike, injected for tests
 * @param {Function} [deps.cancel]    clearTimeout-alike
 */
export function createLiveWatcher({
  capture,
  hash,
  onLook,
  onStatus,
  watchOverrides = {},
  adaptiveOverrides = {},
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
} = {}) {
  const watch = createWatchState(watchOverrides)
  const adaptive = createAdaptiveState(adaptiveOverrides)

  let timer = null
  let running = false      // the loop is on
  let inFlight = false     // a round is mid-flight; never start a second
  let engaged = false      // the user is actively talking to the companion
  let lastReason = ''
  let looks = 0
  let skipped = 0

  const status = (state, extra = {}) => {
    onStatus?.({
      state,
      reason: lastReason,
      cadence: describeCadence(adaptive),
      intervalMs: adaptive.intervalMs,
      budgetLeft: remainingBudget(watch, now()),
      budgetMax: watch.maxPerHour,
      looks,
      skipped,
      busy: isBusy(adaptive),
      paused: watch.paused,
      ...extra,
    })
  }

  async function round({ force = false } = {}) {
    // A model turn can easily outlast the interval. Overlapping rounds would
    // double-spend the budget and interleave two answers in one transcript.
    if (inFlight) return { skipped: true, reason: 'Still working on the last look.' }
    inFlight = true
    try {
      status(STATUS.CAPTURING)
      const dataUrl = await capture?.()
      if (!dataUrl) {
        lastReason = 'No screen source shared.'
        noteObservation(adaptive, { changed: false, engaged })
        skipped++
        status(STATUS.BLOCKED)
        return { skipped: true, reason: lastReason }
      }

      // Promise.resolve, not `hash?.(…).catch` — with no hash function that
      // would call .catch on undefined and throw inside the loop.
      const fingerprint = await Promise.resolve(hash?.(dataUrl)).catch(() => null)
      // A null hash means UNKNOWN, never "unchanged" — going blind must not
      // read as a still screen, or the companion quietly stops looking.
      const changed = watch.lastHash == null || fingerprint == null
        ? true
        : hammingDistance(fingerprint, watch.lastHash) >= watch.diffThreshold
      noteObservation(adaptive, { changed, engaged })

      // shouldLook honours `force` before it checks the budget, which is right
      // for "the user pressed Look" but would let a held button spend the hour
      // in ten seconds. The ceiling is enforced here regardless.
      const overBudget = remainingBudget(watch, now()) <= 0
      const verdict = overBudget
        ? { look: false, reason: 'Hourly look budget spent.' }
        : shouldLook(watch, { now: now(), hash: fingerprint, force })
      lastReason = verdict.reason
      if (!verdict.look) {
        skipped++
        // The fingerprint still advances on a skipped round, or a screen that
        // drifts slowly never accumulates enough difference to trip the gate.
        if (fingerprint != null && !changed) watch.lastHash = fingerprint
        status(STATUS.WATCHING)
        return { skipped: true, reason: verdict.reason }
      }

      noteLook(watch, { now: now(), hash: fingerprint })
      looks++
      status(STATUS.THINKING)
      const result = await onLook?.({ dataUrl, hash: fingerprint, reason: verdict.reason, force })
      status(STATUS.WATCHING)
      return { looked: true, reason: verdict.reason, result }
    } catch (e) {
      lastReason = e?.message || String(e)
      status(STATUS.BLOCKED)
      return { error: lastReason }
    } finally {
      inFlight = false
    }
  }

  function tick() {
    timer = null
    if (!running) return
    round().finally(() => {
      if (running) timer = schedule(tick, adaptive.intervalMs)
    })
  }

  return {
    start() {
      if (running) return
      running = true
      setPaused(watch, false)
      status(STATUS.WATCHING)
      // First look immediately: a companion that waits 6s before noticing the
      // screen it was just pointed at reads as broken.
      tick()
    },
    stop() {
      running = false
      if (timer) cancel(timer)
      timer = null
      // If a round is mid-flight, status(IDLE) will fire once it resolves
      // (the finally block sets inFlight = false, and the next tick check
      // finds running===false and bails). We still fire IDLE immediately so
      // the watcher's own status feed reflects the intent — the UI-level
      // `watching` flag is managed separately in useCompanionBrain.
      status(STATUS.IDLE)
    },
    pause(on = true) {
      setPaused(watch, on)
      status(on ? STATUS.IDLE : STATUS.WATCHING)
    },
    /**
     * One look right now, bypassing the interval AND the change gate but NOT
     * the budget. This is the "Look at my screen" button: the user asked, so
     * "nothing changed" is not an answer.
     */
    look() { return round({ force: true }) },
    /**
     * One ordinary round — capture, fingerprint, and look ONLY if the gates
     * agree. This is exactly what the timer does, exposed so the loop's
     * behaviour is testable without pretending to be a clock.
     */
    poll() { return round() },
    /** The user is interacting — keep the cadence at the floor. */
    setEngaged(v) { engaged = !!v },
    isRunning: () => running,
    /** True when a round is still in-flight (useful for drain checks). */
    isInFlight: () => inFlight,
    getState: () => ({ watch, adaptive, looks, skipped, lastReason }),
  }
}
