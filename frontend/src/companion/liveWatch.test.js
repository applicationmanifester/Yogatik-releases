/**
 * The watch loop is the part that spends money while nobody is looking, so its
 * invariants are the ones worth pinning:
 *
 *   - a screen that has not changed must not reach the model
 *   - an unreadable frame is UNKNOWN, never "unchanged"
 *   - the hourly budget holds even when the user hammers Look
 *   - a slow turn must not be overlapped by the next tick
 *   - the cadence must back off on a static screen and snap back on a change
 *
 * Every dependency is injected, so none of this needs a browser or a model.
 */
import { describe, it, expect, vi } from 'vitest'
import { createLiveWatcher, STATUS } from './liveWatch'
import { createAdaptiveState, noteObservation, describeCadence, isBusy, FLOOR_MS, CEILING_MS } from './adaptive'
import { isSilence } from './companionChat'

/** A fake clock plus a manual scheduler, so time is ours. */
function harness({ frames = [], hashes = [], onLook = vi.fn(async () => 'said something'), ...rest } = {}) {
  let t = 1_000_000
  const timers = []
  let frame = 0
  let h = 0
  const statuses = []
  const watcher = createLiveWatcher({
    capture: async () => (frame < frames.length ? frames[frame++] : frames[frames.length - 1] ?? null),
    hash: async () => (h < hashes.length ? hashes[h++] : hashes[hashes.length - 1] ?? null),
    onLook,
    onStatus: (s) => statuses.push(s),
    now: () => t,
    schedule: (fn, ms) => { const id = timers.length; timers.push({ fn, at: t + ms }); return id },
    cancel: (id) => { if (timers[id]) timers[id] = null },
    ...rest,
  })
  return {
    watcher, statuses, onLook,
    advance(ms) { t += ms },
    async runDue() {
      for (let i = 0; i < timers.length; i++) {
        const job = timers[i]
        if (job && job.at <= t) { timers[i] = null; job.fn(); await Promise.resolve() }
      }
    },
    get time() { return t },
  }
}

const ZERO = '0'.repeat(64)
const ONE = '1'.repeat(64)

describe('liveWatch', () => {
  it('looks on the first round, then skips an unchanged screen', async () => {
    const h = harness({ frames: ['data:a'], hashes: [ZERO, ZERO] })
    await h.watcher.poll()
    expect(h.onLook).toHaveBeenCalledTimes(1)

    h.advance(60_000)                 // well past any interval
    const second = await h.watcher.poll()
    expect(h.onLook).toHaveBeenCalledTimes(1)
    expect(second.skipped).toBe(true)
    expect(second.reason).toMatch(/not changed/i)
  })

  it('looks again once the screen actually changes', async () => {
    const h = harness({ frames: ['data:a'], hashes: [ZERO, ONE] })
    await h.watcher.poll()
    h.advance(60_000)
    await h.watcher.poll()
    expect(h.onLook).toHaveBeenCalledTimes(2)
  })

  it('treats an unreadable frame as unknown, not as unchanged', async () => {
    // Going blind must not read as a still screen — that is how a watcher
    // silently stops watching.
    const h = harness({ frames: ['data:a'], hashes: [ZERO, null] })
    await h.watcher.poll()
    h.advance(60_000)
    await h.watcher.poll()
    expect(h.onLook).toHaveBeenCalledTimes(2)
  })

  it('does nothing at all without a screen source', async () => {
    const h = harness({ frames: [null], hashes: [ZERO] })
    const r = await h.watcher.poll()
    expect(h.onLook).not.toHaveBeenCalled()
    expect(r.skipped).toBe(true)
    expect(h.statuses.at(-1).state).toBe(STATUS.BLOCKED)
  })

  it('enforces the hourly budget even against a forced look', async () => {
    // shouldLook honours `force` before it checks the budget; the loop must not.
    const h = harness({
      frames: ['data:a'],
      hashes: Array(12).fill(null).map((_, i) => (i % 2 ? ONE : ZERO)),
      watchOverrides: { maxPerHour: 3, intervalMs: 0 },
    })
    for (let i = 0; i < 8; i++) { h.advance(1000); await h.watcher.look() }
    expect(h.onLook).toHaveBeenCalledTimes(3)
    expect(h.statuses.at(-1).budgetLeft).toBe(0)
  })

  it('never overlaps two rounds', async () => {
    let running = 0
    let peak = 0
    const slow = vi.fn(async () => {
      running++; peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 20))
      running--
    })
    const h = harness({ frames: ['data:a'], hashes: [ZERO, ONE, ZERO, ONE], onLook: slow })
    const a = h.watcher.look()
    const b = h.watcher.look()          // fired while the first is still in flight
    const [, second] = await Promise.all([a, b])
    expect(peak).toBe(1)
    expect(second.skipped).toBe(true)
  })

  it('reports why it is not looking, so the UI never has to guess', async () => {
    const h = harness({ frames: ['data:a'], hashes: [ZERO, ZERO] })
    await h.watcher.poll()
    h.advance(60_000)
    await h.watcher.poll()
    const last = h.statuses.at(-1)
    expect(last.reason).toBeTruthy()
    expect(last.looks).toBe(1)
    expect(last.skipped).toBeGreaterThan(0)
  })

  it('stop() cancels the pending tick', async () => {
    const h = harness({ frames: ['data:a'], hashes: [ZERO, ONE, ZERO] })
    h.watcher.start()
    // start() looks immediately; let that round finish before stopping, or the
    // assertion races the in-flight promise rather than testing the timer.
    await new Promise(r => setTimeout(r, 5))
    h.watcher.stop()
    const calls = h.onLook.mock.calls.length
    h.advance(600_000)
    await h.runDue()
    await new Promise(r => setTimeout(r, 5))
    expect(h.onLook.mock.calls.length).toBe(calls)
    expect(h.watcher.isRunning()).toBe(false)
  })

  it('a forced look ignores the change gate — the user asked', async () => {
    // "Nothing changed" is not an acceptable answer to a button press.
    const h = harness({ frames: ['data:a'], hashes: [ZERO, ZERO] })
    await h.watcher.poll()
    h.advance(60_000)
    await h.watcher.look()
    expect(h.onLook).toHaveBeenCalledTimes(2)
  })
})

describe('adaptive cadence', () => {
  it('backs off geometrically while nothing changes', () => {
    const s = createAdaptiveState()
    const first = s.intervalMs
    noteObservation(s, { changed: false })
    const second = s.intervalMs
    noteObservation(s, { changed: false })
    expect(second).toBeGreaterThan(first)
    expect(s.intervalMs).toBeGreaterThan(second)
  })

  it('never exceeds the ceiling', () => {
    const s = createAdaptiveState()
    for (let i = 0; i < 50; i++) noteObservation(s, { changed: false })
    expect(s.intervalMs).toBe(CEILING_MS)
  })

  it('snaps back to the floor on a change', () => {
    const s = createAdaptiveState()
    for (let i = 0; i < 10; i++) noteObservation(s, { changed: false })
    noteObservation(s, { changed: true })
    expect(s.intervalMs).toBe(FLOOR_MS)
  })

  it('keeps up with a user who is interacting, whatever the pixels do', () => {
    const s = createAdaptiveState()
    for (let i = 0; i < 10; i++) noteObservation(s, { changed: false })
    noteObservation(s, { changed: false, engaged: true })
    expect(s.intervalMs).toBe(FLOOR_MS)
  })

  it('calls a run of changes "busy"', () => {
    const s = createAdaptiveState()
    expect(isBusy(s)).toBe(false)
    for (let i = 0; i < 3; i++) noteObservation(s, { changed: true })
    expect(isBusy(s)).toBe(true)
  })

  it('describes itself in words a human can read', () => {
    const s = createAdaptiveState({ intervalMs: 8000 })
    expect(describeCadence(s)).toMatch(/every 8s/)
    s.intervalMs = 120000
    expect(describeCadence(s)).toMatch(/every 2 min/)
  })
})

describe('silence sentinel', () => {
  it('recognises the model choosing to say nothing, however it is dressed', () => {
    for (const t of ['NOTHING-TO-ADD', 'nothing to add', '  Nothing-To-Add. ', '**NOTHING-TO-ADD**', '']) {
      expect(isSilence(t), t).toBe(true)
    }
  })

  it('does not swallow a real answer that merely mentions it', () => {
    expect(isSilence('There is nothing to add to line 12, but the import is wrong.')).toBe(false)
    expect(isSilence('Your test is failing on a null check.')).toBe(false)
  })
})
