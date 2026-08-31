import { describe, it, expect } from 'vitest'
import {
  redactPII,
  validateSafety,
  validateSchema,
  generateCanary,
  checkCanaryLeak,
  guardrailsTool,
  _canaryCount,
} from './guardrails'

describe('Guardrails & Rebuff Safety Engine', () => {
  it('detects and redacts emails, phone numbers, and SSNs from text', () => {
    const raw = 'Contact alice@corp.com or call 555-123-4567. SSN: 123-45-6789'
    const redacted = redactPII(raw)

    expect(redacted.detectedPIICount).toBe(3)
    expect(redacted.sanitized).toContain('[REDACTED_EMAIL]')
    expect(redacted.sanitized).toContain('[REDACTED_PHONE]')
    expect(redacted.sanitized).toContain('[REDACTED_SSN]')
    expect(redacted.sanitized).not.toContain('alice@corp.com')
  })

  it('generates and detects leaked canary tokens (Rebuff style)', () => {
    const token = generateCanary('agent-session-1')
    expect(token).toContain('canary_')

    const leakCheck1 = checkCanaryLeak(`User output containing secret ${token}`)
    expect(leakCheck1.leaked).toBe(true)
    expect(leakCheck1.token).toBe(token)

    const leakCheck2 = checkCanaryLeak('Clean text with no token')
    expect(leakCheck2.leaked).toBe(false)
  })

  it('validates JSON output against schema constraints', () => {
    const validJson = JSON.stringify({ name: 'Alpha', score: 95, status: 'active' })
    const res = validateSchema(validJson, ['name', 'score', 'status'])
    expect(res.validJson).toBe(true)
    expect(res.validSchema).toBe(true)
    expect(res.missingKeys.length).toBe(0)

    const missingKeyJson = JSON.stringify({ name: 'Alpha' })
    const res2 = validateSchema(missingKeyJson, ['name', 'score'])
    expect(res2.validSchema).toBe(false)
    expect(res2.missingKeys).toContain('score')
  })

  it('evicts the oldest canary once the tracked set exceeds its cap', () => {
    // Planted once per real agent turn now (agent.js), not just on an opt-in
    // tool call — a long session must not grow this map forever.
    for (let i = 0; i < 30; i++) generateCanary(`evict-fill-${i}`)
    expect(_canaryCount()).toBeLessThanOrEqual(200)
    const stale = generateCanary('evict-oldest-marker')
    for (let i = 0; i < 250; i++) generateCanary(`evict-push-${i}`)
    expect(_canaryCount()).toBeLessThanOrEqual(200)
    // The token planted before the flood is gone — evicted, not merely old.
    expect(checkCanaryLeak(`reply containing ${stale}`).leaked).toBe(false)
    const recent = generateCanary('evict-recent')
    expect(checkCanaryLeak(`reply containing ${recent}`).leaked).toBe(true)
  })

  it('guardrailsTool executes redact_pii, generate_canary, check_canary, and validate_schema', async () => {
    const piiRes = await guardrailsTool.execute({
      action: 'redact_pii',
      text: 'Send payments to john.doe@bank.com',
    })
    expect(piiRes.success).toBe(true)
    expect(piiRes.sanitized).toContain('[REDACTED_EMAIL]')

    const canaryRes = await guardrailsTool.execute({
      action: 'generate_canary',
      sessionId: 'test_session',
    })
    expect(canaryRes.success).toBe(true)
    expect(canaryRes.canary).toBeDefined()
  })
})
