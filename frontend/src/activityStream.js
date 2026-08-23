/**
 * Live feed of what the model is doing, for the docked Activity panel.
 * 
 * Scoped uniquely per conversation / workspace so reasoning, actions, and tools
 * do not leak or persist across distinct chat sessions.
 */

import { splitReasoning } from './reasoning'

const EMPTY = () => ({ reasoning: '', answer: '', steps: [], running: false, turn: 0 })

let activeConvId = 'default'
const conversationStates = new Map([['default', EMPTY()]])
const subs = new Map()
let scheduled = false

/**
 * A long session can visit hundreds of chats, and each one holds its reasoning
 * text until something clears it. Map insertion order gives us an LRU for free:
 * re-inserting a key moves it to the end, so the oldest untouched conversation
 * is always first. The active conversation and anything still running are never
 * evicted — dropping a live turn would blank the panel mid-answer.
 */
const MAX_TRACKED_CONVERSATIONS = 24

function prune() {
  if (conversationStates.size <= MAX_TRACKED_CONVERSATIONS) return
  for (const [key, st] of conversationStates) {
    if (conversationStates.size <= MAX_TRACKED_CONVERSATIONS) break
    if (key === activeConvId || key === 'default' || st.running) continue
    conversationStates.delete(key)
  }
}

function touch(key) {
  const st = conversationStates.get(key)
  if (st === undefined) return undefined
  // Re-insert so this key becomes the most recently used.
  conversationStates.delete(key)
  conversationStates.set(key, st)
  return st
}

function getConvState(convId = activeConvId) {
  const key = String(convId || activeConvId || 'default')
  const existing = touch(key)
  if (existing) return existing
  conversationStates.set(key, EMPTY())
  prune()
  return conversationStates.get(key)
}

function snapshot(convId = activeConvId) {
  const st = getConvState(convId)
  return { ...st, steps: st.steps.map((s) => ({ ...s })) }
}

function flush() {
  scheduled = false
  // One bad subscriber must not stop the others from updating.
  for (const [fn, convId] of subs) {
    try {
      fn(snapshot(convId || activeConvId))
    } catch { /* ignore */ }
  }
}

function schedule() {
  if (scheduled) return
  scheduled = true
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
  else setTimeout(flush, 16)
}

/** Switch the active conversation context for the live Activity stream */
export function setActivityConversation(convId) {
  const key = String(convId || 'default')
  if (activeConvId !== key) {
    activeConvId = key
    // getConvState creates it if new, marks it most-recently-used, and prunes.
    getConvState(key)
    schedule()
  }
}

export function subscribeActivity(fn, targetConvId = null) {
  if (typeof fn !== 'function') return () => {}
  subs.set(fn, targetConvId)
  try { fn(snapshot(targetConvId || activeConvId)) } catch { /* ignore */ }
  return () => subs.delete(fn)
}

/** A new turn began: clear the previous one for this conversation */
export function startActivityTurn(convId = activeConvId) {
  const key = String(convId || activeConvId || 'default')
  const st = getConvState(key)
  const turn = (st.turn || 0) + 1
  conversationStates.set(key, { ...EMPTY(), running: true, turn })
  prune()
  schedule()
}

/** Full streamed text so far */
export function publishStream(fullText, convId = activeConvId) {
  const key = String(convId || activeConvId || 'default')
  const st = getConvState(key)
  const { reasoning, answer } = splitReasoning(fullText)
  st.reasoning = reasoning
  st.answer = answer
  schedule()
}

/** A tool started, finished, or failed. Keyed by id so updates replace. */
export function publishStep(step, convId = activeConvId) {
  if (!step || !step.id) return
  const key = String(convId || activeConvId || 'default')
  const st = getConvState(key)
  const i = st.steps.findIndex((s) => s.id === step.id)
  if (i === -1) st.steps.push({ ...step })
  else st.steps[i] = { ...st.steps[i], ...step }
  schedule()
}

export function endActivityTurn(convId = activeConvId) {
  const key = String(convId || activeConvId || 'default')
  const st = getConvState(key)
  st.running = false
  schedule()
}

export function clearActivity(convId = activeConvId) {
  const key = String(convId || activeConvId || 'default')
  conversationStates.set(key, EMPTY())
  prune()
  schedule()
}

export function getActivity(convId = activeConvId) { return snapshot(convId) }

/** Tests only. */
export function _flushActivity() { if (scheduled) flush() }
export function _resetActivity() {
  activeConvId = 'default'
  conversationStates.clear()
  conversationStates.set('default', EMPTY())
  subs.clear()
  scheduled = false
}
