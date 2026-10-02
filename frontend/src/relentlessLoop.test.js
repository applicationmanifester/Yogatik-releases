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

  it('diagnoses common compiler and runtime errors', () => {
    const { diagnoseCommonError } = require('./relentlessLoop')
    expect(diagnoseCommonError("Error: Cannot find module './utils'")).toContain('Missing module "./utils"')
    expect(diagnoseCommonError("TypeError: calculate is not a function")).toContain('Type Error: "calculate" is not callable')
    expect(diagnoseCommonError("ReferenceError: foo is not defined")).toContain('Reference Error: "foo" is not defined')
    expect(diagnoseCommonError("SyntaxError: Unexpected token '<'")).toContain('Syntax Error')
    expect(diagnoseCommonError("ENOENT: no such file or directory, open 'src/main.js'")).toContain('File Not Found')
  })

  it('detects repetitive action when same action is performed 3 times', () => {
    const { detectRepetitiveAction } = require('./relentlessLoop')
    const tracker = createExecutionTracker()
    tracker.history.push({ action: 'fs_read', target: 'src/main.js' })
    tracker.history.push({ action: 'fs_read', target: 'src/main.js' })
    tracker.history.push({ action: 'fs_read', target: 'src/main.js' })
    expect(detectRepetitiveAction(tracker, 'fs_read', 'src/main.js')).toBe(true)
    expect(detectRepetitiveAction(tracker, 'fs_read', 'src/other.js')).toBe(false)
  })

  it('generates structured autonomous momentum directive', () => {
    const { buildAutonomousMomentumDirective } = require('./relentlessLoop')
    const directive = buildAutonomousMomentumDirective({ step: 2, totalSteps: 5, summary: 'Read config files.' })
    expect(directive).toContain('AUTONOMOUS MOMENTUM DIRECTIVE - Step 2/5')
    expect(directive).toContain('Read config files.')
  })
})

