import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The panel archives regenerated bodies in Dexie (`artifact_versions`), so an
// IndexedDB implementation must exist BEFORE db.js (imported through
// ArtifactPanel) is evaluated. Side-effect imports execute in source order.
import 'fake-indexeddb/auto'
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import Dexie from 'dexie'

// This suite may share a fork with files that imported Dexie before
// fake-indexeddb ran (see migration.test.js): inject the dependency directly so
// this file is independent of which test ran first.
globalThis.indexedDB ??= new FDBFactory()
globalThis.IDBKeyRange ??= FDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

import React from 'react'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import db, { _clearSettingsCache, _resetArtifactPin } from '../db.js'
import { ArtifactPanel, artifactKeyOf } from './ArtifactPanel'

describe('ArtifactPanel Component', () => {
  afterEach(() => {
    cleanup()
  })

  const sampleArtifact = {
    title: 'Dashboard Widget',
    language: 'html',
    code: '<div class="card"><h1>Hello Yogatik</h1><style>.card{padding:20px;}</style></div>',
  }

  it('renders artifact title and live preview tab by default', () => {
    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)
    expect(screen.getByText('Dashboard Widget')).toBeDefined()
    expect(screen.getByText('Live Preview')).toBeDefined()
  })

  it('toggles verification inspector on clicking sparkles button', () => {
    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)
    const verifyBtn = screen.getByLabelText('Inspect layout')
    expect(verifyBtn).toBeDefined()

    fireEvent.click(verifyBtn)
    expect(screen.getByText('Valid Structure')).toBeDefined()
    expect(screen.getByText('Ask AI to Refine Layout')).toBeDefined()
  })

  it('copies verification report to clipboard on button click', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Inspect layout'))

    const copyReportBtn = screen.getByText('Copy Report')
    fireEvent.click(copyReportBtn)
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('Artifact Layout Report'))
  })

  it('supports responsive viewport switching between desktop, tablet, and mobile', () => {
    render(<ArtifactPanel artifact={sampleArtifact} onClose={vi.fn()} />)

    const tabletBtn = screen.getByLabelText('Tablet viewport')
    const mobileBtn = screen.getByLabelText('Mobile viewport')
    const desktopBtn = screen.getByLabelText('Desktop viewport')
    const reloadBtn = screen.getByLabelText('Reload preview')

    expect(tabletBtn).toBeDefined()
    expect(mobileBtn).toBeDefined()
    expect(desktopBtn).toBeDefined()
    expect(reloadBtn).toBeDefined()

    fireEvent.click(mobileBtn)
    fireEvent.click(tabletBtn)
    fireEvent.click(desktopBtn)
    fireEvent.click(reloadBtn)
  })
})

describe('Artifacts v2 — versioned workspace', () => {
  const v1 = { title: 'Versioned Widget', language: 'html', code: '<h1>one</h1>\n<p>alpha</p>' }
  // Same artifact key (title+language), regenerated body: alpha → gamma, beta added.
  const v2sameKey = { title: 'Versioned Widget', language: 'html', code: '<h1>one</h1>\n<p>gamma</p>\n<p>beta</p>' }
  const other = { title: 'Unrelated Snippet', language: 'javascript', code: 'const a = 1' }

  beforeEach(async () => {
    cleanup()
    _resetArtifactPin()
    // Dexie.delete is unnecessary and can block on open connections — isolating
    // by clearing the stores this suite touches is enough.
    try { await Promise.all([db.artifact_versions.clear(), db.settings.clear()]) } catch {}
    _clearSettingsCache()
  })

  afterEach(() => {
    cleanup()
  })

  it('groups regenerations of the same artifact under one key', () => {
    expect(artifactKeyOf(v1)).toBe(artifactKeyOf(v2sameKey))
    expect(artifactKeyOf(v1)).not.toBe(artifactKeyOf(other))
  })

  it('archives the replaced body on regeneration and renders its chip', async () => {
    const { rerender } = render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    rerender(<ArtifactPanel artifact={v2sameKey} onClose={vi.fn()} />)

    const chip = await screen.findByLabelText('Version 1')
    expect(chip.textContent).toContain('+2/-0')   // created with 2 lines, removed none
    expect(screen.getByLabelText('Artifact version history')).toBeDefined()
    expect(screen.getByLabelText('Live version')).toBeDefined()
    // exactly one archive row: an identical re-save must not duplicate
    expect(await db.artifact_versions.count()).toBe(1)
  })

  it('regenerating a different artifact does not archive the previous one', async () => {
    const { rerender } = render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    rerender(<ArtifactPanel artifact={other} onClose={vi.fn()} />)
    await new Promise(r => setTimeout(r, 30))
    expect(await db.artifact_versions.count()).toBe(0)
  })

  it('viewing a chip shows the archived body; Restore writes it back as a NEW version', async () => {
    const { rerender } = render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    rerender(<ArtifactPanel artifact={v2sameKey} onClose={vi.fn()} />)

    const [chip] = await screen.findAllByLabelText(/^Version \d+$/, {}, { timeout: 3000 })
    fireEvent.click(chip)
    expect(screen.getByText(/Viewing archived version #\d+/)).toBeDefined()
    // the panel displays the archived body, not the regenerated live body
    expect(screen.getByTitle('HTML Artifact Preview').getAttribute('srcdoc')).toBe(v1.code)

    fireEvent.click(screen.getByLabelText(/Restore version \d+$/))
    // restoring appends fresh rows: the auto-saved live body + the restored body
    await waitFor(async () => {
      expect((await screen.findAllByLabelText(/^Version \d+$/))).toHaveLength(3)
    })
    const rows = await db.artifact_versions.orderBy('id').toArray()
    expect(rows).toHaveLength(3)
    expect(rows[0].code).toBe(v1.code)                 // original archive
    expect(rows[1].code).toBe(v2sameKey.code)          // the live regenerated body, auto-saved before the restore destroyed it from view
    expect(rows[1].note).toMatch(/before restore/)
    expect(rows[2].code).toBe(v1.code)                 // restored body appended as its own version
    expect(rows[2].note).toMatch(/restored from version #\d+$/)
    // panel now shows the restored body (not the regenerated one)
    await waitFor(() => expect(screen.getByTitle('HTML Artifact Preview').getAttribute('srcdoc')).toBe(v1.code))
    expect(screen.queryByText(/Viewing archived version/)).toBeNull()
  })

  it('restoring while the display already matches does not duplicate chips', async () => {
    const { rerender } = render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    rerender(<ArtifactPanel artifact={v2sameKey} onClose={vi.fn()} />)
    const [chip] = await screen.findAllByLabelText(/^Version \d+$/, {}, { timeout: 3000 })
    fireEvent.click(chip)
    fireEvent.click(screen.getByLabelText(/Restore version \d+$/))
    await waitFor(async () => {
      expect((await screen.findAllByLabelText(/^Version \d+$/))).toHaveLength(3)
    })
    // a no-op restore must not spam lookalike versions
    expect(await db.artifact_versions.count()).toBe(3)
  })

  it('Compare shows the side-by-side line diff against the current body', async () => {
    const { rerender } = render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    rerender(<ArtifactPanel artifact={v2sameKey} onClose={vi.fn()} />)
    const [chip] = await screen.findAllByLabelText(/^Version \d+$/, {}, { timeout: 3000 })
    fireEvent.click(chip)
    fireEvent.click(screen.getByLabelText(/Compare version \d+ with current/))

    expect(screen.getByTestId('artifact-compare')).toBeDefined()
    // lineDiff rows rendered with +/- markers, panels' own CSS classes
    expect(screen.getByText('-<p>alpha</p>')).toBeDefined()   // archived pane lost it
    expect(screen.getByText('+<p>gamma</p>')).toBeDefined()   // live pane gained it
    expect(screen.getByText('+<p>beta</p>')).toBeDefined()

    // toggling off returns to the regular body view
    fireEvent.click(screen.getByLabelText(/Compare version \d+ with current/))
    expect(screen.getByTitle('HTML Artifact Preview')).toBeDefined()
  })

  it('one-click copy writes the full artifact body to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Copy code'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(v1.code))
  })

  it('exports the artifact as a file reusing the downloadBlob helper (.html, .md)', () => {
    const blobs = []
    const downloads = []
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    const origClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:mock' }
    URL.revokeObjectURL = () => {}
    HTMLAnchorElement.prototype.click = function clickCapture() { downloads.push(this.download) }
    try {
      render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Download file'))
      expect(blobs[0].type).toContain('text/html')
      expect(downloads[0]).toMatch(/^Versioned_Widget-\d+\.html$/)
      cleanup()

      render(<ArtifactPanel artifact={{ title: 'Notes Doc', language: 'markdown', code: '# Title' }} onClose={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Download file'))
      expect(blobs[1].type).toContain('text/markdown')
      expect(downloads[1]).toMatch(/^Notes_Doc-\d+\.md$/)
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
      HTMLAnchorElement.prototype.click = origClick
    }
  })

  it('pin survives a panel remount (persisted per conversation)', async () => {
    const { unmount } = render(<ArtifactPanel artifact={v1} conversationId={9} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Pin artifact'))
    expect(screen.getByLabelText('Unpin artifact')).toBeDefined()
    unmount()

    render(<ArtifactPanel artifact={v1} conversationId={9} onClose={vi.fn()} />)
    await screen.findByLabelText('Unpin artifact')
    expect(await db.getSetting('artifact_pinned_9', false)).toBe(true)

    fireEvent.click(screen.getByLabelText('Unpin artifact'))
    await waitFor(async () => {
      expect(await db.getSetting('artifact_pinned_9', false)).toBe(false)
    })
    await screen.findByLabelText('Pin artifact')
  })

  it('pins conversation-less artifacts through the in-memory ref', async () => {
    const { unmount } = render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Pin artifact'))
    unmount()
    render(<ArtifactPanel artifact={v1} onClose={vi.fn()} />)
    await screen.findByLabelText('Unpin artifact')
  })
})
