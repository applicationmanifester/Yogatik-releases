/**
 * actionJournalTool.js — Exposes the Sovereign Cryptographic Action Journal & Time-Machine Rollback.
 */

import { getSessionJournal, ACTION_TYPES } from '../actionJournal'

export const actionJournalTool = {
  schema: {
    description:
      'Manage the cryptographic action journal and time-machine rollback engine. ' +
      'Allows verifying Merkle chain integrity, reverting destructive file changes with rollback, ' +
      'or generating exportable compliance audit reports (SOC2/HIPAA ready).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['verify', 'rollback', 'export_audit', 'record_checkpoint'],
          description: 'The journal operation to perform.',
        },
        sessionId: {
          type: 'string',
          description: 'Session identifier (defaults to "default").',
        },
        targetFile: {
          type: 'string',
          description: 'Optional target file path to filter rollback.',
        },
        checkpointNote: {
          type: 'string',
          description: 'Optional note when creating a manual checkpoint.',
        },
      },
      required: ['action'],
    },
  },

  async execute({ action, sessionId = 'default', targetFile = null, checkpointNote = '' }) {
    const journal = getSessionJournal(sessionId)

    switch (action) {
      case 'verify': {
        const integrity = await journal.verifyIntegrity()
        return {
          success: integrity.valid,
          integrity,
          message: integrity.valid
            ? `Cryptographic action journal verified: all ${integrity.entryCount} entries valid with Merkle head ${integrity.headHash.slice(0, 16)}...`
            : `Integrity check failed: ${integrity.reason}`,
        }
      }

      case 'rollback': {
        const rollbackResult = await journal.rollback({
          filterTarget: targetFile,
        })
        return {
          success: true,
          rolledBackCount: rollbackResult.rolledBackCount,
          operations: rollbackResult.operations,
          message: `Successfully rolled back ${rollbackResult.rolledBackCount} actions.`,
        }
      }

      case 'export_audit': {
        const audit = await journal.exportAuditReport()
        return {
          success: true,
          report: audit.markdown,
          metadata: audit.json,
        }
      }

      case 'record_checkpoint': {
        const entry = await journal.recordAction({
          actionType: ACTION_TYPES.CUSTOM,
          target: targetFile || 'checkpoint',
          after: checkpointNote || 'Manual user checkpoint',
          agent: 'user',
        })
        return {
          success: true,
          checkpointId: entry.id,
          hash: entry.hash,
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${action}. Expected verify, rollback, export_audit, or record_checkpoint.`,
        }
    }
  },
}
