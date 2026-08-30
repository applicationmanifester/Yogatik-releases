/**
 * Implicit procedural adaptation — learn *how* the user likes to interact from
 * their behaviour, not from a settings form. Signals (reply lengths they engage
 * with, tools they lean on, styles/personas they pick) are distilled into
 * procedural memories that shape the system prompt, closing the personalization
 * loop from the audit.
 *
 * Pure derivation (deriveProcedural) is separated from storage (captureBehaviour)
 * so the logic is unit-testable. Conservative by design: only emits a preference
 * once there is enough evidence, so one long message doesn't set a permanent
 * "prefers detailed answers" flag.
 */
import { STORES } from './memory4'

const MIN_SAMPLES = 4 // evidence threshold before asserting a preference

/**
 * Pure: given aggregated behaviour signals, return procedural preference
 * statements (each { text, importance }) suitable for the procedural store.
 *
 * @param {{ userMsgLengths?: number[], toolCounts?: Record<string,number>,
 *           styleId?: string, personaName?: string }} signals
 */
export function deriveProcedural(signals = {}) {
  const out = []
  const lengths = signals.userMsgLengths || []

  if (lengths.length >= MIN_SAMPLES) {
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
    if (avg < 60) out.push({ text: 'tends to send short messages; keep replies concise', importance: 0.6 })
    else if (avg > 240) out.push({ text: 'writes detailed messages; thorough replies are welcome', importance: 0.6 })
  }

  const tools = signals.toolCounts || {}
  const total = Object.values(tools).reduce((a, b) => a + b, 0)
  if (total >= MIN_SAMPLES) {
    const top = Object.entries(tools).sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] / total >= 0.4) {
      out.push({ text: `frequently uses the ${top[0]} tool`, importance: 0.5 })
    }
  }

  if (signals.styleId && signals.styleId !== 'default') {
    out.push({ text: `prefers the "${signals.styleId}" response style`, importance: 0.5 })
  }
  if (signals.personaName) {
    out.push({ text: `often chats with the "${signals.personaName}" persona`, importance: 0.4 })
  }
  return out
}

/**
 * Aggregate raw per-turn events into the signals shape deriveProcedural expects.
 * @param {Array<{userLen?:number, tool?:string, styleId?:string, personaName?:string}>} events
 */
export function aggregateSignals(events = []) {
  const userMsgLengths = []
  const toolCounts = {}
  let styleId, personaName
  for (const e of events) {
    if (typeof e.userLen === 'number') userMsgLengths.push(e.userLen)
    if (e.tool) toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1
    if (e.styleId) styleId = e.styleId
    if (e.personaName) personaName = e.personaName
  }
  return { userMsgLengths, toolCounts, styleId, personaName }
}

// Rolling in-memory buffer so callers can just record one turn at a time; the
// procedural store is only written once enough evidence accumulates.
const CAPTURE_EVERY = 8
let _buffer = []

/** Record a single completed turn; captures to storage every CAPTURE_EVERY turns. */
export function recordTurn(event) {
  if (!event) return
  _buffer.push(event)
  if (_buffer.length >= CAPTURE_EVERY) {
    const batch = _buffer
    _buffer = []
    captureBehaviour(batch)
  }
}

/** Test helper. */
export function _resetAdaptation() { _buffer = [] }

/**
 * Storage-backed: derive procedural preferences from recent behaviour and write
 * them to the procedural memory store (dedupe/bump handled by remember). No-op
 * on any failure — adaptation must never break a turn.
 */
export async function captureBehaviour(events) {
  try {
    if (!STORES.includes('procedural')) return
    const prefs = deriveProcedural(aggregateSignals(events))
    if (!prefs.length) return
    const { remember } = await import('./memory4')
    for (const p of prefs) await remember({ store: 'procedural', text: p.text, importance: p.importance })
    return prefs.length
  } catch { /* silent */ }
}

/**
 * Seed procedural memory explicitly from first-run onboarding selections
 * so that turn 1 is already tailored to the user's desired style and boundary.
 */
export async function seedOnboardingPreferences({ persona, style, boundary } = {}) {
  try {
    const { remember } = await import('./memory4')
    if (style && style !== 'balanced') {
      const text = style === 'concise'
        ? 'prefers concise, direct responses with minimal preamble'
        : 'prefers detailed, thorough explanations with rich context'
      await remember({ store: 'procedural', text, importance: 0.8 })
    }
    if (boundary) {
      const text = boundary === 'companion'
        ? 'warm, supportive, and conversational interaction tone'
        : 'professional, task-focused, and direct assistant tone'
      await remember({ store: 'procedural', text, importance: 0.8 })
    }
    if (persona && persona !== 'default') {
      await remember({ store: 'procedural', text: `selected the "${persona}" personality as initial preference`, importance: 0.7 })
    }
  } catch { /* silent */ }
}
