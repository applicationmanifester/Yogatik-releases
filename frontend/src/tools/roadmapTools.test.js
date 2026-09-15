import { describe, it, expect } from 'vitest'
import { actionJournalTool } from './actionJournalTool'
import { agentSwarmTool } from './agentSwarmTool'
import { getSessionJournal, ACTION_TYPES } from '../actionJournal'

describe('Roadmap Tools (Action Journal & Agent Swarm)', () => {
  describe('actionJournalTool', () => {
    it('verifies an empty or populated journal', async () => {
      const res = await actionJournalTool.execute({ action: 'verify', sessionId: 'tool-test-1' })
      expect(res.success).toBe(true)
      expect(res.message).toContain('Cryptographic action journal verified')
    })

    it('records a manual checkpoint and verifies it', async () => {
      const recordRes = await actionJournalTool.execute({
        action: 'record_checkpoint',
        sessionId: 'tool-test-cp',
        checkpointNote: 'Before refactor',
        targetFile: 'src/core.js',
      })

      expect(recordRes.success).toBe(true)
      expect(recordRes.checkpointId).toBeDefined()

      const verifyRes = await actionJournalTool.execute({ action: 'verify', sessionId: 'tool-test-cp' })
      expect(verifyRes.success).toBe(true)
    })

    it('rolls back recorded reversible actions', async () => {
      const journal = getSessionJournal('tool-test-rb')
      await journal.recordAction({
        actionType: ACTION_TYPES.FILE_WRITE,
        target: 'test.txt',
        before: 'prev text',
        after: 'next text',
      })

      const rollbackRes = await actionJournalTool.execute({
        action: 'rollback',
        sessionId: 'tool-test-rb',
      })

      expect(rollbackRes.success).toBe(true)
      expect(rollbackRes.rolledBackCount).toBe(1)
    })

    it('exports audit report in markdown', async () => {
      const exportRes = await actionJournalTool.execute({
        action: 'export_audit',
        sessionId: 'tool-test-audit',
      })

      expect(exportRes.success).toBe(true)
      expect(exportRes.report).toContain('# Yogatik Cryptographic Action Journal')
    })
  })

  describe('agentSwarmTool', () => {
    it('executes high-level objective through multi-agent swarm', async () => {
      const res = await agentSwarmTool.execute({
        objective: 'Draft and review comprehensive deployment roadmap',
        concurrencyLimit: 2,
        sessionId: 'tool-swarm-test',
      })

      expect(res.success).toBe(true)
      expect(res.status).toBe('completed')
      expect(res.tasks.length).toBeGreaterThanOrEqual(3)
      expect(res.blackboardContext).toContain('Draft and review comprehensive deployment roadmap')
    })
  })
})
