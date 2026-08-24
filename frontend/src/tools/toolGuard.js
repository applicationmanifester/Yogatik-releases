/**
 * toolGuard.js — Static parameter and action safety guardrails for tool execution.
 * Prevents destructive commands (e.g. root wipes, formatted drives) and validates
 * input sanity before reaching the OS/filesystem.
 */

const BLOCKED_TERMINAL_PATTERNS = [
  /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+[\/\\](?:\s|$)/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bdel\s+\/[fF]\s+\/[sS]\s+\/[qQ]\s+[a-zA-Z]:[\/\\]?/i,
  /\b(shutdown|reboot|init\s+0|init\s+6)(?:\s|$)/i,
  /:(){ :\|:& };:/, // Fork bomb
]

/**
 * Validates tool execution safety before dispatching.
 *
 * @param {string} toolName
 * @param {object} args
 * @returns {{ safe: boolean, reason?: string }}
 */
export function validateToolSafety(toolName, args = {}) {
  const name = String(toolName || '').toLowerCase()

  if (name === 'terminal_run') {
    const cmd = String(args.command || args.cmd || args.script || '').trim()
    for (const pattern of BLOCKED_TERMINAL_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          safe: false,
          reason: 'Command blocked by safety guardrails: potentially destructive system operation detected.',
        }
      }
    }
  }

  if (name === 'fs_delete' || name === 'fs_remove') {
    const p = String(args.path || args.file_path || '').trim()
    if (p === '/' || p === '\\' || p === '.' || p === '..' || /^[a-zA-Z]:[\/\\]?$/.test(p)) {
      return {
        safe: false,
        reason: 'Filesystem operation blocked: cannot delete root or entire drive directories.',
      }
    }
  }

  return { safe: true }
}
