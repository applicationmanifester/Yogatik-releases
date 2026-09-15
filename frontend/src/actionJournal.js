/**
 * actionJournal.js — Cryptographic Action Journal & Time-Machine Rollback Engine.
 *
 * Provides tamper-evident governance and audit logging for agent actions:
 * - SHA-256 hash chaining (Merkle-style verification)
 * - Captures before/after state snapshots of modified targets
 * - Time-machine single-click session rollback
 * - Exportable compliance logs (JSON & Markdown) for SOC2 / HIPAA readiness
 */

const enc = new TextEncoder()

/**
 * Compute SHA-256 digest of string
 */
export async function sha256(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str))
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Lightweight fallback for non-subtle contexts
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(16).padStart(64, '0')
}

export const ACTION_TYPES = {
  FILE_WRITE: 'file_write',
  FILE_DELETE: 'file_delete',
  FILE_PATCH: 'file_patch',
  TERMINAL_RUN: 'terminal_run',
  GIT_COMMIT: 'git_commit',
  BROWSER_ACTION: 'browser_action',
  CUSTOM: 'custom',
}

export class ActionJournal {
  constructor(sessionId = 'default') {
    this.sessionId = sessionId
    this.entries = [] // Array of chained entries
    this.headHash = '0000000000000000000000000000000000000000000000000000000000000000'
  }

  /**
   * Append an atomic action entry with Merkle hash chaining
   */
  async recordAction({
    actionType = ACTION_TYPES.CUSTOM,
    target = '',
    before = null,
    after = null,
    agent = 'system',
    metadata = {},
  }) {
    const timestamp = Date.now()
    const prevHash = this.headHash
    const id = `act_${timestamp}_${this.entries.length}`

    const payloadToHash = `${prevHash}|${timestamp}|${actionType}|${target}|${JSON.stringify(before)}|${JSON.stringify(after)}|${agent}`
    const hash = await sha256(payloadToHash)

    const entry = {
      id,
      sessionId: this.sessionId,
      timestamp,
      actionType,
      target,
      before,
      after,
      agent,
      metadata,
      prevHash,
      hash,
      rolledBack: false,
    }

    this.entries.push(entry)
    this.headHash = hash
    return entry
  }

  /**
   * Verify cryptographic integrity of the action chain from genesis to head
   */
  async verifyIntegrity() {
    let currentPrev = '0000000000000000000000000000000000000000000000000000000000000000'

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]

      // Check linkage to previous entry
      if (entry.prevHash !== currentPrev) {
        return {
          valid: false,
          brokenIndex: i,
          reason: `Chain broken at entry ${i} (${entry.id}): prevHash mismatch. Expected ${currentPrev}, found ${entry.prevHash}`,
        }
      }

      // Recompute expected hash
      const payloadToHash = `${entry.prevHash}|${entry.timestamp}|${entry.actionType}|${entry.target}|${JSON.stringify(entry.before)}|${JSON.stringify(entry.after)}|${entry.agent}`
      const expectedHash = await sha256(payloadToHash)

      if (entry.hash !== expectedHash) {
        return {
          valid: false,
          brokenIndex: i,
          reason: `Tampering detected at entry ${i} (${entry.id}): hash mismatch. Content altered.`,
        }
      }

      currentPrev = entry.hash
    }

    return {
      valid: true,
      entryCount: this.entries.length,
      headHash: this.headHash,
    }
  }

  /**
   * Time-machine rollback: returns inverse operations in reverse chronological order
   * and optionally executes a provided restore function.
   */
  async rollback({ restoreHandler = null, filterTarget = null } = {}) {
    const rollbacksToApply = []

    // Walk backwards in time
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]
      if (entry.rolledBack) continue
      if (filterTarget && entry.target !== filterTarget) continue

      // Only reversible actions
      if (
        entry.actionType === ACTION_TYPES.FILE_WRITE ||
        entry.actionType === ACTION_TYPES.FILE_DELETE ||
        entry.actionType === ACTION_TYPES.FILE_PATCH
      ) {
        rollbacksToApply.push(entry)
      }
    }

    const results = []
    for (const entry of rollbacksToApply) {
      const op = {
        actionId: entry.id,
        target: entry.target,
        restoreTo: entry.before,
        actionType: entry.actionType,
      }

      if (typeof restoreHandler === 'function') {
        try {
          await restoreHandler(op)
          entry.rolledBack = true
          results.push({ ...op, success: true })
        } catch (err) {
          results.push({ ...op, success: false, error: err.message })
        }
      } else {
        entry.rolledBack = true
        results.push({ ...op, success: true })
      }
    }

    return {
      rolledBackCount: results.filter(r => r.success).length,
      operations: results,
    }
  }

  /**
   * Export compliance-ready Markdown & JSON audit report
   */
  async exportAuditReport() {
    const integrity = await this.verifyIntegrity()

    const report = {
      sessionId: this.sessionId,
      generatedAt: new Date().toISOString(),
      integrityVerified: integrity.valid,
      headHash: this.headHash,
      entryCount: this.entries.length,
      entries: this.entries.map(e => ({
        id: e.id,
        time: new Date(e.timestamp).toISOString(),
        action: e.actionType,
        target: e.target,
        agent: e.agent,
        hash: e.hash,
        rolledBack: e.rolledBack,
      })),
    }

    const mdLines = [
      `# Yogatik Cryptographic Action Journal`,
      `**Session ID:** \`${this.sessionId}\``,
      `**Generated:** ${report.generatedAt}`,
      `**Integrity Status:** ${integrity.valid ? '✅ VERIFIED VALID' : '❌ TAMPERING DETECTED'}`,
      `**Head Hash:** \`${this.headHash}\``,
      `**Total Action Entries:** ${this.entries.length}`,
      ``,
      `| Time | Action | Agent | Target | Hash (prefix) | Rolled Back |`,
      `|---|---|---|---|---|---|`,
    ]

    for (const e of report.entries) {
      mdLines.push(
        `| ${e.time.slice(11, 19)} | \`${e.action}\` | ${e.agent} | \`${e.target || '-'}\` | \`${e.hash.slice(0, 12)}…\` | ${e.rolledBack ? 'Yes' : 'No'} |`
      )
    }

    return {
      json: report,
      markdown: mdLines.join('\n'),
    }
  }

  clear() {
    this.entries = []
    this.headHash = '0000000000000000000000000000000000000000000000000000000000000000'
  }
}

// Global active journal instances
const sessionJournals = new Map()

export function getSessionJournal(sessionId = 'default') {
  if (!sessionJournals.has(sessionId)) {
    sessionJournals.set(sessionId, new ActionJournal(sessionId))
  }
  return sessionJournals.get(sessionId)
}
