/**
 * Live feed of what the model is doing, for the docked Activity panel.
 *
 * DELIBERATELY NOT React state in App. Pushing streaming tokens through App
 * state re-renders the whole shell on every frame — the exact bug
 * StreamingMessage.jsx exists to avoid. App publishes here imperatively and
 * only the panel re-renders, coalesced to one animation frame.
 */

import { splitReasoning } from './reasoning'

const EMPTY = () => ({ reasoning: '', answer: '', steps: [], running: false, turn: 0 })

let state = EMPTY()
const subs = new Set()
let scheduled = false

function snapshot() {
  return { ...state, steps: state.steps.map((s) => ({ ...s })) }
}

function flush() {
  scheduled = false
  const snap = snapshot()
  // One bad subscriber must not stop the others from updating.
  for (const fn of [...subs]) { try { fn(snap) } catch { /* ignore */ } }
}

function schedule() {
  if (scheduled) return
  scheduled = true
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
  else setTimeout(flush, 16)
}

export function subscribeActivity(fn) {
  if (typeof fn !== 'function') return () => {}
  subs.add(fn)
  try { fn(snapshot()) } catch { /* ignore */ }
  return () => subs.delete(fn)
}

/** A new turn began: clear the previous one but keep the subscriber list. */
export function startActivityTurn() {
  const turn = state.turn + 1
  state = { ...EMPTY(), running: true, turn }
  schedule()
}

/** Full streamed text so far (the same value App hands StreamingMessage). */
export function publishStream(fullText) {
  const { reasoning, answer } = splitReasoning(fullText)
  state.reasoning = reasoning
  state.answer = answer
  schedule()
}

/** A tool started, finished, or failed. Keyed by id so updates replace. */
export function publishStep(step) {
  if (!step || !step.id) return
  const i = state.steps.findIndex((s) => s.id === step.id)
  if (i === -1) state.steps.push({ ...step })
  else state.steps[i] = { ...state.steps[i], ...step }
  schedule()
}

export function endActivityTurn() {
  state.running = false
  schedule()
}

export function getActivity() { return snapshot() }

/** Tests only. */
export function _flushActivity() { if (scheduled) flush() }
export function _resetActivity() { state = EMPTY(); subs.clear(); scheduled = false }
