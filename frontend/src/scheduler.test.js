import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextDue, getDueTasksPure, SCHEDULE_KIND } from './scheduler'

// ── [proactive-scheduler] ── persistence tests share the fake settings table
// (REAL getSetting semantics — a null row means "no entry"), so scheduleWorkflow
// / markScheduleRun / pause / cancel run against the same store behavior the
// ScheduledPanel and the App ticker see, without touching IndexedDB.
const { rows } = vi.hoisted(() => ({ rows: new Map() }))
vi.mock('./db', () => ({
  getSetting: async (k, fallback = null) => {
    const v = rows.has(k) ? rows.get(k) : null
    return v != null ? v : fallback
  },
  setSetting: async (k, v) => { rows.set(k, v) },
}))

describe('scheduler nextDue (pure)', () => {
  it('once returns spec.at', () => {
    expect(nextDue({ kind: 'once', at: 12345 }, 1000)).toBe(12345)
  })
  it('interval enforces >=60s floor', () => {
    expect(nextDue({ kind: 'interval', everyMs: 1000, lastRun: 0 }, 0)).toBe(60_000)
    expect(nextDue({ kind: 'interval', everyMs: 3_600_000, lastRun: 1000 }, 0)).toBe(3_601_000)
  })
  it('daily rolls to tomorrow when time passed', () => {
    const base = new Date(2026, 9, 15, 10, 0, 0).getTime()
    const due = nextDue({ kind: 'daily', time: '09:00' }, base)
    const d = new Date(due)
    expect(d.getDate()).toBe(16)
    expect(d.getHours()).toBe(9)
  })
  it('daily today when time ahead', () => {
    const base = new Date(2026, 9, 15, 8, 0, 0).getTime()
    const due = nextDue({ kind: 'daily', time: '09:00' }, base)
    expect(new Date(due).getDate()).toBe(15)
  })
  it('weekly picks correct weekday', () => {
    // 2026-10-15 is a Thursday (4)
    const base = new Date(2026, 9, 15, 8, 0, 0).getTime()
    const due = nextDue({ kind: 'weekly', weekday: 1, time: '09:00' }, base) // Monday
    expect(new Date(due).getDay()).toBe(1)
    expect(due).toBeGreaterThan(base)
  })
})

describe('scheduler due filter (pure)', () => {
  it('returns only enabled due tasks', () => {
    const tasks = [
      { id: 'a', nextDue: 100, enabled: true },
      { id: 'b', nextDue: 9999, enabled: true },
      { id: 'c', nextDue: 50, enabled: false },
      { id: 'd', nextDue: 50, status: 'cancelled' },
    ]
    expect(getDueTasksPure(tasks, 1000).map((t) => t.id)).toEqual(['a'])
  })
  it('SCHEDULE_KIND has all four kinds', () => {
    expect(Object.values(SCHEDULE_KIND).sort()).toEqual(['daily', 'interval', 'once', 'weekly'])
  })
})

// ── [proactive-scheduler] ── the ticker's store contract: these are the exact
// mutations App's drain effect and ScheduledPanel's buttons make.
describe('scheduler persistence (ticker wiring)', () => {
  beforeEach(() => rows.clear())

  it('schedules a workflow with computed nextDue + flip-through setScheduledEnabled', async () => {
    const { scheduleWorkflow, setScheduledEnabled, getScheduledTasks, getDueSchedules } = await import('./scheduler')
    const rec = await scheduleWorkflow({ workflowId: 'wf_1', name: 'Standup brief', spec: { kind: SCHEDULE_KIND.DAILY, time: '09:00' } })
    expect(rec.enabled).toBe(true)
    expect(rec.status).toBe('active')
    expect(rec.runCount).toBe(0)
    expect(rec.nextDue).toBeGreaterThan(Date.now() - 1)

    // Pause: the due filter must drop it immediately.
    await setScheduledEnabled(rec.id, false)
    let stored = (await getScheduledTasks()).find((t) => t.id === rec.id)
    expect(stored.enabled).toBe(false)
    expect(stored.status).toBe('paused')
    expect((await getDueSchedules(Date.now() + 7 * 864e5)).some((t) => t.id === rec.id)).toBe(false)

    // Resume: active and due again once nextDue passes.
    await setScheduledEnabled(rec.id, true)
    stored = (await getScheduledTasks()).find((t) => t.id === rec.id)
    expect(stored.enabled).toBe(true)
    expect(stored.status).toBe('active')
  })

  it('markScheduleRun bumps runCount, advances interval nextDue, and finishes one-offs', async () => {
    const { scheduleWorkflow, markScheduleRun, getScheduledTasks, cancelScheduledTask } = await import('./scheduler')
    const at = Date.now()
    const iv = await scheduleWorkflow({ workflowId: 'wf_iv', name: 'Watch', spec: { kind: SCHEDULE_KIND.INTERVAL, everyMs: 5 * 60000 } })
    await markScheduleRun(iv.id, at)
    let stored = (await getScheduledTasks()).find((t) => t.id === iv.id)
    expect(stored.runCount).toBe(1)
    expect(stored.nextDue).toBe(at + 5 * 60000)

    const once = await scheduleWorkflow({ workflowId: 'wf_once', name: 'Peek', spec: { kind: SCHEDULE_KIND.ONCE, at: at - 1000 } })
    // In the past ⇒ due (pure filter), for the ticker to pick up on its next beat.
    expect(getDueTasksPure([once], at + 1).some((t) => t.id === once.id)).toBe(true)
    await markScheduleRun(once.id, at)
    stored = (await getScheduledTasks()).find((t) => t.id === once.id)
    expect(stored.runCount).toBe(1)
    expect(stored.nextDue).toBe(Infinity) // one-off consumed: the drain must never re-run it

    await cancelScheduledTask(iv.id)
    stored = (await getScheduledTasks()).find((t) => t.id === iv.id)
    expect(stored.status).toBe('cancelled')
    expect(stored.enabled).toBe(false)
  })
})
