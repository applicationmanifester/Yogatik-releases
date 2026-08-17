import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import nodePath from 'node:path'
import nodeFs from 'node:fs'
import {
  createJournal, MUTATING_OPS, isMutating,
} from '../electron/journalCore.cjs'

describe('isMutating', () => {
  it('flags every op that changes the disk', () => {
    for (const op of ['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir']) {
      expect(isMutating(op)).toBe(true)
    }
  })

  it('does not flag reads', () => {
    for (const op of ['fs_read', 'fs_list', 'fs_search']) {
      expect(isMutating(op)).toBe(false)
    }
  })

  it('MUTATING_OPS and isMutating agree', () => {
    for (const op of MUTATING_OPS) expect(isMutating(op)).toBe(true)
  })
})

describe('journal', () => {
  let dir, store, journal

  beforeEach(() => {
    dir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'yogatik-journal-'))
    store = nodePath.join(dir, 'store')
    journal = createJournal({ storeDir: store })
  })
  afterEach(() => {
    try { nodeFs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('records the prior contents of an overwritten file and restores them', () => {
    const f = nodePath.join(dir, 'a.txt')
    nodeFs.writeFileSync(f, 'ORIGINAL')

    const entry = journal.record({ chatId: 'c1', op: 'fs_write', target: f })
    nodeFs.writeFileSync(f, 'REPLACED')
    expect(nodeFs.readFileSync(f, 'utf8')).toBe('REPLACED')

    journal.revert(entry.id)
    expect(nodeFs.readFileSync(f, 'utf8')).toBe('ORIGINAL')
  })

  it('restores a deleted file', () => {
    const f = nodePath.join(dir, 'gone.txt')
    nodeFs.writeFileSync(f, 'KEEP ME')

    const entry = journal.record({ chatId: 'c1', op: 'fs_delete', target: f })
    nodeFs.unlinkSync(f)
    expect(nodeFs.existsSync(f)).toBe(false)

    journal.revert(entry.id)
    expect(nodeFs.readFileSync(f, 'utf8')).toBe('KEEP ME')
  })

  it('reverting a file that did not exist before removes it again', () => {
    const f = nodePath.join(dir, 'new.txt')
    const entry = journal.record({ chatId: 'c1', op: 'fs_write', target: f })
    nodeFs.writeFileSync(f, 'CREATED')

    journal.revert(entry.id)
    expect(nodeFs.existsSync(f)).toBe(false)
  })

  it('records a directory tree and restores it wholesale', () => {
    const sub = nodePath.join(dir, 'tree')
    nodeFs.mkdirSync(nodePath.join(sub, 'nested'), { recursive: true })
    nodeFs.writeFileSync(nodePath.join(sub, 'one.txt'), '1')
    nodeFs.writeFileSync(nodePath.join(sub, 'nested', 'two.txt'), '2')

    const entry = journal.record({ chatId: 'c1', op: 'fs_delete', target: sub })
    nodeFs.rmSync(sub, { recursive: true, force: true })
    expect(nodeFs.existsSync(sub)).toBe(false)

    journal.revert(entry.id)
    expect(nodeFs.readFileSync(nodePath.join(sub, 'one.txt'), 'utf8')).toBe('1')
    expect(nodeFs.readFileSync(nodePath.join(sub, 'nested', 'two.txt'), 'utf8')).toBe('2')
  })

  it('lists entries newest first and scopes them to a chat', () => {
    const f = nodePath.join(dir, 'a.txt')
    nodeFs.writeFileSync(f, 'x')
    journal.record({ chatId: 'c1', op: 'fs_write', target: f })
    journal.record({ chatId: 'c2', op: 'fs_write', target: f })
    journal.record({ chatId: 'c1', op: 'fs_edit', target: f })

    const c1 = journal.list('c1')
    expect(c1).toHaveLength(2)
    expect(c1[0].op).toBe('fs_edit')
    expect(journal.list('c2')).toHaveLength(1)
  })

  it('reverting the same entry twice is harmless', () => {
    const f = nodePath.join(dir, 'a.txt')
    nodeFs.writeFileSync(f, 'ORIGINAL')
    const entry = journal.record({ chatId: 'c1', op: 'fs_write', target: f })
    nodeFs.writeFileSync(f, 'REPLACED')

    expect(journal.revert(entry.id).success).toBe(true)
    expect(journal.revert(entry.id).success).toBe(true)
    expect(nodeFs.readFileSync(f, 'utf8')).toBe('ORIGINAL')
  })

  it('reverting an unknown id fails cleanly rather than throwing', () => {
    expect(journal.revert('nope').success).toBe(false)
  })

  it('recording is best-effort — an unreadable target does not throw', () => {
    expect(() => journal.record({ chatId: 'c1', op: 'fs_write', target: nodePath.join(dir, 'nothing-here.txt') })).not.toThrow()
  })

  it('survives a reload from disk', () => {
    const f = nodePath.join(dir, 'a.txt')
    nodeFs.writeFileSync(f, 'ORIGINAL')
    const entry = journal.record({ chatId: 'c1', op: 'fs_write', target: f })
    nodeFs.writeFileSync(f, 'REPLACED')

    const reopened = createJournal({ storeDir: store })
    expect(reopened.list('c1')).toHaveLength(1)
    reopened.revert(entry.id)
    expect(nodeFs.readFileSync(f, 'utf8')).toBe('ORIGINAL')
  })
})
