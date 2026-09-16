/**
 * Live session instrumentation.
 *
 * There was NO telemetry on Live at all. telemetry.js measures chat turns, so
 * nobody knew the p50 time-to-first-word, how often barge-in misfired, or how
 * many sessions died in the first thirty seconds — which means every
 * prioritisation decision about this module has been a guess.
 *
 * Everything is local and in memory, on the same terms as telemetry.js: no
 * network, no identifiers, no content. What is recorded is timing and counts,
 * because those are the numbers that decide what to build next and they are
 * also the only ones that carry no privacy cost.
 *
 * Pure and DOM-free so it can be tested without a call.
 */

const MAX_SESSIONS = 50

/**
 * Why a session ended. The distribution of this is the single most useful
 * number here: "user hung up after two turns" and "the socket died" look
 * identical in a session-length histogram and mean opposite things.
 */
export const END_REASON = {
  USER: 'user',            // pressed End — the healthy case
  ERROR: 'error',          // provider or socket failure
  NO_MIC: 'no-mic',        // permission denied or no device
  MODEL_BLIND: 'blind',    // refused to start: text-only model with camera on
  UNMOUNT: 'unmount',      // navigated away without ending
}

/* ── Latency SLO thresholds (ms) ───────────────────────────────────────── */

export const VOICE_SLO_MS = 300       // voice-only: ≤300ms first word
export const MULTIMODAL_SLO_MS = 600  // vision/multimodal: ≤600ms first word
export const TEXT_SLO_MS = 1000       // text fallback: ≤1000ms TTFB

/**
 * Check whether a latency measurement meets its SLO.
 * @param {'voice'|'multimodal'|'text'} type
 * @param {number} latencyMs
 * @returns {{ ok: boolean, exceededByMs: number, threshold: number }}
 */
export function checkSLO(type, latencyMs) {
  const threshold = type === 'voice' ? VOICE_SLO_MS
    : type === 'multimodal' ? MULTIMODAL_SLO_MS
    : TEXT_SLO_MS
  const exceeded = Math.max(0, latencyMs - threshold)
  return { ok: exceeded === 0, exceededByMs: exceeded, threshold }
}

/**
 * Classify latency into a display grade.
 * @param {number} latencyMs
 * @param {'voice'|'multimodal'|'text'} type
 * @returns {'ok'|'warn'|'bad'}
 */
export function latencyGrade(latencyMs, type = 'voice') {
  const threshold = type === 'voice' ? VOICE_SLO_MS
    : type === 'multimodal' ? MULTIMODAL_SLO_MS
    : TEXT_SLO_MS
  if (latencyMs <= threshold) return 'ok'
  if (latencyMs <= threshold * 2) return 'warn'
  return 'bad'
}

const emptySession = () => ({
  engine: null,
  provider: null,
  modelCanSee: null,
  startedAt: 0,
  endedAt: 0,
  cameraOn: false,          // did the camera EVER come on — the differentiator metric
  turns: 0,
  toolTurns: 0,             // turns that used at least one tool
  tools: 0,                 // total tool calls
  bargeIns: 0,
  bargeInFalsePositives: 0, // interrupted, then nothing was actually said
  firstWordMs: [],          // per turn: user stopped speaking → first spoken word
  endReason: null,
  sloViolations: { voice: 0, multimodal: 0, text: 0 },  // Phase 4: SLO violation counts
  consecutiveSloBreaches: 0, // for fallback suggestion trigger
  lastLatencyMs: null,       // most recent first-word latency
})

let current = null
const finished = []

/* ── recording ─────────────────────────────────────────────────────────── */

export function startSession({ engine, provider, modelCanSee } = {}, now = Date.now()) {
  current = { ...emptySession(), engine: engine || null, provider: provider || null, modelCanSee: !!modelCanSee, startedAt: now }
  return current
}

/** The user stopped talking; the clock for this turn's first word starts here. */
export function markUtteranceEnd(now = Date.now()) {
  if (!current) return
  // `_turnActive` is a separate flag rather than testing `_turnStart` for
  // truthiness. A timestamp of 0 is falsy, so "a turn started at 0" and "no
  // turn is running" were the same value — the turn silently recorded nothing.
  // Date.now() is never 0 in production, which is exactly why this class of bug
  // survives review and only a test with a fake clock finds it.
  current._turnActive = true
  current._turnStart = now
  current._spoke = false
  current._usedTool = false
}

/** The assistant's first audible word for this turn. */
export function markFirstWord(now = Date.now()) {
  if (!current || !current._turnActive || current._spoke) return
  current._spoke = true
  const ms = now - current._turnStart
  current.firstWordMs.push(ms)
  recordLatency(ms, current.cameraOn ? 'multimodal' : 'voice')
}

export function markTurnEnd() {
  if (!current) return
  current.turns++
  if (current._usedTool) current.toolTurns++
  current._turnActive = false
  current._turnStart = 0
}

export function markTool(count = 1) {
  if (!current) return
  current.tools += count
  current._usedTool = true
}

export function markCameraOn() { if (current) current.cameraOn = true }

/**
 * A barge-in fired. `spokeAfter` is whether the user actually went on to say
 * something — false means the interrupt was triggered by noise or by the
 * assistant's own echo, which is the failure that makes people give up
 * silently rather than complain.
 */
export function markBargeIn(spokeAfter = true) {
  if (!current) return
  current.bargeIns++
  if (!spokeAfter) current.bargeInFalsePositives++
}

export function endSession(reason = END_REASON.USER, now = Date.now()) {
  if (!current) return null
  current.endedAt = now
  current.endReason = reason
  const { _turnStart, _turnActive, _spoke, _usedTool, ...clean } = current
  finished.push(clean)
  if (finished.length > MAX_SESSIONS) finished.shift()
  current = null
  return clean
}

export function currentSession() { return current }
export function sessions() { return finished.slice() }
export function _resetLiveMetrics() {
  current = null
  finished.length = 0
  _resetReflexMetrics()
}

/* ── Reflex Prefetch instrumentation ────────────────────────────────────── */

let reflexMetrics = {
  triggered: 0,
  hits: 0,
  misses: 0,
  savedMsTotal: 0,
}

/**
 * Record a reflex prefetch event (triggered, hit or miss, and time saved in ms).
 * @param {{ hit?: boolean, savedMs?: number, tool?: string }} event
 */
export function recordReflexEvent({ hit = false, savedMs = 0, tool = '' } = {}) {
  reflexMetrics.triggered++
  if (hit) {
    reflexMetrics.hits++
    reflexMetrics.savedMsTotal += Math.max(0, savedMs)
  } else {
    reflexMetrics.misses++
  }
}

/**
 * Snapshot of reflex prefetch metrics.
 */
export function getReflexStats() {
  const hitRate = reflexMetrics.triggered > 0 ? reflexMetrics.hits / reflexMetrics.triggered : 0
  const avgSavedMs = reflexMetrics.hits > 0 ? Math.round(reflexMetrics.savedMsTotal / reflexMetrics.hits) : 0
  return {
    ...reflexMetrics,
    hitRate: round(hitRate) || 0,
    avgSavedMs,
  }
}

/** Reset reflex metrics (for tests). */
export function _resetReflexMetrics() {
  reflexMetrics = { triggered: 0, hits: 0, misses: 0, savedMsTotal: 0 }
}

/**
 * Record a latency observation and track SLO violations for the current session.
 * Called by LiveView after each first-word event.
 */
export function recordLatency(latencyMs, type = 'voice') {
  if (!current) return null
  current.lastLatencyMs = latencyMs
  const result = checkSLO(type, latencyMs)
  if (!result.ok) {
    current.sloViolations[type] = (current.sloViolations[type] || 0) + 1
    current.consecutiveSloBreaches++
  } else {
    current.consecutiveSloBreaches = 0
  }
  return { ...result, consecutiveBreaches: current.consecutiveSloBreaches, latencyMs }
}

/** True if the current session has had ≥N consecutive SLO violations. */
export function shouldSuggestTextFallback(threshold = 3) {
  return current ? current.consecutiveSloBreaches >= threshold : false
}

/* ── reporting ─────────────────────────────────────────────────────────── */

/** Nearest-rank percentile, matching telemetry.js so the two agree. */
export function percentile(values, p) {
  const v = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b)
  if (!v.length) return null
  const rank = Math.max(1, Math.ceil((p / 100) * v.length))
  return v[rank - 1]
}

/**
 * The six numbers from the roadmap, and nothing else.
 *
 * `over60s` and `turnsPerSession` are the pair that says whether Live is a demo
 * or a tool: a session under a minute did not work, and one turn is a demo
 * where five is a habit. `cameraOnRate` is the strategic one — if it is low,
 * Live is a voice app competing on latency, which is the race it cannot win.
 */
export function report(list = finished) {
  if (!list.length) return { sessions: 0, reflex: getReflexStats() }
  const durations = list.map(s => Math.max(0, (s.endedAt || s.startedAt) - s.startedAt) / 1000)
  const firstWords = list.flatMap(s => s.firstWordMs)
  const turns = list.reduce((a, s) => a + s.turns, 0)
  const bargeIns = list.reduce((a, s) => a + s.bargeIns, 0)
  const falsePos = list.reduce((a, s) => a + s.bargeInFalsePositives, 0)

  return {
    sessions: list.length,
    firstWordP50: percentile(firstWords, 50),
    firstWordP95: percentile(firstWords, 95),
    // A session under a minute did not work, whatever the user says.
    over60sRate: rate(list.filter(s => (s.endedAt - s.startedAt) >= 60_000).length, list.length),
    medianDurationSec: percentile(durations, 50),
    turnsPerSession: round(turns / list.length),
    // The strategic metric. Low camera use means the differentiator is unused.
    cameraOnRate: rate(list.filter(s => s.cameraOn).length, list.length),
    // Near-zero means the persona or the model is wrong — tools are the point.
    toolTurnRate: rate(list.reduce((a, s) => a + s.toolTurns, 0), turns),
    bargeInFalsePositiveRate: rate(falsePos, bargeIns),
    endReasons: list.reduce((acc, s) => {
      const k = s.endReason || 'unknown'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {}),
    reflex: getReflexStats(),
  }
}

const rate = (n, d) => (d ? round(n / d) : null)
const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null)
