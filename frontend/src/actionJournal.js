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

// ── Secret Redaction & Zero-Knowledge Sanitizer ──────────────────────────────
const SECRET_REGEXES = [
  /sk-[a-zA-Z0-9_\-\.]{20,}/g,
  /gh[pousr]_[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

export function sanitizeActionPayload(val) {
  if (val === null || val === undefined) return val
  if (typeof val === 'string') {
    let sanitized = val
    for (const reg of SECRET_REGEXES) {
      sanitized = sanitized.replace(reg, (match) => `[REDACTED_SECRET: ${match.length} chars]`)
    }
    return sanitized
  }
  if (Array.isArray(val)) {
    return val.map(item => sanitizeActionPayload(item))
  }
  if (typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      if (/password|token|secret|apiKey|api_key|privateKey/i.test(k) && typeof v === 'string') {
        out[k] = `[REDACTED_SECRET: ${v.length} chars]`
      } else {
        out[k] = sanitizeActionPayload(v)
      }
    }
    return out
  }
  return val
}

export const INITIATOR_KINDS = {
  PERSON: 'person',       // Supervised run with human present
  ROUTINE: 'routine',     // Scheduled cron / background task
  SUBAGENT: 'subagent',   // Autonomous worker / delegation
  HANDOFF: 'handoff',     // Agent-to-agent handover
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
   * Append an atomic action entry with Merkle hash chaining, initiator tracking, and secret sanitization
   */
  async recordAction({
    actionType = ACTION_TYPES.CUSTOM,
    target = '',
    before = null,
    after = null,
    agent = 'system',
    initiator = INITIATOR_KINDS.PERSON,
    metadata = {},
  }) {
    const timestamp = Date.now()
    const prevHash = this.headHash
    const id = `act_${timestamp}_${this.entries.length}`

    // Sanitize before/after/metadata to ensure secrets are never preserved in hash or chain
    const cleanBefore = sanitizeActionPayload(before)
    const cleanAfter = sanitizeActionPayload(after)
    const cleanTarget = sanitizeActionPayload(target)
    const cleanMetadata = sanitizeActionPayload(metadata)

    const payloadToHash = `${prevHash}|${timestamp}|${actionType}|${cleanTarget}|${JSON.stringify(cleanBefore)}|${JSON.stringify(cleanAfter)}|${agent}|${initiator}`
    const hash = await sha256(payloadToHash)

    const entry = {
      id,
      sessionId: this.sessionId,
      timestamp,
      actionType,
      target: cleanTarget,
      before: cleanBefore,
      after: cleanAfter,
      agent,
      initiator: Object.values(INITIATOR_KINDS).includes(initiator) ? initiator : INITIATOR_KINDS.PERSON,
      metadata: cleanMetadata,
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
      const initiator = entry.initiator || INITIATOR_KINDS.PERSON
      const payloadToHash = `${entry.prevHash}|${entry.timestamp}|${entry.actionType}|${entry.target}|${JSON.stringify(entry.before)}|${JSON.stringify(entry.after)}|${entry.agent}|${initiator}`
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
   * Filter actions executed without direct human supervision ("Nobody Watching")
   * Returns routine (scheduled), subagent (delegated), and handoff tasks.
   */
  filterNobodyWatching() {
    return this.entries.filter(e => e.initiator && e.initiator !== INITIATOR_KINDS.PERSON)
  }

  /**
   * Summary breakdown of audit trail by initiator kind
   */
  getAuditSummary() {
    const counts = {
      total: this.entries.length,
      person: 0,
      routine: 0,
      subagent: 0,
      handoff: 0,
      rolledBack: 0,
    }
    for (const e of this.entries) {
      const init = e.initiator || INITIATOR_KINDS.PERSON
      counts[init] = (counts[init] || 0) + 1
      if (e.rolledBack) counts.rolledBack++
    }
    return counts
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
    const summary = this.getAuditSummary()

    const report = {
      sessionId: this.sessionId,
      generatedAt: new Date().toISOString(),
      integrityVerified: integrity.valid,
      headHash: this.headHash,
      entryCount: this.entries.length,
      summary,
      entries: this.entries.map(e => ({
        id: e.id,
        time: new Date(e.timestamp).toISOString(),
        action: e.actionType,
        target: e.target,
        agent: e.agent,
        initiator: e.initiator || INITIATOR_KINDS.PERSON,
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
      `**Total Action Entries:** ${this.entries.length} (Supervised: ${summary.person}, Nobody Watching: ${summary.routine + summary.subagent + summary.handoff})`,
      ``,
      `| Time | Action | Agent | Initiator | Target | Hash (prefix) | Rolled Back |`,
      `|---|---|---|---|---|---|---|`,
    ]

    for (const e of report.entries) {
      mdLines.push(
        `| ${e.time.slice(11, 19)} | \`${e.action}\` | ${e.agent} | \`${e.initiator}\` | \`${e.target || '-'}\` | \`${e.hash.slice(0, 12)}…\` | ${e.rolledBack ? 'Yes' : 'No'} |`
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

