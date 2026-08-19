/**
 * The link between the policy rail and the human.
 *
 * classifyAction says whether a step is irreversible; this decides whether to
 * ask, and waits for the answer. Kept separate and pure — injected `confirm`,
 * no DOM — because "did it actually ask before sending the email" is the
 * property that matters most, and it must be testable without a window.
 *
 * Fails CLOSED: if there is no way to ask, the action does not happen. An
 * autopilot that proceeds because the dialog failed to open is the worst
 * available failure mode.
 */

import { classifyAction } from './policy'

export const MODES = { ASK: 'ask', AUTO: 'auto' }

export function createActionGate({ mode = MODES.ASK, confirm, onDecision, signal } = {}) {
  let current = mode

  async function gate(step) {
    const verdict = classifyAction(step)

    if (signal?.aborted) {
      const d = { allowed: false, reason: 'Stopped.', risk: verdict.risk, step }
      onDecision?.(d)
      return d
    }

    // Ask-first checks everything. Autopilot only stops at the rail — that is
    // the whole difference between the two modes.
    const mustAsk = current === MODES.ASK ? true : verdict.risk === 'confirm'

    if (!mustAsk) {
      const d = { allowed: true, auto: true, reason: verdict.reason, risk: verdict.risk, step }
      onDecision?.(d)
      return d
    }

    if (typeof confirm !== 'function') {
      const d = {
        allowed: false,
        reason: 'Nothing available to confirm with, so the action was not taken.',
        risk: verdict.risk,
        step,
      }
      onDecision?.(d)
      return d
    }

    let answer = false
    try {
      answer = await confirm({ step, reason: verdict.reason, risk: verdict.risk, mode: current })
    } catch {
      answer = false   // a broken prompt must never become a yes
    }

    const d = {
      allowed: !!answer,
      asked: true,
      reason: answer ? verdict.reason : 'Declined.',
      risk: verdict.risk,
      step,
    }
    onDecision?.(d)
    return d
  }

  gate.setMode = (next) => { current = next === MODES.AUTO ? MODES.AUTO : MODES.ASK; return current }
  gate.getMode = () => current
  return gate
}

/**
 * Run a list of steps through the gate. Declining one skips it and continues —
 * a single "no" should not throw away the rest of a plan.
 */
export async function runGuarded({ steps = [], gate, execute, signal, onStep } = {}) {
  const results = []
  for (const step of steps) {
    if (signal?.aborted) break
    const decision = await gate(step)
    if (!decision.allowed) {
      const skipped = { step, skipped: true, reason: decision.reason }
      results.push(skipped)
      onStep?.(skipped)
      continue
    }
    let output
    try { output = await execute(step) }
    catch (e) { output = { error: e?.message || String(e) } }
    const done = { step, output }
    results.push(done)
    onStep?.(done)
  }
  return results
}
