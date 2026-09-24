import { describe, it, expect } from 'vitest'
import {
  createExecutionTracker,
  recordExecutionOutcome,
  detectStagnation,
  buildReworkFeedbackMessage
} from './relentlessLoop'

describe('RelentlessReworkLoop', () => {
  it('tracks execution outcomes and detects stagnation after 3 identical failures', () => {
    const tracker = createExecutionTracker({ stagnationThreshold: 3 })

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'TypeError: x is not a function' })
    expect(detectStagnation(tracker)).toBe(false)

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'TypeError: x is not a function' })
    expect(detectStagnation(tracker)).toBe(false)

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'TypeError: x is not a function' })
    expect(detectStagnation(tracker)).toBe(true)
  })

  it('resets consecutive identical errors when a different error or success occurs', () => {
    const tracker = createExecutionTracker({ stagnationThreshold: 3 })

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'Error A' })
    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'Error A' })
    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'Error B' })

    expect(detectStagnation(tracker)).toBe(false)
    expect(tracker.consecutiveIdenticalErrors).toBe(1)
  })

  it('builds clear diagnostic feedback directive to instruct model to pivot on failure', () => {
    const tracker = createExecutionTracker()
    recordExecutionOutcome(tracker, {
      action: 'test_and_heal',
      diagnostics: 'FAIL src/math.test.js > add: expected 5 to be 4',
      exitCode: 1,
    })

    const msg = buildReworkFeedbackMessage(tracker, { isStagnant: true })
    expect(msg).toContain('AUTONOMOUS REWORK DIRECTIVE')
    expect(msg).toContain('STAGNATION DETECTED')
    expect(msg).toContain('FAIL src/math.test.js')
    expect(msg).toContain('Do NOT stop or ask permission')
  })
})
