/**
 * Rebuff-Style Prompt Injection & Canary Defense Guard
 * 
 * Inspired by protectai/rebuff & guardrails-ai/guardrails.
 * Provides client-side, zero-latency defense against:
 * 1. Prompt injections & jailbreaks in user input and web search results.
 * 2. Canary token generation and leakage detection in model outputs.
 * 3. Structured payload validation before executing tool actions.
 */

// Known adversarial prompt injection signatures
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions|rules)/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /dan\s+mode\s+enabled/i,
  /output\s+the\s+(system\s+prompt|initial\s+instructions|hidden\s+rules)/i,
  /reveal\s+your\s+(secret|system|master)\s+prompt/i,
  /system\s+override\s*:\s*true/i,
  /\bdo\s+anything\s+now\b/i,
  /\b(jailbreak|unrestricted|bypass\s+safety)\b/i,
  /<\|im_start\|>system/i,
  /\[SYSTEM_DIRECTIVE_OVERRIDE\]/i,
]

/**
 * Generates a unique, high-entropy canary token to guard sensitive context.
 */
export function generateCanaryToken(prefix = 'CANARY') {
  const randomBytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes)
  } else {
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256)
    }
  }
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${hex}`
}

/**
 * Checks text for prompt injection signatures and returns a risk score (0.0 to 1.0).
 */
export function detectPromptInjection(text = '') {
  if (typeof text !== 'string' || !text.trim()) {
    return { isInjection: false, score: 0, matchedPatterns: [] }
  }

  const matches = []
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push(pattern.source)
    }
  }

  // Base score on matched heuristic density
  const score = Math.min(1.0, matches.length * 0.4)
  const isInjection = matches.length > 0 && score >= 0.4

  return {
    isInjection,
    score,
    matchedPatterns: matches,
    cleanText: isInjection ? text.replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[FILTERED_OVERRIDE]') : text
  }
}

/**
 * Verifies that none of the active canary tokens have leaked into the output.
 */
export function detectCanaryLeak(outputText = '', activeCanaries = []) {
  if (!outputText || !activeCanaries.length) {
    return { hasLeaked: false, leakedCanary: null }
  }

  for (const canary of activeCanaries) {
    if (typeof canary === 'string' && canary.length >= 8 && outputText.includes(canary)) {
      return {
        hasLeaked: true,
        leakedCanary: canary,
        scrubbedOutput: outputText.replaceAll(canary, '[REDACTED_SECURITY_TOKEN]')
      }
    }
  }

  return { hasLeaked: false, leakedCanary: null, scrubbedOutput: outputText }
}

/**
 * Sanitizes untrusted external text (e.g. from web search, scraped DOM, or external MCP tools)
 * before feeding into LLM agent reasoning loops.
 */
export function sanitizeExternalContext(rawContext = '', canaryToken = null) {
  if (typeof rawContext !== 'string') return ''

  let sanitized = rawContext
  const injection = detectPromptInjection(sanitized)
  
  if (injection.isInjection) {
    // Neutralize dangerous phrases without destroying legitimate content
    for (const pattern of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[UNTRUSTED_INJECTION_STRIPPED]')
    }
  }

  if (canaryToken) {
    return `<!-- Context Guard: Protected Payload -->\n${sanitized}\n<!-- End Guard -->`
  }

  return sanitized
}
