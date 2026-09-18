/**
 * actionBoundary.js — Pre-Action Security Policy Boundary & Governance Engine.
 * Inspired by CopilotKit/OpenBot Action Boundaries.
 *
 * Evaluates all tool actions, file modifications, terminal commands, and browser
 * actions against safety policies BEFORE execution.
 *
 * Enforces:
 * 1. Path Boundary: Blocks writes/deletes to secrets, keys, and system files.
 * 2. Shell Boundary: Blocks destructive commands (formatting, wipe, root privilege tampering).
 * 3. Network/URL Boundary: Blocks automated visits to cloud metadata and router gateways.
 * 4. Human Takeover ("Take the Wheel"): Pauses automated agent actions while human drives.
 */

// ── Take the Wheel (Human Takeover) State ─────────────────────────────────────
let _humanControlActive = false
let _humanControlReason = ''

export function setHumanControl(active, reason = '') {
  _humanControlActive = !!active
  _humanControlReason = reason || ''
}

export function isHumanControlActive() {
  return _humanControlActive
}

export function getHumanControlReason() {
  return _humanControlReason
}

// ── Default Sensitive Patterns ───────────────────────────────────────────────

const SENSITIVE_PATH_PATTERNS = [
  /(?:^|[\\/])\.env(?:\.|$)/i,               // .env, .env.local, .env.production
  /(?:^|[\\/])\.git[\\/]hooks/i,             // git hooks
  /(?:^|[\\/])\.ssh(?:[\\/]|$)/i,            // ssh keys
  /(?:^|[\\/])id_rsa(?:\.|$)/i,              // private keys
  /(?:^|[\\/])id_ed25519(?:\.|$)/i,          // private keys
  /(?:^|[\\/])known_hosts/i,                 // ssh known hosts
  /windows[\\/]system32[\\/]drivers/i,       // Windows critical system files
  /(?:^|[\\/])etc[\\/](?:shadow|passwd)/i,   // Unix authentication tables
]

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-[rf]{1,2}\s+[\/\\](?:\s|$)/i,     // rm -rf /
  /\bformat\s+[a-z]:/i,                      // format c:
  /\bFormat-Volume\b/i,                      // PowerShell volume wipe
  /\bdiskpart\b/i,                           // disk partition destruction
  /\bmkfs(?:\.[a-z0-9]+)?\s+/i,              // filesystem format
  /\b(del|erase)\s+\/s\s+\/q\s+[a-z]:\\/i,  // cmd /s /q c:\
  /\bchmod\s+(?:-R\s+)?777\s+[\/\\](?:\s|$)/i, // chmod -R 777 /
  /\bpasswd\s+root\b/i,                      // root password reset
]

const RESTRICTED_NETWORK_HOSTS = [
  /^169\.254\.169\.254$/,                    // AWS / Azure metadata service
  /^metadata\.google\.internal$/,            // GCP metadata service
  /^192\.168\.(?:0|1)\.1$/,                  // Common local router gateways
  /^10\.0\.0\.1$/,                           // Common enterprise router gateways
]

// ── Policy Presets ────────────────────────────────────────────────────────────

export const POLICY_PRESETS = {
  STRICT: 'strict',
  STANDARD: 'standard',
  PERMISSIVE: 'permissive',
}

let _activePreset = POLICY_PRESETS.STANDARD
let _customDenyRules = []

export function setPolicyPreset(preset) {
  if (Object.values(POLICY_PRESETS).includes(preset)) {
    _activePreset = preset
  }
}

export function getPolicyPreset() {
  return _activePreset
}

export function addCustomDenyRule(rule) {
  if (rule && typeof rule === 'object') {
    _customDenyRules.push(rule)
  }
}

export function clearCustomDenyRules() {
  _customDenyRules = []
}

// ── Policy Evaluation Engine ──────────────────────────────────────────────────

/**
 * Evaluates an action against the active security boundary policy before execution.
 *
 * @param {Object} param0
 * @param {string} param0.tool - Name of the tool being called
 * @param {Object} param0.args - Arguments passed to the tool
 * @param {string} [param0.initiator='person'] - 'person' | 'routine' | 'subagent' | 'handoff'
 * @returns {Promise<{ allowed: boolean, reason?: string, rule?: string }>}
 */
export async function evaluateActionPolicy({ tool, args = {}, initiator = 'person' }) {
  // 1. Take the Wheel Guard (Human in control)
  if (_humanControlActive) {
    return {
      allowed: false,
      reason: `Action blocked: Human has taken the wheel (${_humanControlReason || 'manual intervention in progress'}). Release control to let the agent proceed.`,
      rule: 'human_takeover_lockout',
    }
  }

  // Permissive mode skips default path/command filters but keeps human takeover
  if (_activePreset === POLICY_PRESETS.PERMISSIVE) {
    return { allowed: true }
  }

  const toolName = String(tool || '').toLowerCase()

  // 2. Path Boundary: Check file writes, edits, and deletions
  const isPathWriteTool = [
    'fs_write', 'fs_edit', 'fs_replace_content', 'fs_multi_replace',
    'fs_batch_write', 'fs_delete', 'fs_rename', 'fs_move'
  ].includes(toolName)

  if (isPathWriteTool) {
    const rawPath = args.path || args.targetPath || args.targetFile || ''
    const files = Array.isArray(args.files) ? args.files.map(f => f.path) : [rawPath]

    for (const p of files) {
      if (!p) continue
      for (const pattern of SENSITIVE_PATH_PATTERNS) {
        if (pattern.test(p)) {
          return {
            allowed: false,
            reason: `Action rejected by security boundary: Modifying protected sensitive file path "${p}" is prohibited.`,
            rule: 'path_boundary_sensitive_file',
          }
        }
      }
    }
  }

  // 3. Shell / Command Boundary: Check terminal execution
  const isShellTool = ['terminal_run', 'terminal_exec', 'proc_start', 'code_execute'].includes(toolName)
  if (isShellTool) {
    const cmd = String(args.command || args.cmd || args.code || '')
    for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `Action rejected by security boundary: Destructive shell command pattern detected: "${cmd.slice(0, 60)}".`,
          rule: 'shell_boundary_destructive_command',
        }
      }
    }
  }

  // 4. Network / URL Boundary: Check browser automation and web extraction
  const isBrowserOrFetchTool = ['browser_control', 'web_navigate', 'web_extract', 'fetch_page'].includes(toolName)
  if (isBrowserOrFetchTool) {
    const rawUrl = String(args.url || args.targetUrl || '')
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl)
        const host = parsed.hostname.toLowerCase()
        for (const pattern of RESTRICTED_NETWORK_HOSTS) {
          if (pattern.test(host)) {
            return {
              allowed: false,
              reason: `Action rejected by security boundary: Automated interaction with restricted infrastructure host "${host}" is denied.`,
              rule: 'network_boundary_restricted_host',
            }
          }
        }
      } catch {}
    }
  }

  // 5. Custom Registered Rules
  for (const rule of _customDenyRules) {
    if (rule.tool && rule.tool !== toolName) continue
    if (typeof rule.test === 'function') {
      try {
        const hit = await rule.test({ tool: toolName, args, initiator })
        if (hit) {
          return {
            allowed: false,
            reason: rule.reason || 'Action rejected by custom policy rule.',
            rule: rule.id || 'custom_deny_rule',
          }
        }
      } catch (err) {
        // Fail closed on rule error
        return {
          allowed: false,
          reason: `Action rejected: Policy rule threw an error (${err?.message || err}).`,
          rule: 'rule_evaluation_error',
        }
      }
    }
  }

  return { allowed: true }
}
