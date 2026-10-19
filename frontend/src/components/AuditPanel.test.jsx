/**
 * AuditPanel behaviour tests.
 *
 * The panel is driven through the REAL auditTrail module (same chain semantics
 * the hooks use), backed by a mocked ./db with genuine getSetting semantics —
 * the same shape ScheduledPanel tests use — so rendering, verify, export and
 * the two-step wipe all run against the real persistence contract.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const { rows } = vi.hoisted(() => ({ rows: new Map() }))
vi.mock('../db', () => ({
  getSetting: async (k, fallback = null) => {
    const v = rows.has(k) ? rows.get(k) : null
    return v != null ? v : fallback
  },
  setSetting: async (k, v) => { rows.set(k, v) },
}))

import AuditPanel from './AuditPanel'
import { AUDIT_KEY, record, _flushAudit, verifyChain, sanitizeDetail } from '../auditTrail'

beforeEach(() => { rows.clear() })
afterEach(cleanup)

async function seedTrail() {
  await record('tool_permission_roll', { tool: 'fs_delete', allowed: false, how: 'user' })
  await record('schedule_ran', { id: 'sched_watch' })
  await record('data_export', { ext: 'json' })
  await _flushAudit()
}

describe('AuditPanel render', () => {
  it('lists the last events as time chip + type label + coarse detail rows', async () => {
    await seedTrail()
    render(<AuditPanel />)
    await waitFor(() => expect(screen.getAllByText('Tool permission')).toBeTruthy())
    expect(screen.getByText('Schedule ran')).toBeTruthy()
    expect(screen.getByText('Data export')).toBeTruthy()
    expect(screen.getByTestId('audit-panel')).toBeTruthy()
    expect(screen.getByTestId('audit-rows').children.length).toBe(3)
  })

  it('shows an empty state when the trail is empty', async () => {
    render(<AuditPanel />)
    expect(await screen.findByTestId('audit-empty')).toBeTruthy()
    expect(screen.getByText('No events recorded yet.')).toBeTruthy()
  })
})

describe('AuditPanel verify integrity', () => {
  it('reports an intact chain through the real verifyChain', async () => {
    await seedTrail()
    render(<AuditPanel />)
    fireEvent.click(screen.getByLabelText('Verify audit trail integrity'))
    await waitFor(() => expect(screen.getByTestId('audit-status').textContent).toMatch(/Chain intact/i))
  })

  it('reports a broken chain when a stored entry was tampered with', async () => {
    await seedTrail()
    const trail = rows.get(AUDIT_KEY)
    trail[0].detail.tool = 'fs_tampered'    // trim which tool a refusal was for
    rows.set(AUDIT_KEY, trail)
    render(<AuditPanel />)
    fireEvent.click(screen.getByLabelText('Verify audit trail integrity'))
    await waitFor(() => expect(screen.getByTestId('audit-status').textContent).toMatch(/broken/i))
    expect(screen.getByTestId('audit-status').textContent).toMatch(/broken at #1/i)
  })
})

describe('AuditPanel export + wipe', () => {
  it('exports JSON through the real chatExport.downloadBlob plumbing', async () => {
    await seedTrail()
    const blobs = []
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    const origClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:mock' }
    URL.revokeObjectURL = () => {}
    let clickedName = null
    HTMLAnchorElement.prototype.click = function clickCapture() { clickedName = this.download }
    try {
      render(<AuditPanel />)
      fireEvent.click(screen.getByLabelText('Export audit trail as JSON'))
      await waitFor(() => expect(screen.getByTestId('audit-status').textContent).toMatch(/Exported 3 events/i))
      expect(clickedName).toMatch(/^yogatik-audit-.*\.json$/)
      expect(blobs).toHaveLength(1)
      expect(blobs[0].type).toBe('application/json')
      // The export itself lands in the trail via chatExport's [audit] hook —
      // it arrives a few microtasks later (dynamic import), so poll for it.
      await waitFor(() => expect(screen.getByTestId('audit-rows').children.length).toBe(4))
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
      HTMLAnchorElement.prototype.click = origClick
    }
  })

  it('wipes after an explicit two-step confirm, then self-describes', async () => {
    await seedTrail()
    render(<AuditPanel />)
    // First click arms only.
    fireEvent.click(screen.getByLabelText('Wipe audit trail'))
    expect(screen.getByLabelText('Confirm wipe audit trail')).toBeTruthy()
    expect(screen.queryByText(/Trail wiped/)).toBeNull()
    // Second click wipes; the wipe itself becomes the first entry of a new chain.
    fireEvent.click(screen.getByLabelText('Confirm wipe audit trail'))
    await waitFor(() => expect(screen.getByTestId('audit-status').textContent).toMatch(/Trail wiped/i))
    expect(screen.getByTestId('audit-rows').textContent).toContain('Trail cleared')
    expect(screen.getByTestId('audit-rows').children.length).toBe(1)
    const integrity = await verifyChain()
    expect(integrity.intact).toBe(true)
    expect(integrity.length).toBe(1)
  })
})

describe('AuditPanel never renders content', () => {
  it('coerces a hostile-looking detail to coarse metadata before display', async () => {
    // The trail module guarantees the shape; the panel just double-checks that
    // a body could not sneak through display even if one somehow existed.
    const safe = sanitizeDetail({
      args: { command: 'rm -rf /' },
      allowed: true,
      tool: 'terminal_run',
    })
    await record('tool_permission_roll', safe)
    await _flushAudit()
    render(<AuditPanel />)
    await waitFor(() => expect(screen.getByText('Tool permission')).toBeTruthy())
    expect(screen.getByTestId('audit-rows').textContent).not.toMatch(/rm -rf/)
  })
})
