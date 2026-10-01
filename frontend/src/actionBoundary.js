/**
 * actionBoundary.js — Pre-Action Security Policy Boundary & Governance Engine.
 * Inspired by CopilotKit/OpenBot Action Boundaries.
 *
 * Evaluates all tool actions, file modifications, terminal commands, and browser
 * actions against safety policies BEFORE execution.
 *
 * Enforces:
 *  1. Path Boundary: Blocks writes/deletes to secrets, keys, and system files.
 *  2. Shell Boundary: Blocks destructive commands (formatting, wipe, root privilege tampering).
 *  3. Network/URL Boundary: Blocks automated visits to cloud metadata and router gateways.
 *  4. Human Takeover (\"Take the Wheel\"): Pauses automated agent actions while human drives.
 */

// ── Take the Wheel (Human Takeover) State ─────────────────────────────────────
let _humanControlActive = false
let _humanControlReason = ''

/**
 * Activates or deactivates human takeover mode.
 * @param {boolean} active - True to enable the block.
 * @param {string} [reason] - Optional reason shown to the agent.
 */
export function setHumanControl(active, reason = '') {
  _humanControlActive = !!active
  _humanControlReason = reason || ''
}

/** @returns {boolean} True if human currently has taken the wheel. */
export function isHumanControlActive() {
  return _humanControlActive
}

/** @returns {string} The reason given when human takeover was activated. */
export function getHumanControlReason() {
  return _humanControlReason
}

// ── Default Sensitive Patterns ───────────────────────────────────────────────

const SENSITIVE_PATH_PATTERNS = [
  /(?:^|[\\\/])\.env(?:\\.|$)/i,               // .env, .env.local, .env.production
  /(?:^|[\\\/])\.git[\\\/]hooks/i,             // git hooks
  /(?:^|[\\\/])\.ssh(?:[\\\/]|$)/i,            // ssh keys
  /(?:^|[\\\/])id_rsa(?:\\.|$)/i,              // private keys
  /(?:^|[\\\/])id_ed25519(?:\\.|$)/i,          // private keys
  /(?:^|[\\\/])known_hosts/i,                 // ssh known hosts
  /windows[\\\/]system32[\\\/]drivers/i,       // Windows critical system files
  /(?:^|[\\\/])etc[\\\/](?:shadow|passwd)/i,   // Unix authentication tables
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

// ── Helper Functions (Pure Logic Where Possible) ────────────

/**
 * Checks if a human has taken over control (the \"Take the Wheel\" guard).
 * @returns {{allowed: boolean, reason?: string, rule: string}}
 */
async function humanTakeoverBlocked() {
  if (_humanControlActive) {
    return {
      allowed: false,
      reason: `Action blocked: Human has taken the wheel (${_humanControlReason || 'manual intervention in progress'}). Release control to let the agent proceed.`,
      rule: 'human_takeover_lockout',
    }
  }
  return { allowed: true }
}

/**
 * Validates path‑based tools against sensitive‑file patterns.
 * @param {{tool: string, [path]: string, [targetPath]: string, [targetFile]: string, [files]: Array<{path:string}>}} args
 * @returns {{allowed: boolean, reason?: string, rule: string}}
 */
async function checkPathBoundary(args) {
  const toolName = String(args.tool || '').toLowerCase()
  const isPathWriteTool = [
    'fs_write',
    'fs_edit',
    'fs_replace_content',
    'fs_multi_replace',
    'fs_batch_write',
    'fs_delete',
    'fs_rename',
    'fs_move'
  ].includes(toolName)

  if (!isPathWriteTool) return { allowed: true }

  const rawPath = args.path || args.targetPath || args.targetFile || ''
  const files = Array.isArray(args.files)
    ? args.files.map((f) => f.path)
    : [rawPath]

  for (const p of files) {
    if (!p) continue
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(p)) {
        return {
          allowed: false,
          reason: `Action rejected by security boundary: Modifying protected sensitive file path \"${p}\" is prohibited.`,
          rule: 'path_boundary_sensitive_file',
        }
      }
    }
  }
  return { allowed: true }
}

/**
 * Validates shell‑execution tools against destructive command patterns.
 * @param {{tool: string, [command]: string, [cmd]: string, [code]: string}} args
 * @returns {{allowed: boolean, reason?: string, rule: string}}
 */
async function checkShellBoundary(args) {
  const toolName = String(args.tool || '').toLowerCase()
  const isShellTool = [
    'terminal_run',
    'terminal_exec',
    'proc_start',
    'code_execute'
  ].includes(toolName)

  if (!isShellTool) return { allowed: true }

  const cmd = String(args.command || args.cmd || args.code || '')
  for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        allowed: false,
        reason: `Action rejected by security boundary: Destructive shell command detected: \"${cmd}\"`,
        rule: 'shell_boundary_destructive_command',
      }
    }
  }
  return { allowed: true }
}

/**
 * Validates browser‑automation / fetch tools against restricted hosts.
 * @param {{tool: string, [url]: string, [targetUrl]: string}} args
 * @returns {{allowed: boolean, reason?: string, rule: string}}
 */
async function checkNetworkBoundary(args) {
  const toolName = String(args.tool || '').toLowerCase()
  const isNetworkTool = [
    'browser_control',
    'web_navigate',
    'web_extract',
    'fetch_page'
  ].includes(toolName)

  if (!isNetworkTool) return { allowed: true }

  const rawUrl = String(args.url || args.targetUrl || '')
  if (!rawUrl) return { allowed: true }

  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname.toLowerCase()
    for (const pattern of RESTRICTED_NETWORK_HOSTS) {
      if (pattern.test(host)) {
        return {
          allowed: false,
          reason: `Action rejected by security boundary: Automated interaction with restricted infrastructure host \"${host}\" is denied.`,
          rule: 'network_boundary_restricted_host',
        }
      }
    }
  } catch {
    // Invalid URL – let the underlying tool handle validation; we fail open here.
  }
  return { allowed: true }
}

/**
 * Evaluates custom deny rules (preserves original simple matching semantics).
 * @param {string} toolName
 * @param {Object} args
 * @returns {{allowed: boolean, reason?: string, rule: string}}
 */
async function checkCustomRules(toolName, args) {
  for (const rule of _customDenyRules) {
    // Simple rule matching: if rule.tool matches and rule.condition passes
    if (rule.tool && rule.tool !== toolName) continue
    if (rule.condition && !rule.condition(args)) continue

    return {
      allowed: false,
      reason: rule.reason || `Action blocked by custom security rule.`,
      rule: rule.id || 'custom_rule',
    }
  }
  return { allowed: true }
}

// ── Policy Evaluation Engine ────────────────────────────────────────────────

/**
 * Evaluates an action against the active security boundary policy before execution.
 *
 * @param {{tool: string, [args]: Object, [initiator]: 'person'|'routine'|'subagent'|'handoff'}} param0
 * @returns {Promise<{allowed: boolean, reason?: string, rule?: string}>}
 */
export async function evaluateActionPolicy({ tool, args = {}, initiator = 'person' }) {
  // 1️⃣ Human Takeover Guard
  const humanTakeoverResult = await humanTakeoverBlocked()
  if (!humanTakeoverResult.allowed) return humanTakeoverResult

  // 2️⃣ Permissive mode skips default path/command filters but keeps human takeover
  if (_activePreset === POLICY_PRESETS.PERMISSIVE) {
    return { allowed: true }
  }

  // 3️⃣ Path Boundary
  const pathResult = await checkPathBoundary({ tool, ...args })
  if (!pathResult.allowed) return pathResult

  // 4️⃣ Shell Boundary
  const shellResult = await checkShellBoundary({ tool, ...args })
  if (!shellResult.allowed) return shellResult

  // 5️⃣ Network Boundary
  const networkResult = await checkNetworkBoundary({ tool, ...args })
  if (!networkResult.allowed) return networkResult

  // 6️⃣ Custom Deny Rules
  const customResult = await checkCustomRules(tool, args)
  if (!customResult.allowed) return customResult

  return { allowed: true }
}