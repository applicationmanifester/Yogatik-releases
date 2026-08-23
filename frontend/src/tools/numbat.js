/**
 * Perplexity AI Numbat Agent Runtime Protection & Behavioral Security Suite
 * 
 * Inspired by Perplexity AI Numbat (github.com/perplexityai/numbat).
 * Provides real-time behavioral inspection, pre-action interception,
 * prompt injection defense, data exfiltration prevention, and session forensics for AI agents.
 */

export const NUMBAT_CATEGORIES = [
  'Data Exfiltration',
  'Credential Access',
  'Destructive Operations',
  'Privilege Escalation',
  'Prompt Injection & Jailbreak',
  'Stealth & Anti-Forensics',
  'Network Lateral Movement',
  'Remote Code Execution',
  'Resource Exhaustion',
  'Insecure Deserialization',
  'Unauthorized File Egress',
]

export const NUMBAT_RULES = [
  // 1. Data Exfiltration
  {
    id: 'NUMBAT-EXFIL-001',
    category: 'Data Exfiltration',
    severity: 'CRITICAL',
    name: 'Secret/Credential POST Exfiltration',
    description: 'Attempting to POST or upload API keys, tokens, or private keys to external HTTP servers.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /https?:\/\//i.test(serialized) && /(apiKey|api_key|password|jwt|secret|id_rsa|auth_token|bearer)/i.test(serialized)
    },
    recommendation: 'Block external transfer of sensitive credential variables.',
  },
  {
    id: 'NUMBAT-EXFIL-002',
    category: 'Data Exfiltration',
    severity: 'HIGH',
    name: 'Bulk Database Dump Exfiltration',
    description: 'Command attempting to pipe or dump database schemas to a remote URL or webhook.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(mysqldump|pg_dump|sqlite3\s+.*\.dump|mongodump)\b.*(\||curl|wget|nc\s)/i.test(serialized)
    },
    recommendation: 'Prohibit piped database extraction commands.',
  },
  {
    id: 'NUMBAT-EXFIL-003',
    category: 'Data Exfiltration',
    severity: 'HIGH',
    name: 'DNS Tunneling / Data Leak via nslookup',
    description: 'Encoding data into subdomain DNS lookups.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(dig|nslookup|host)\s+[`'"]?\$?\([a-z0-9+/=]{16,}\)/i.test(serialized)
    },
    recommendation: 'Block suspicious dynamic DNS exfiltration lookups.',
  },

  // 2. Credential Access
  {
    id: 'NUMBAT-CRED-001',
    category: 'Credential Access',
    severity: 'CRITICAL',
    name: 'SSH Private Key / AWS Config Read Attempt',
    description: 'Attempting to read SSH private keys, AWS credentials, or cloud tokens.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(\.ssh\/id_rsa|\.aws\/credentials|\.config\/gcloud|\.azure\/tokens|\.docker\/config\.json)/i.test(serialized)
    },
    recommendation: 'Deny access to system credential and private key directories.',
  },
  {
    id: 'NUMBAT-CRED-002',
    category: 'Credential Access',
    severity: 'HIGH',
    name: 'Environment Variable Secret Harvesting',
    description: 'Indiscriminate dumping of all environment variables.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(printenv|env|export|Get-ChildItem\s+Env:)\b(?!\s*\|\s*grep\s+[A-Za-z0-9_-]+)/i.test(serialized) &&
             !/echo\s+\$[A-Z_]+/i.test(serialized)
    },
    recommendation: 'Filter bulk environment dumps to avoid leaking secret keys.',
  },
  {
    id: 'NUMBAT-CRED-003',
    category: 'Credential Access',
    severity: 'HIGH',
    name: 'Shadow / Password File Probing',
    description: 'Reading /etc/shadow, SAM hives, or Master Keychains.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(\/etc\/shadow|\/etc\/master\.passwd|SYSTEM32\\config\\SAM|security\s+find-generic-password)/i.test(serialized)
    },
    recommendation: 'Enforce OS-level sandbox boundaries.',
  },

  // 3. Destructive Operations
  {
    id: 'NUMBAT-DESTRUCT-001',
    category: 'Destructive Operations',
    severity: 'CRITICAL',
    name: 'Root / Global Filesystem Wipe',
    description: 'Recursive unprompted deletion of root or home directories.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+.*(\/|~|\$HOME|\.\.)|rmdir\s+\/s\s+\/q\s+[c-zC-Z]:\\)/i.test(serialized)
    },
    recommendation: 'Instantly terminate any global disk wipe commands.',
  },
  {
    id: 'NUMBAT-DESTRUCT-002',
    category: 'Destructive Operations',
    severity: 'CRITICAL',
    name: 'Raw Disk Write / Filesystem Overwrite',
    description: 'Writing directly to disk devices (dd, mkfs, format).',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(dd\s+if=.*of=\/dev\/(sd[a-z]|nvme|rdisk)|mkfs\.|format\s+[c-zC-Z]:)\b/i.test(serialized)
    },
    recommendation: 'Block raw disk and filesystem formatting commands.',
  },
  {
    id: 'NUMBAT-DESTRUCT-003',
    category: 'Destructive Operations',
    severity: 'HIGH',
    name: 'Database Truncate / Drop Table',
    description: 'Unprotected SQL queries dropping production database tables.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(serialized)
    },
    recommendation: 'Require explicit manual user confirmation for database drop actions.',
  },

  // 4. Privilege Escalation
  {
    id: 'NUMBAT-PRIV-001',
    category: 'Privilege Escalation',
    severity: 'CRITICAL',
    name: 'Sudo / Setuid Escalation',
    description: 'Execution of sudo, su, or doas without user authorization.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(sudo\s+|su\s+root|doas\s+|pkexec\s+)/i.test(serialized)
    },
    recommendation: 'Disallow automated agent privilege elevation.',
  },
  {
    id: 'NUMBAT-PRIV-002',
    category: 'Privilege Escalation',
    severity: 'HIGH',
    name: 'Sudoers / Policy File Modification',
    description: 'Attempting to append or edit /etc/sudoers or polkit configs.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(\/etc\/sudoers|\/etc\/polkit|\/etc\/pam\.d\/)/i.test(serialized)
    },
    recommendation: 'Block agent access to system authentication policies.',
  },

  // 5. Prompt Injection & Jailbreak Traversal
  {
    id: 'NUMBAT-INJECT-001',
    category: 'Prompt Injection & Jailbreak',
    severity: 'HIGH',
    name: 'Secondary Prompt Override Directive',
    description: 'Content attempting to override AI instructions via "Ignore previous instructions".',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(ignore\s+(all\s+)?previous\s+instructions|disregard\s+(all\s+)?prior\s+prompts|system\s+override:\s+you\s+are\s+now)/i.test(serialized)
    },
    recommendation: 'Sanitize incoming text or tool outputs against adversarial injection triggers.',
  },
  {
    id: 'NUMBAT-INJECT-002',
    category: 'Prompt Injection & Jailbreak',
    severity: 'HIGH',
    name: 'Hidden Unicode / ASCII Smuggling Injection',
    description: 'Text containing zero-width non-printable characters used for stealth prompt smuggling.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      // Check for clusters of zero-width spaces (\u200B-\u200D, \uFEFF)
      return /[\u200B-\u200D\uFEFF]{4,}/.test(serialized)
    },
    recommendation: 'Strip invisible zero-width unicode characters from agent prompts and tools.',
  },

  // 6. Stealth & Anti-Forensics
  {
    id: 'NUMBAT-STEALTH-001',
    category: 'Stealth & Anti-Forensics',
    severity: 'HIGH',
    name: 'Shell History / Audit Log Deletion',
    description: 'Attempting to clear or symlink bash history or audit logs.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\b(history\s+-c|rm\s+.*\.bash_history|ln\s+-sf\s+\/dev\/null\s+~\/\.bash_history|Clear-History)\b/i.test(serialized)
    },
    recommendation: 'Ensure shell history logging remains tamper-proof.',
  },
  {
    id: 'NUMBAT-STEALTH-002',
    category: 'Stealth & Anti-Forensics',
    severity: 'HIGH',
    name: 'Log Timestamp Tampering (Timestomping)',
    description: 'Using touch to forge file access/creation timestamps.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /\btouch\s+-(t|d|r)\b/i.test(serialized)
    },
    recommendation: 'Flag suspicious file timestamp alterations.',
  },

  // 7. Network Lateral Movement & Reverse Shell
  {
    id: 'NUMBAT-NET-001',
    category: 'Network Lateral Movement',
    severity: 'CRITICAL',
    name: 'Reverse Shell / Socket Connection',
    description: 'Spawning interactive reverse TCP shells.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(nc|ncat|netcat)\s+.*-e\s+\/(bin|usr)\/(ba)?sh|bash\s+-i\s+>&?\s*\/dev\/tcp\/|python.*socket.*connect.*exec/i.test(serialized)
    },
    recommendation: 'Block reverse shell establishment immediately.',
  },
  {
    id: 'NUMBAT-NET-002',
    category: 'Network Lateral Movement',
    severity: 'HIGH',
    name: 'Internal Cloud Metadata Probing (SSRF)',
    description: 'Attempting to query AWS/GCP/Azure instance metadata services.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /(169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200)/i.test(serialized)
    },
    recommendation: 'Restrict agent access to internal cloud metadata endpoints.',
  },

  // 8. Resource Exhaustion
  {
    id: 'NUMBAT-RES-001',
    category: 'Resource Exhaustion',
    severity: 'CRITICAL',
    name: 'Fork Bomb / Recursive Process Spawning',
    description: 'Commands attempting to spawn infinite recursive processes.',
    test: (tool, args) => {
      const serialized = JSON.stringify(args || {})
      return /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|while\s+true;\s*do\s+fork|while\(1\)\s*fork\(\)/i.test(serialized)
    },
    recommendation: 'Halt fork bomb patterns immediately.',
  },
]

// In-memory security audit event log
let AUDIT_LOG = []
let POLICY_CONFIG = {
  mode: 'block', // 'block' | 'monitor'
  strictMode: false,
  allowedDomains: [],
  blockedTools: [],
}

/**
 * Inspect a candidate tool call against all Numbat security rules
 */
export function inspectAction(toolName, args, config = {}) {
  const mode = config.mode || POLICY_CONFIG.mode || 'block'
  const violations = []
  let totalRisk = 0

  for (const rule of NUMBAT_RULES) {
    try {
      if (rule.test(toolName, args)) {
        const score = rule.severity === 'CRITICAL' ? 40 : rule.severity === 'HIGH' ? 25 : 10
        totalRisk += score
        violations.push({
          ruleId: rule.id,
          name: rule.name,
          category: rule.category,
          severity: rule.severity,
          description: rule.description,
          recommendation: rule.recommendation,
        })
      }
    } catch {
      // rule error: keep evaluating
    }
  }

  const riskScore = Math.min(100, totalRisk)
  const isCritical = violations.some(v => v.severity === 'CRITICAL')
  const allowed = mode === 'monitor' ? true : (!isCritical && riskScore < 40)

  const event = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    mode,
    riskScore,
    verdict: allowed ? 'ALLOW' : 'BLOCK',
    violations,
  }

  AUDIT_LOG.unshift(event)
  if (AUDIT_LOG.length > 200) AUDIT_LOG.pop()

  return {
    allowed,
    mode,
    riskScore,
    verdict: allowed ? 'ALLOW' : 'BLOCK',
    violationCount: violations.length,
    violations,
    event,
  }
}

/**
 * Perform retrospective forensic analysis across a list of message turns
 */
export function scanTrajectory(messages = []) {
  const flaggedTurns = []
  let overallRisk = 0

  messages.forEach((msg, idx) => {
    const text = typeof msg === 'string' ? msg : msg.content || JSON.stringify(msg)
    const turnViolations = []

    for (const rule of NUMBAT_RULES) {
      if (rule.test('trajectory_scan', { content: text })) {
        turnViolations.push(rule)
        overallRisk += rule.severity === 'CRITICAL' ? 30 : 15
      }
    }

    if (turnViolations.length > 0) {
      flaggedTurns.push({
        turnIndex: idx,
        role: msg.role || 'unknown',
        violations: turnViolations.map(r => ({ id: r.id, name: r.name, category: r.category, severity: r.severity })),
        snippet: text.slice(0, 150),
      })
    }
  })

  return {
    totalTurnsScanned: messages.length,
    flaggedTurnCount: flaggedTurns.length,
    overallRiskScore: Math.min(100, overallRisk),
    status: flaggedTurns.length === 0 ? 'CLEAN' : 'SUSPICIOUS',
    flaggedTurns,
  }
}

export const numbatTool = {
  schema: {
    name: 'numbat',
    description: 'Perplexity AI Numbat agent runtime security, pre-action interception, and behavioral threat detection harness. Inspects tool calls, scans session trajectories for exfiltration, prompt injection, and privilege escalation.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['inspect_action', 'scan_trajectory', 'configure_policy', 'get_audit_log', 'clear_audit_log', 'list_rules'],
          description: 'Numbat security action to perform.',
        },
        targetTool: {
          type: 'string',
          description: 'Tool name to inspect when action is "inspect_action".',
        },
        targetArgs: {
          type: 'object',
          description: 'Tool parameters/arguments to inspect.',
        },
        messages: {
          type: 'array',
          items: { type: 'object' },
          description: 'List of chat messages/turns to scan when action is "scan_trajectory".',
        },
        mode: {
          type: 'string',
          enum: ['block', 'monitor'],
          description: 'Security enforcement mode for configure_policy ("block" for pre-action interruption, "monitor" for passive audit).',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const { action, targetTool = '', targetArgs = {}, messages = [], mode = null } = args

    switch (action) {
      case 'inspect_action': {
        if (!targetTool) {
          return { success: false, error: 'Please specify "targetTool" to inspect.' }
        }
        const verdict = inspectAction(targetTool, targetArgs)
        return {
          success: true,
          action: 'inspect_action',
          tool: targetTool,
          ...verdict,
        }
      }

      case 'scan_trajectory': {
        const report = scanTrajectory(messages)
        return {
          success: true,
          action: 'scan_trajectory',
          ...report,
        }
      }

      case 'configure_policy': {
        if (mode && ['block', 'monitor'].includes(mode)) {
          POLICY_CONFIG.mode = mode
        }
        return {
          success: true,
          action: 'configure_policy',
          currentPolicy: POLICY_CONFIG,
        }
      }

      case 'get_audit_log': {
        return {
          success: true,
          action: 'get_audit_log',
          totalEvents: AUDIT_LOG.length,
          events: AUDIT_LOG.slice(0, 50),
        }
      }

      case 'clear_audit_log': {
        AUDIT_LOG = []
        return {
          success: true,
          action: 'clear_audit_log',
          message: 'Security audit log cleared.',
        }
      }

      case 'list_rules': {
        return {
          success: true,
          action: 'list_rules',
          totalRules: NUMBAT_RULES.length,
          categories: NUMBAT_CATEGORIES,
          rules: NUMBAT_RULES.map(r => ({
            id: r.id,
            name: r.name,
            category: r.category,
            severity: r.severity,
            description: r.description,
            recommendation: r.recommendation,
          })),
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: inspect_action, scan_trajectory, configure_policy, get_audit_log, clear_audit_log, list_rules.`,
        }
    }
  },
}
