import { describe, it, expect } from 'vitest'
import { extractPlan, recognizeStepCommand, createPlanState, dispatchStep, buildStepPrompt, stepLabel, MAX_STEPS } from './stepMode'

describe('extractPlan', () => {
  it('parses numbered list "1. step one"', () => {
    const p = extractPlan('1. first step\n2. second step\n3. third')
    expect(p).not.toBeNull()
    expect(p.steps).toEqual(['first step', 'second step', 'third'])
    expect(p.kind).toBe('numbered')
  })
  it('parses "1) step" variant', () => {
    const p = extractPlan('1) first\n2) second')
    expect(p?.steps).toEqual(['first', 'second'])
  })
  it('parses dash bullets', () => {
    const p = extractPlan('- step one\n- step two\n- step three')
    expect(p?.steps).toEqual(['step one', 'step two', 'step three'])
    expect(p.kind).toBe('dash')
  })
  it('parses ordinal words (First, Then, Finally)', () => {
    const p = extractPlan('First, do this\nThen, do that\nFinally, finish')
    expect(p?.steps).toEqual(['do this', 'do that', 'finish'])
    expect(p.kind).toBe('ordinal')
  })
  it('ignores single item — not a plan', () => {
    expect(extractPlan('1. only one')).toBeNull()
  })
  it('ignores prose between plan items — longest run wins', () => {
    const p = extractPlan('1. a\n2. b\n\njust talking\n\n3. c\n4. d\n5. e')
    expect(p?.steps.length).toBe(3)
    expect(p?.steps).toEqual(['c', 'd', 'e'])
  })
  it('handles markdown bold inside items', () => {
    const p = extractPlan('1. **mix** the batter\n2. **pour**')
    expect(p?.steps).toEqual(['mix the batter', 'pour'])
  })
  it('caps at MAX_STEPS', () => {
    const text = Array.from({ length: 20 }, (_, i) => `${i + 1}. step ${i + 1}`).join('\n')
    const p = extractPlan(text)
    expect(p?.steps.length).toBe(MAX_STEPS)
  })
  it('returns null for empty string', () => {
    expect(extractPlan('')).toBeNull()
  })
})

describe('recognizeStepCommand', () => {
  const cases = [
    ['next', 'next'],
    ['next step', 'next'],
    ['continue', 'next'],
    ['go on', 'next'],
    ['keep going', 'next'],
    ['onward', 'next'],
    ['done', 'done'],
    ['all done', 'done'],
    ['did it', 'done'],
    ['that\'s it', 'done'],
    ['task complete', 'done'],
    ['back', 'back'],
    ['go back', 'back'],
    ['previous', 'back'],
    ['last step', 'back'],
    ['step back', 'back'],
    ['repeat', 'repeat'],
    ['one more time', 'repeat'],
    ['say that again', 'repeat'],
    ["what's left", 'remaining'],
    ['what is remaining', 'remaining'],
    ['how many steps left', 'remaining'],
    ['how far along', 'remaining'],
    ['where are we', 'remaining'],
    ['what about next', null], // question
    ['when will this be done', null], // question
    ['backup plan', null], // contains 'back' but not word-boundary
  ]
  for (const [utterance, expected] of cases) {
    it(`"${utterance}" → ${expected}`, () => {
      expect(recognizeStepCommand(utterance)).toBe(expected)
    })
  }
})

describe('createPlanState', () => {
  it('starts at index 0', () => {
    const s = createPlanState({ steps: ['a', 'b'] })
    expect(s).toEqual({ index: 0, total: 2 })
  })
  it('handles empty plan', () => {
    expect(createPlanState(null)).toEqual({ index: 0, total: 0 })
    expect(createPlanState({ steps: [] })).toEqual({ index: 0, total: 0 })
  })
})

describe('dispatchStep', () => {
  const plan = { steps: ['step one', 'step two', 'step three'] }
  const base = { index: 0, total: 3 }

  it('next advances on non-last step', () => {
    const r = dispatchStep(plan, base, 'next')
    expect(r.used).toBe(true)
    expect(r.event.type).toBe('advance')
    expect(r.state.index).toBe(1)
    expect(r.event.step).toBe('step two')
  })
  it('next on last step is noop', () => {
    const r = dispatchStep(plan, { index: 2, total: 3 }, 'next')
    expect(r.used).toBe(true)
    expect(r.event.type).toBe('noop')
    expect(r.event.reason).toBe('last-step')
  })
  it('done advances on non-last step', () => {
    const r = dispatchStep(plan, base, 'done')
    expect(r.event.type).toBe('advance')
    expect(r.state.index).toBe(1)
  })
  it('done on last step is complete', () => {
    const r = dispatchStep(plan, { index: 2, total: 3 }, 'done')
    expect(r.event.type).toBe('complete')
    expect(r.event.index).toBe(2)
  })
  it('back goes back one', () => {
    const r = dispatchStep(plan, { index: 2, total: 3 }, 'back')
    expect(r.event.type).toBe('back')
    expect(r.state.index).toBe(1)
  })
  it('back on first step is noop', () => {
    const r = dispatchStep(plan, { index: 0, total: 3 }, 'back')
    expect(r.event.type).toBe('noop')
    expect(r.event.reason).toBe('first-step')
  })
  it('repeat emits repeat event, no state change', () => {
    const r = dispatchStep(plan, { index: 1, total: 3 }, 'repeat')
    expect(r.used).toBe(true)
    expect(r.event.type).toBe('repeat')
    expect(r.state.index).toBe(1)
  })
  it('remaining emits count', () => {
    const r = dispatchStep(plan, { index: 1, total: 3 }, 'remaining')
    expect(r.event.type).toBe('remaining')
    expect(r.event.left).toBe(1)
  })
  it('unrecognised → used:false, no event', () => {
    const r = dispatchStep(plan, base, 'foo bar')
    expect(r.used).toBe(false)
    expect(r.event).toBeNull()
  })
})

describe('buildStepPrompt', () => {
  it('empty plan → empty string', () => {
    expect(buildStepPrompt(null)).toBe('')
    expect(buildStepPrompt({ steps: [] })).toBe('')
  })
  it('builds numbered context with current step highlighted', () => {
    const plan = { steps: ['crack eggs', 'mix batter', 'cook'] }
    const p = buildStepPrompt(plan, { index: 0 })
    expect(p).toContain('STEP-BY-STEP MODE')
    expect(p).toContain('Current step 1: crack eggs')
    expect(p).toContain('Still to come')
    expect(p).toContain('2. mix batter')
    expect(p).toContain('3. cook')
  })
  it('shows completed count when writes > 0', () => {
    const plan = { steps: ['a', 'b', 'c'] }
    const p = buildStepPrompt(plan, { index: 1, writes: 1 })
    expect(p).toContain('step 2 of 3 (1 done)')
  })
  it('last step says it is the last', () => {
    const plan = { steps: ['a', 'b'] }
    const p = buildStepPrompt(plan, { index: 1 })
    expect(p).toContain('This is the last step')
  })
  it('index clamps to last step', () => {
    const plan = { steps: ['a'] }
    const p = buildStepPrompt(plan, { index: 5 })
    expect(p).toContain('Current step 1: a')
    expect(p).toContain('last step')
  })
})

describe('stepLabel', () => {
  it('returns null for empty plan', () => {
    expect(stepLabel(null)).toBeNull()
    expect(stepLabel({ steps: [] })).toBeNull()
  })
  it('returns k/n/text/hint', () => {
    const l = stepLabel({ steps: ['one', 'two'] }, 0)
    expect(l).toEqual({ k: 1, n: 2, text: 'one', hint: 'Say "next", "done", "back", "repeat" or "what\'s left"' })
  })
  it('clamps index', () => {
    const l = stepLabel({ steps: ['a', 'b'] }, 10)
    expect(l.k).toBe(2)
    expect(l.n).toBe(2)
  })
})