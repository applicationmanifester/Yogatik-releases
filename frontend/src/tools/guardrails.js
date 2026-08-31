/**
 * Guardrails & Rebuff: Multi-Layer LLM Output Validation & Canary Defense Engine
 * 
 * Inspired by guardrails-ai/guardrails and protectai/rebuff.
 * Provides PII redaction/masking, JSON schema validation, toxic language filtering,
 * hallucination scoring, and canary injection defense for AI agents.
 */

export const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  apiKey: /\b(?:sk-[a-zA-Z0-9]{20,}|AIzaSy[a-zA-Z0-9_-]{33}|ghp_[a-zA-Z0-9]{36})\b/g,
}

export const TOXIC_PATTERNS = [
  /\b(hate\s+speech|kill\s+yourself|violence\s+against|self-harm|bomb\s+recipe)\b/i,
  /\b(bypass\s+safety|jailbreak\s+prompt|exploit\s+payload)\b/i,
]

// Active canary tokens for detecting prompt leaks
const ACTIVE_CANARIES = new Map()
// Now planted once per real agent turn (agent.js), not just on an opt-in tool
// call — a long-running chat session would otherwise grow this map forever.
// A Map keeps insertion order, so the first key really is the oldest.
const MAX_CANARIES = 200

/**
 * Generate a unique canary token and register it
 */
export function generateCanary(sessionId = 'default') {
  const token = `canary_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`
  ACTIVE_CANARIES.set(token, { sessionId, createdAt: Date.now() })
  if (ACTIVE_CANARIES.size > MAX_CANARIES) {
    ACTIVE_CANARIES.delete(ACTIVE_CANARIES.keys().next().value)
  }
  return token
}

/** Test-only accessor, matching the _resetCrewTraces/_resetToolStatus convention. */
export function _canaryCount() { return ACTIVE_CANARIES.size }

/**
 * Check if text contains any active canary tokens (indicating leak)
 */
export function checkCanaryLeak(text = '') {
  for (const [token, meta] of ACTIVE_CANARIES.entries()) {
    if (text.includes(token)) {
      return {
        leaked: true,
        token,
        meta,
      }
    }
  }
  return { leaked: false }
}

/**
 * Scans and redacts PII from text
 */
export function redactPII(text = '', options = { mask: '[REDACTED]' }) {
  let sanitized = text
  const detected = []

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = [...text.matchAll(pattern)]
    if (matches.length > 0) {
      detected.push({ type, count: matches.length, matches: matches.map(m => m[0]) })
      sanitized = sanitized.replace(pattern, `[REDACTED_${type.toUpperCase()}]`)
    }
  }

  return {
    originalLength: text.length,
    sanitizedLength: sanitized.length,
    detectedPIICount: detected.reduce((sum, d) => sum + d.count, 0),
    detected,
    sanitized,
  }
}

/**
 * Validates text against toxic/unsafe language triggers
 */
export function validateSafety(text = '') {
  const violations = []
  for (const pattern of TOXIC_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(pattern.toString())
    }
  }

  return {
    isSafe: violations.length === 0,
    violationCount: violations.length,
    violations,
  }
}

/**
 * Validates output against expected JSON schema structure
 */
export function validateSchema(jsonString = '', expectedKeys = []) {
  try {
    const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString
    const missingKeys = expectedKeys.filter(key => !(key in parsed))
    return {
      validJson: true,
      validSchema: missingKeys.length === 0,
      missingKeys,
      parsed,
    }
  } catch (err) {
    return {
      validJson: false,
      validSchema: false,
      error: err.message,
    }
  }
}

export const guardrailsTool = {
  schema: {
    name: 'guardrails',
    description: 'Guardrails & Rebuff safety enforcement engine (inspired by guardrails-ai and protectai/rebuff). Redacts PII, generates/checks canary tokens to prevent prompt leaks, validates JSON schema compliance, and filters toxic content.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['redact_pii', 'generate_canary', 'check_canary', 'validate_safety', 'validate_schema'],
          description: 'Guardrail action to perform.',
        },
        text: {
          type: 'string',
          description: 'Text to scan, redact, or validate.',
        },
        jsonString: {
          type: 'string',
          description: 'JSON payload to validate schema for.',
        },
        expectedKeys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required property keys for validate_schema.',
        },
        sessionId: {
          type: 'string',
          description: 'Session identifier for canary token tracking.',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const { action, text = '', jsonString = '', expectedKeys = [], sessionId = 'default' } = args

    switch (action) {
      case 'redact_pii': {
        if (!text) return { success: false, error: 'Please provide "text" to redact.' }
        const res = redactPII(text)
        return { success: true, action: 'redact_pii', ...res }
      }

      case 'generate_canary': {
        const canary = generateCanary(sessionId)
        return { success: true, action: 'generate_canary', canary, sessionId }
      }

      case 'check_canary': {
        if (!text) return { success: false, error: 'Please provide "text" to check for canary tokens.' }
        const res = checkCanaryLeak(text)
        return { success: true, action: 'check_canary', ...res }
      }

      case 'validate_safety': {
        if (!text) return { success: false, error: 'Please provide "text" to validate.' }
        const res = validateSafety(text)
        return { success: true, action: 'validate_safety', ...res }
      }

      case 'validate_schema': {
        if (!jsonString) return { success: false, error: 'Please provide "jsonString" to validate.' }
        const res = validateSchema(jsonString, expectedKeys)
        return { success: true, action: 'validate_schema', ...res }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: redact_pii, generate_canary, check_canary, validate_safety, validate_schema.`,
        }
    }
  },
}
