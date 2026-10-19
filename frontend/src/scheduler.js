/**
 * scheduler.js — Local-first trusted workflow scheduler.
 *
 * Enables "proactive assistant" without a backend: user-approved workflows run
 * on a schedule (once / interval / daily / weekly). All state lives in Dexie
 * settings (`scheduled_tasks_v1`), execution itself stays in
 * backgroundWorkers (the scheduler only decides *what is due*).
 *
 * Safety rules:
 *  - Schedules are always user-created, never model-created.
 *  - A due task still goes through permissions.js + actionBoundary.js at run
 *    time — scheduling is not a bypass.
 *  - Pure helpers (nextDue, getDueTasksPure) are exported separately so tests
 *    never touch IndexedDB or clocks.
 */

import { getSetting, setSetting } from './db'

/* ── [audit] schedule lifecycle → local audit trail ──────────────────────────
 * Schedule creation/pause/cancel/run is exactly the kind of consequential
 * "proactive assistant" operation that should be visible after the fact, so
 * each store mutation below appends one trail entry: type + schedule id (+ a
 * cadence kind or run timestamp). Workflow names, prompt bodies and payloads
 * are NEVER recorded. The trail is a side-effect of a successful store write —
 * a record failure (auditTrail.record never throws; the try/catch is belt and
 * braces) never rolls back or delays the schedule itself.
 */
function noteScheduleAudit(type, id, detail = {}) {
  try {
    import('./auditTrail').then(m => m.record(type, { id, ...detail })).catch(() => {})
  } catch { /* [audit] never block the scheduler */ }
}

const KEY = 'scheduled_tasks_v1'

export const SCHEDULE_KIND = {
  ONCE: 'once',
  INTERVAL: 'interval',
  DAILY: 'daily',
  WEEKLY: 'weekly',
}

/** Pure: compute next run timestamp for a schedule spec. */
export function nextDue(spec = {}, from = Date.now()) {
  const kind = spec.kind || SCHEDULE_KIND.ONCE
  if (kind === SCHEDULE_KIND.ONCE) return spec.at || from
  if (kind === SCHEDULE_KIND.INTERVAL) {
    const everyMs = Math.max(60_000, Number(spec.everyMs) || 0)
    return (spec.lastRun || from) + everyMs
  }
  if (kind === SCHEDULE_KIND.DAILY) {
    const [h = 9, m = 0] = String(spec.time || '09:00').split(':').map(Number)
    const d = new Date(from)
    d.setHours(h || 0, m || 0, 0, 0)
    if (d.getTime() <= from) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  if (kind === SCHEDULE_KIND.WEEKLY) {
    const day = ((Number(spec.weekday) || 1) % 7 + 7) % 7 // 0=Sun..6=Sat
    const [h = 9, m = 0] = String(spec.time || '09:00').split(':').map(Number)
    const d = new Date(from)
    d.setHours(h || 0, m || 0, 0, 0)
    let delta = (day - d.getDay() + 7) % 7
    if (delta === 0 && d.getTime() <= from) delta = 7
    d.setDate(d.getDate() + delta)
    return d.getTime()
  }
  return from
}

/** Pure: filter scheduled tasks to those due at `now` and enabled. */
export function getDueTasksPure(tasks = [], now = Date.now()) {
  return (tasks || []).filter((t) => {
    if (!t || t.enabled === false || t.status === 'cancelled') return false
    return (t.nextDue || 0) <= now
  })
}

export async function getScheduledTasks() {
  try {
    const list = await getSetting(KEY, [])
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

async function saveScheduledTasks(list) {
  try { await setSetting(KEY, list || []) } catch {}
  return list || []
}

/**
 * Create a user-approved schedule. `spec` = { kind, at?, everyMs?, time?, weekday? }.
 * Returns the stored record with computed nextDue + idempotency key.
 */
export async function scheduleWorkflow({ workflowId, name = '', spec = {}, projectId = null } = {}) {
  if (!workflowId) throw new Error('workflowId required')
  const list = await getScheduledTasks()
  const now = Date.now()
  const rec = {
    id: `sched_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    workflowId,
    name: String(name || workflowId),
    spec,
    projectId,
    enabled: true,
    status: 'active',
    createdAt: now,
    lastRun: 0,
    nextDue: nextDue(spec, now),
    runCount: 0,
  }
  await saveScheduledTasks([rec, ...list])
  noteScheduleAudit('schedule_created', rec.id, { kind: (spec && spec.kind) || 'once' })   // [audit]
  return rec
}

export async function cancelScheduledTask(id) {
  const list = await getScheduledTasks()
  const next = list.map((t) => (t.id === id ? { ...t, enabled: false, status: 'cancelled' } : t))
  await saveScheduledTasks(next)
  const cancelled = next.find((t) => t.id === id) || null
  if (cancelled) noteScheduleAudit('schedule_cancelled', id)   // [audit]
  return cancelled
}

export async function setScheduledEnabled(id, enabled) {
  const list = await getScheduledTasks()
  const next = list.map((t) => (t.id === id ? { ...t, enabled: !!enabled, status: enabled ? 'active' : 'paused' } : t))
  await saveScheduledTasks(next)
  const updated = next.find((t) => t.id === id) || null
  if (updated) noteScheduleAudit(enabled ? 'schedule_resumed' : 'schedule_paused', id)   // [audit]
  return updated
}

/** Mark a schedule as run: bumps runCount/lastRun and recomputes nextDue. */
export async function markScheduleRun(id, at = Date.now()) {
  const list = await getScheduledTasks()
  const next = list.map((t) => {
    if (t.id !== id) return t
    const lastRun = at
    const nextDueTs = t.spec?.kind === SCHEDULE_KIND.ONCE ? Infinity : nextDue({ ...t.spec, lastRun }, at)
    return { ...t, lastRun, nextDue: nextDueTs, runCount: (t.runCount || 0) + 1 }
  })
  await saveScheduledTasks(next)
  const ran = next.find((t) => t.id === id) || null
  if (ran) noteScheduleAudit('schedule_ran', id, { at })   // [audit]
  return ran
}

/** All due + enabled schedules at `now`. */
export async function getDueSchedules(now = Date.now()) {
  return getDueTasksPure(await getScheduledTasks(), now)
}
