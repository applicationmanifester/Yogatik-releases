/**
 * Relentless Autonomous Rework Loop & Anti-Stagnation Engine
 * Tracks command/test execution history, computes error signature hashes,
 * detects repetitive stagnation, and constructs high-priority rework directives.
 */

/**
 * Creates an execution tracker instance.
 * @param {object} opts
 * @param {number} opts.stagnationThreshold - Number of consecutive identical errors to trigger pivot
 * @returns {object} Tracker state
 */
export function createExecutionTracker({ stagnationThreshold = 3 } = {}) {
  return {
    history: [],
    stagnationThreshold,
    consecutiveIdenticalErrors: 0,
    lastErrorHash: null,
  }
}

/**
 * Computes an integer hash from an error signature string.
 * @param {string} str
 * @returns {number}
 */
export function hashError(str) {
  let hash = 0
  const clean = String(str || '').replace(/\s+/g, ' ').trim()
  if (!clean) return 0
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i)
    hash |= 0
  }
  return hash
}

/**
 * Records an execution attempt outcome.
 * @param {object} tracker
 * @param {object} outcome
 * @param {string} outcome.action
 * @param {string} outcome.command
 * @param {string} outcome.error
 * @param {string} outcome.diagnostics
 * @param {number} outcome.exitCode
 */
export function recordExecutionOutcome(tracker, { action, command, error, diagnostics, exitCode }) {
  const isSuccess = exitCode === 0 && !error && !diagnostics
  const errSig = isSuccess ? '' : `${action}:${command || ''}:${error || diagnostics || ''}`
  const hash = hashError(errSig)

  if (hash !== 0 && tracker.lastErrorHash === hash) {
    tracker.consecutiveIdenticalErrors++
  } else {
    tracker.consecutiveIdenticalErrors = hash === 0 ? 0 : 1
    tracker.lastErrorHash = hash
  }

  tracker.history.push({
    action,
    command,
    error,
    diagnostics,
    exitCode,
    isSuccess,
    timestamp: Date.now(),
  })
}

/**
 * Checks whether the execution has stagnated.
 * @param {object} tracker
 * @returns {boolean}
 */
export function detectStagnation(tracker) {
  return tracker.consecutiveIdenticalErrors >= tracker.stagnationThreshold
}

/**
 * Constructs an autonomous rework directive to inject into the turn context.
 * @param {object} tracker
 * @param {object} options
 * @param {boolean} options.isStagnant
 * @returns {string} Directive message
 */
export function buildReworkFeedbackMessage(tracker, { isStagnant = false } = {}) {
  const last = tracker.history[tracker.history.length - 1]
  let directive = `[AUTONOMOUS REWORK DIRECTIVE]:\n` +
    `The previous execution did not succeed (exit code: ${last?.exitCode ?? 'failure'}).\n` +
    `Diagnostic output:\n${last?.diagnostics || last?.error || 'Execution failed'}\n\n`

  if (isStagnant) {
    directive += `⚠️ STAGNATION DETECTED: You have encountered this exact error multiple times. ` +
      `DO NOT repeat the previous edit or patch. Pivot your strategy: inspect the underlying architecture, ` +
      `read surrounding files, or use a cleaner, alternative implementation.\n\n`
  }

  directive += `Do NOT stop or ask permission. Proceed autonomously: inspect the faulty file(s), apply the fix, and re-run the verification.`
  return directive
}
