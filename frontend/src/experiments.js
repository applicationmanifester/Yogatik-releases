/**
 * Lightweight, client-side A/B experiment framework. Deterministic variant
 * assignment (stable per user+experiment via a hash, so a user always sees the
 * same arm), flag-gated, with exposure + outcome events routed to the opt-in
 * analytics hub. No backend required — experiments are declared in code and
 * results read from analytics.
 *
 * Pure assignment (assignVariant, hashString) is testable without storage.
 */
import { track } from './analytics'

const UNIT_KEY = 'yogatik.exp.unit' // stable pseudonymous unit id (not PII)

/** FNV-1a 32-bit hash → deterministic, fast, no crypto needed for bucketing. */
export function hashString(str) {
  let h = 0x811c9dc5
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Deterministically assign a unit to one of `variants` for an experiment.
 * Weighted: variants may be strings (equal weight) or {name, weight}.
 */
export function assignVariant(experimentId, unitId, variants) {
  const norm = variants.map(v => (typeof v === 'string' ? { name: v, weight: 1 } : v))
  const total = norm.reduce((a, v) => a + (v.weight || 1), 0)
  const point = (hashString(`${experimentId}:${unitId}`) % 10000) / 10000 * total
  let acc = 0
  for (const v of norm) {
    acc += v.weight || 1
    if (point < acc) return v.name
  }
  return norm[norm.length - 1].name
}

function unitId() {
  try {
    let id = localStorage.getItem(UNIT_KEY)
    if (!id) { id = (hashString(String(Date.now() + Math.random()))).toString(36); localStorage.setItem(UNIT_KEY, id) }
    return id
  } catch { return 'anon' }
}

const _exposed = new Set()

/**
 * Get the active variant for an experiment and log a one-time exposure event.
 * @param {{id:string, variants:(string|{name:string,weight:number})[], enabled?:boolean}} exp
 */
export function getVariant(exp) {
  if (!exp?.id || !Array.isArray(exp.variants) || !exp.variants.length) return null
  if (exp.enabled === false) return null
  const variant = assignVariant(exp.id, unitId(), exp.variants)
  const key = `${exp.id}:${variant}`
  if (!_exposed.has(key)) {
    _exposed.add(key)
    track('experiment_exposure', { feature: exp.id, count: 1 })
  }
  return variant
}

/** Record an experiment outcome (conversion, rating, etc.). */
export function trackOutcome(experimentId, metric, value = 1) {
  track('experiment_outcome', { feature: experimentId, count: typeof value === 'number' ? value : 1 })
}

/** Test helper. */
export function _resetExperiments() { _exposed.clear() }
