/**
 * ScheduledPanel.jsx — manager UI for the proactive assistant's scheduler
 * (scheduler.js stores tasks in `scheduled_tasks_v1`).
 *
 * Safety contract (mirrors scheduler.js): every schedule on this screen is
 * USER-created here and only here — there is no model-facing or tool-facing
 * path that creates, edits or cancels one, and there never will be one that
 * creates them. A due routine still runs as an ordinary turn through the
 * normal agent (see runWorkflowCore.js), so permissions and the action
 * boundary apply at run time; scheduling is not a bypass.
 *
 * Pure display rule: the panel only FORMATS the stored `nextDue` value — it
 * never recomputes a cadence for display, so what the list shows is exactly
 * what will fire.
 */

import React, { useEffect, useState } from 'react'
import { CalendarClock, Pause, Play, Ban, Plus } from 'lucide-react'
import { SCHEDULE_KIND, scheduleWorkflow, cancelScheduledTask, setScheduledEnabled, getScheduledTasks } from '../scheduler'
import { getWorkflows } from '../workflows'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Pure: a one-line cadence description built from the STORED spec. */
export function describeCadence(spec = {}) {
  const kind = spec.kind || SCHEDULE_KIND.ONCE
  if (kind === SCHEDULE_KIND.ONCE) return spec.at ? `once · ${new Date(spec.at).toLocaleString()}` : 'once'
  if (kind === SCHEDULE_KIND.INTERVAL) return `every ${Math.max(1, Math.round((Number(spec.everyMs) || 0) / 60000))} min`
  if (kind === SCHEDULE_KIND.DAILY) return `daily ${spec.time || '09:00'}`
  if (kind === SCHEDULE_KIND.WEEKLY) {
    const day = DAY_LABELS[((Number(spec.weekday) || 0) % 7 + 7) % 7]
    return `${day} ${spec.time || '09:00'} · weekly`
  }
  return 'once'
}

/** Pure display: format the stored nextDue value only (Infinity = one-off ran out). */
export function fmtNextDue(ts, now = Date.now()) {
  if (ts === Infinity) return 'done · one-off'
  const t = Number(ts)
  if (!t) return '—'
  if (t <= now) return 'due now'
  const mins = Math.round((t - now) / 60000)
  if (mins < 60) return `in ${mins} min`
  if (mins < 24 * 60) return `in ${Math.round(mins / 60)} h`
  return new Date(t).toLocaleString()
}

const BLANK = { workflowId: '', name: '', kind: SCHEDULE_KIND.DAILY, time: '09:00', weekday: 1, everyMin: 30, atLocal: '' }

/** Pure: turn a create-form draft into a stored spec (null = not schedulable yet). */
export function specForForm(f = {}) {
  const kind = f.kind || SCHEDULE_KIND.DAILY
  if (kind === SCHEDULE_KIND.ONCE) {
    const at = f.atLocal ? new Date(f.atLocal).getTime() : NaN
    return Number.isFinite(at) ? { kind, at } : null
  }
  if (kind === SCHEDULE_KIND.INTERVAL) return { kind, everyMs: Math.max(1, Math.floor(Number(f.everyMin) || 1)) * 60000 }
  if (kind === SCHEDULE_KIND.DAILY) return { kind, time: f.time || '09:00' }
  if (kind === SCHEDULE_KIND.WEEKLY) return { kind, weekday: ((Number(f.weekday) || 0) % 7 + 7) % 7, time: f.time || '09:00' }
  return null
}

const field = { padding: '6px 8px', borderRadius: 5, background: 'var(--bg-input, rgba(255,255,255,0.04))', border: '1px solid var(--border, rgba(255,255,255,0.1))', color: 'var(--text-primary, inherit)', fontSize: 13, width: '100%' }
const muted = { color: 'var(--text-secondary, rgba(255,255,255,0.6))' }

/**
 * `onToast` is optional: App-side hosts hand in their toast, and when it is not
 * provided the panel's own aria-live status line doubles as the feedback channel.
 * Embedded hosts (SkillsPanel) pass nothing and stay strictly read/writable.
 */
export function ScheduledPanel({ onToast = null } = {}) {
  const [tasks, setTasks] = useState([])
  const [flows, setFlows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [msg, setMsg] = useState('')

  const say = (m) => { setMsg(m); onToast?.(m) }

  const reload = async () => {
    try {
      const [t, w] = await Promise.all([getScheduledTasks(), getWorkflows()])
      setTasks(t || [])
      setFlows(w || [])
    } catch { /* unreadable storage: an empty honest list beats a crash */ }
    setLoaded(true)
  }
  useEffect(() => { reload() }, [])

  const shown = (tasks || []).filter(t => t && t.status !== 'cancelled') // cancelled rows are gone for the user too
  const setFormK = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const create = async (e) => {
    e.preventDefault()
    const wf = (flows || []).find(w => w.id === form.workflowId)
    if (!wf) { say('Pick a workflow to schedule'); return }
    const spec = specForForm(form)
    if (!spec) { say('Choose when it should run'); return }
    try {
      await scheduleWorkflow({ workflowId: wf.id, name: form.name.trim() || wf.name, spec })
      await reload()
      setShowCreate(false)
      setForm(BLANK)
      say(`Scheduled "${wf.name}"`)
    } catch (err) { say(err?.message || 'Could not schedule') }
  }

  const toggle = async (t) => {
    try {
      await setScheduledEnabled(t.id, t.enabled === false)
      say(t.enabled === false ? `Resumed "${t.name}"` : `Paused "${t.name}"`)
      await reload()
    } catch (err) { say(err?.message || 'Could not update') }
  }

  const cancel = async (t) => {
    try {
      await cancelScheduledTask(t.id)
      say(`Cancelled "${t.name}"`)
      await reload()
    } catch (err) { say(err?.message || 'Could not cancel') }
  }

  return (
    <div style={{ marginTop: 12, padding: 10, borderRadius: 8, border: '1px solid var(--border, rgba(255,255,255,0.1))', background: 'rgba(139, 92, 246, 0.08)' }} data-testid="scheduled-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, color: '#8b5cf6', fontWeight: 600, fontSize: 13 }}>
        <CalendarClock size={14} /> Scheduled runs
        <span style={{ ...muted, fontWeight: 400, marginLeft: 'auto' }}>
          <button className="small-btn" onClick={() => { setShowCreate(p => !p); if (!showCreate) setForm(BLANK) }} aria-expanded={showCreate}>
            <Plus size={12} /> New schedule
          </button>
        </span>
      </div>
      <p className="personalise-hint" style={{ marginTop: 0, ...muted }}>
        Runs a saved workflow on a clock while Yogatik is open. You create these — the assistant never schedules anything on its own.
      </p>

      <div aria-live="polite" style={{ fontSize: 12, ...muted, minHeight: 16, marginBottom: 4 }}>{msg}</div>

      {showCreate && (
        <form onSubmit={create} style={{ display: 'grid', gap: 6, marginBottom: 12, padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
          <label style={{ fontSize: 12, ...muted }}>Workflow
            <select value={form.workflowId} onChange={setFormK('workflowId')} style={{ ...field, marginTop: 3 }} aria-label="Workflow to schedule">
              <option value="" disabled>Select a saved workflow…</option>
              {(flows || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, ...muted }}>Name (optional)
            <input value={form.name} onChange={setFormK('name')} placeholder="Defaults to the workflow's name" style={{ ...field, marginTop: 3 }} aria-label="Schedule name" />
          </label>
          <label style={{ fontSize: 12, ...muted }}>Repeat
            <select value={form.kind} onChange={setFormK('kind')} style={{ ...field, marginTop: 3 }} aria-label="Cadence">
              <option value={SCHEDULE_KIND.DAILY}>Every day at a time</option>
              <option value={SCHEDULE_KIND.WEEKLY}>Weekly on a given day + time</option>
              <option value={SCHEDULE_KIND.INTERVAL}>Every N minutes</option>
              <option value={SCHEDULE_KIND.ONCE}>Once, at a date &amp; time</option>
            </select>
          </label>
          {form.kind === SCHEDULE_KIND.INTERVAL && (
            <label style={{ fontSize: 12, ...muted }}>Run every (minutes, min 1)
              <input type="number" min="1" value={form.everyMin} onChange={setFormK('everyMin')} style={{ ...field, marginTop: 3 }} aria-label="Interval minutes" />
            </label>
          )}
          {form.kind === SCHEDULE_KIND.ONCE && (
            <label style={{ fontSize: 12, ...muted }}>Date &amp; time
              <input type="datetime-local" value={form.atLocal} onChange={setFormK('atLocal')} style={{ ...field, marginTop: 3 }} aria-label="One-off run time" />
            </label>
          )}
          {(form.kind === SCHEDULE_KIND.DAILY || form.kind === SCHEDULE_KIND.WEEKLY) && (
            <label style={{ fontSize: 12, ...muted }}>Time
              <input type="time" value={form.time} onChange={setFormK('time')} style={{ ...field, marginTop: 3 }} aria-label="Run time" />
            </label>
          )}
          {form.kind === SCHEDULE_KIND.WEEKLY && (
            <label style={{ fontSize: 12, ...muted }}>Day of week
              <select value={form.weekday} onChange={setFormK('weekday')} style={{ ...field, marginTop: 3 }} aria-label="Day of week">
                {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="small-btn" onClick={() => { setShowCreate(false); setForm(BLANK) }}>Cancel</button>
            <button type="submit" className="small-btn btn-primary">Schedule</button>
          </div>
        </form>
      )}

      {!loaded ? (
        <p style={{ ...muted, fontSize: 12 }}>Loading schedules…</p>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '10px 4px' }}>
          <p style={{ ...muted, fontSize: 12, margin: '0 0 6px' }}>No scheduled tasks yet — pick a workflow above and give it a rhythm.</p>
          {!showCreate && (
            <button className="small-btn" onClick={() => setShowCreate(true)}><Plus size={12} /> Create a schedule</button>
          )}
        </div>
      ) : (
        shown.map(t => {
          const wf = (flows || []).find(w => w.id === t.workflowId)
          return (
            <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 4px', borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {t.name}
                  <span className="personalise-sub" style={{ ...muted, fontWeight: 400 }}> · {describeCadence(t.spec)}</span>
                </div>
                <span className="personalise-sub" style={{ ...muted, fontWeight: 400, fontSize: 11 }}>
                  {wf ? `▼ ${wf.name}` : 'workflow removed'} · Next: {fmtNextDue(t.nextDue)} · runs: {t.runCount || 0}{t.enabled === false ? ' · paused' : ''}
                </span>
              </div>
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" title={t.enabled === false ? 'Resume' : 'Pause'} aria-label={t.enabled === false ? `Resume ${t.name}` : `Pause ${t.name}`} onClick={() => toggle(t)}>
                  {t.enabled === false ? <Play size={13} /> : <Pause size={13} />}
                </button>
                <button className="icon-btn" title="Cancel schedule" aria-label={`Cancel ${t.name}`} onClick={() => cancel(t)} style={{ color: '#ef4444' }}>
                  <Ban size={13} />
                </button>
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

export default ScheduledPanel
