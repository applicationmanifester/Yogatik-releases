import { describe, it, expect } from 'vitest'
import { ActionJournal, ACTION_TYPES, sha256 } from './actionJournal'

describe('ActionJournal & Merkle Time-Machine Rollback', () => {
  it('computes sha256 digests deterministically', async () => {
    const h1 = await sha256('hello yogatik')
    const h2 = await sha256('hello yogatik')
    const h3 = await sha256('different string')

    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(h1.length).toBe(64)
  })

  it('records actions and creates a valid Merkle hash chain', async () => {
    const journal = new ActionJournal('test-session')

    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_WRITE,
      target: 'src/main.js',
      before: null,
      after: 'console.log("start")',
      agent: 'coder',
    })

    await journal.recordAction({
      actionType: ACTION_TYPES.TERMINAL_RUN,
      target: 'npm test',
      agent: 'qa',
    })

    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_PATCH,
      target: 'src/main.js',
      before: 'console.log("start")',
      after: 'console.log("updated")',
      agent: 'coder',
    })

    expect(journal.entries.length).toBe(3)
    expect(journal.entries[1].prevHash).toBe(journal.entries[0].hash)
    expect(journal.entries[2].prevHash).toBe(journal.entries[1].hash)

    const verification = await journal.verifyIntegrity()
    expect(verification.valid).toBe(true)
    expect(verification.entryCount).toBe(3)
  })

  it('detects tampering if an entry content is maliciously altered', async () => {
    const journal = new ActionJournal('tamper-test')

    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_WRITE,
      target: 'config.json',
      before: null,
      after: '{"safe": true}',
      agent: 'system',
    })

    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_WRITE,
      target: 'auth.json',
      before: null,
      after: '{"role": "user"}',
      agent: 'system',
    })

    // Malicious modification of entry 0
    journal.entries[0].after = '{"safe": false, "injected": true}'

    const verification = await journal.verifyIntegrity()
    expect(verification.valid).toBe(false)
    expect(verification.reason).toContain('Tampering detected')
  })

  it('detects chain breaks if prevHash is altered', async () => {
    const journal = new ActionJournal('chain-break-test')

    await journal.recordAction({ actionType: ACTION_TYPES.CUSTOM, target: 'a' })
    await journal.recordAction({ actionType: ACTION_TYPES.CUSTOM, target: 'b' })

    // Break linkage
    journal.entries[1].prevHash = '1234567890abcdef'

    const verification = await journal.verifyIntegrity()
    expect(verification.valid).toBe(false)
    expect(verification.reason).toContain('prevHash mismatch')
  })

  it('executes time-machine rollback in reverse chronological order', async () => {
    const journal = new ActionJournal('rollback-test')
    const fileSystem = new Map()

    // Step 1: Create file
    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_WRITE,
      target: 'app.js',
      before: null,
      after: 'version 1',
    })
    fileSystem.set('app.js', 'version 1')

    // Step 2: Edit file
    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_WRITE,
      target: 'app.js',
      before: 'version 1',
      after: 'version 2',
    })
    fileSystem.set('app.js', 'version 2')

    // Execute Rollback
    const restoredEvents = []
    const res = await journal.rollback({
      restoreHandler: async (op) => {
        restoredEvents.push(op)
        if (op.restoreTo === null) {
          fileSystem.delete(op.target)
        } else {
          fileSystem.set(op.target, op.restoreTo)
        }
      },
    })

    expect(res.rolledBackCount).toBe(2)
    // First rollback should restore to 'version 1', then second to null (file deleted)
    expect(restoredEvents[0].restoreTo).toBe('version 1')
    expect(restoredEvents[1].restoreTo).toBe(null)
    expect(fileSystem.has('app.js')).toBe(false)
  })

  it('exports compliance audit report in JSON and Markdown', async () => {
    const journal = new ActionJournal('compliance-audit')

    await journal.recordAction({
      actionType: ACTION_TYPES.FILE_WRITE,
      target: 'security.md',
      before: null,
      after: '# Security Policy',
      agent: 'governance_agent',
    })

    const audit = await journal.exportAuditReport()

    expect(audit.json.sessionId).toBe('compliance-audit')
    expect(audit.json.integrityVerified).toBe(true)
    expect(audit.markdown).toContain('# Yogatik Cryptographic Action Journal')
    expect(audit.markdown).toContain('security.md')
    expect(audit.markdown).toContain('governance_agent')
  })
})
