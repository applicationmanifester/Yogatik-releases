/**
 * ScheduledPanel.test.jsx — the manager UI for user-approved scheduled
 * workflows. db is mocked with the REAL getSetting semantics (fallback for a
 * null row) so scheduler.js's persistence paths run for real and the callbacks
 * can be asserted against the store they claim to write.
 */
import React from 'react'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ScheduledPanel, describeCadence, fmtNextDue } from './components/ScheduledPanel'
import { SCHEDULE_KIND, getScheduledTasks } from './scheduler'

// A fake settings table with the REAL db.js semantics (see chatScope.test.js).
// vi.hoisted so the hoisted vi.mock factory can close over it safely.
const { rows } = vi.hoisted(() => ({ rows: new Map() }))
vi.mock('./db', () => ({
  getSetting: async (k, fallback = null) => {
    const v = rows.has(k) ? rows.get(k) : null
    return v != null ? v : fallback
  },
  setSetting: async (k, v) => { rows.set(k, v) },
}))

const WF = [
  { id: 'wf_daily', name: 'Morning brief', steps: [{ prompt: 'greet' }] },
  { id: 'wf_research', name: 'Deep research', steps: [{ prompt: 'read {{topic}}' }] },
]

const SCHED = [
  {
    id: 'sched_daily', workflowId: 'wf_daily', name: 'Morning brief',
    spec: { kind: SCHEDULE_KIND.DAILY, time: '09:00' },
    enabled: true, status: 'active', nextDue: 0, runCount: 2,
  },
  {
    id: 'sched_weekly', workflowId: 'wf_research', name: 'Deep research',
    spec: { kind: SCHEDULE_KIND.WEEKLY, weekday: 1, time: '10:30' },
    enabled: false, status: 'paused', nextDue: 0, runCount: 0,
  },
]

describe('ScheduledPanel pure display helpers', () => {
  it('describeCadence formats every stored kind without recomputing it', () => {
    expect(describeCadence({ kind: 'daily', time: '09:00' })).toBe('daily 09:00')
    expect(describeCadence({ kind: 'interval', everyMs: 900000 })).toBe('every 15 min')
    expect(describeCadence({ kind: 'weekly', weekday: 1, time: '10:30' })).toBe('Mon 10:30 · weekly')
    expect(describeCadence({ kind: 'weekly', weekday: 0, time: '07:00' })).toBe('Sun 07:00 · weekly')
    expect(describeCadence({ kind: 'once', at: 12345 })).toContain('once ·')
    expect(describeCadence({})).toBe('once')
  })

  it('fmtNextDue formats the stored relative value and one-off completion', () => {
    const now = 1_800_000_000_000
    expect(fmtNextDue(Infinity, now)).toBe('done · one-off')
    expect(fmtNextDue(0, now)).toBe('—')
    expect(fmtNextDue(now - 1, now)).toBe('due now')
    expect(fmtNextDue(now + 2 * 60_000, now)).toBe('in 2 min')
    expect(fmtNextDue(now + 3 * 3_600_000, now)).toBe('in 3 h')
    expect(fmtNextDue(now + 5 * 24 * 3_600_000, now)).toBe(new Date(now + 5 * 24 * 3_600_000).toLocaleString())
  })
})

describe('ScheduledPanel', () => {
  beforeEach(() => {
    rows.clear()
    rows.set('workflows', WF)
    rows.set('scheduled_tasks_v1', SCHED.map(t => ({ ...t, nextDue: Date.now() + 120_000 })))
  })
  afterEach(cleanup)

  it('renders the scheduled list with cadence, next-due and run count', async () => {
    render(<ScheduledPanel />)
    expect(await screen.findByText('Morning brief')).toBeDefined()
    expect(screen.getByTestId('scheduled-panel').textContent).toContain('daily 09:00')
    expect(screen.getByTestId('scheduled-panel').textContent).toContain('in 2 min')
    expect(screen.getByTestId('scheduled-panel').textContent).toContain('runs: 2')
    expect(screen.getByTestId('scheduled-panel').textContent).toContain('paused')
  })

  it('shows the empty state when nothing is scheduled', async () => {
    rows.set('scheduled_tasks_v1', [])
    render(<ScheduledPanel />)
    expect(await screen.findByText(/No scheduled tasks yet/)).toBeDefined()
    expect(screen.getByRole('button', { name: /Create a schedule/i })).toBeDefined()
  })

  it('pause/resume go through setScheduledEnabled semantics on the store', async () => {
    render(<ScheduledPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pause Morning brief' }))
    await waitFor(async () => {
      const all = await getScheduledTasks()
      const t = all.find(x => x.id === 'sched_daily')
      expect(t.enabled).toBe(false)
      expect(t.status).toBe('paused')
    })
    // Paused row now offers Resume, and resuming flips it back to active.
    fireEvent.click(await screen.findByRole('button', { name: 'Resume Morning brief' }))
    await waitFor(async () => {
      const all = await getScheduledTasks()
      const t = all.find(x => x.id === 'sched_daily')
      expect(t.enabled).toBe(true)
      expect(t.status).toBe('active')
    })
  })

  it('cancel marks the schedule cancelled and drops it from the list', async () => {
    render(<ScheduledPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Deep research' }))
    await waitFor(async () => {
      const all = await getScheduledTasks()
      expect(all.find(x => x.id === 'sched_weekly').status).toBe('cancelled')
    })
    expect(screen.queryByText('Deep research')).toBeNull()
    // The other schedule is untouched.
    expect(screen.getByText('Morning brief')).toBeDefined()
  })

  it('create = user picks an existing workflow + cadence; lands in the store', async () => {
    render(<ScheduledPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /New schedule/i }))
    // Workflow select, then keep the default "daily 09:30→09:00" cadence.
    fireEvent.change(screen.getByLabelText('Workflow to schedule'), { target: { value: 'wf_research' } })
    fireEvent.change(screen.getByLabelText('Run time'), { target: { value: '10:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(async () => {
      const all = await getScheduledTasks()
      const created = all.find(t => t.workflowId === 'wf_research' && t.spec?.kind === 'daily')
      expect(created).toBeTruthy()
      expect(created.name).toBe('Deep research') // name defaults to the workflow's name
      expect(created.spec).toEqual({ kind: 'daily', time: '10:30' })
      expect(created.enabled).toBe(true)
      expect(created.runCount).toBe(0)
    })
  })

  it('once-mode create refuses to store an unpickable time', async () => {
    render(<ScheduledPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /New schedule/i }))
    fireEvent.change(screen.getByLabelText('Workflow to schedule'), { target: { value: 'wf_daily' } })
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: SCHEDULE_KIND.ONCE } })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(screen.getByText(/Choose when it should run/)).toBeDefined())
    expect((rows.get('scheduled_tasks_v1') || []).some(t => t.spec?.kind === 'once')).toBe(false)
  })
})
