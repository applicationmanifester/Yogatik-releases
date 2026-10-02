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

  const errText = `${last?.diagnostics || ''}\n${last?.error || ''}`
  const commonFix = diagnoseCommonError(errText)
  if (commonFix) {
    directive += `💡 ROOT CAUSE INSIGHT: ${commonFix}\n\n`
  }

  directive += `Do NOT stop or ask permission. Proceed autonomously: inspect the faulty file(s), apply the fix, and re-run the verification.`
  return directive
}

/**
 * Maps common compiler/runtime errors to immediate, targeted architectural fixes.
 * @param {string} errorText
 * @returns {string|null}
 */
export function diagnoseCommonError(errorText = '') {
  const text = String(errorText || '')
  if (!text) return null

  if (/Cannot find module ['"]([^'"]+)['"]/i.test(text)) {
    const mod = text.match(/Cannot find module ['"]([^'"]+)['"]/i)?.[1] || 'module'
    return `Missing module "${mod}": Verify the import path relative to the file, check file extensions (.js vs .jsx vs .ts), or check package.json dependencies.`
  }
  if (/SyntaxError:\s*Unexpected token/i.test(text) || /Unexpected identifier/i.test(text)) {
    return 'Syntax Error: Check for unclosed brackets, missing commas in object literals, or JSX syntax inside a plain .js file.'
  }
  if (/ReferenceError:\s*(\w+)\s*is not defined/i.test(text)) {
    const sym = text.match(/ReferenceError:\s*(\w+)\s*is not defined/i)?.[1] || 'symbol'
    return `Reference Error: "${sym}" is not defined. Ensure it is imported or declared in the current file scope before use.`
  }
  if (/TypeError:\s*(\w+)\s*is not a function/i.test(text)) {
    const fn = text.match(/TypeError:\s*(\w+)\s*is not a function/i)?.[1] || 'target'
    return `Type Error: "${fn}" is not callable. Check default vs named exports (e.g. import { foo } vs import foo) and verify the exported object shape.`
  }
  if (/ENOENT:\s*no such file or directory/i.test(text)) {
    return 'File Not Found: The specified path does not exist. Use fs_find_files or fs_file_tree to verify the exact relative path in the workspace.'
  }
  return null
}

/**
 * Checks whether an agent is repeatedly reading the same target without performing actions.
 * @param {object} tracker
 * @param {string} action
 * @param {string} target
 * @returns {boolean}
 */
export function detectRepetitiveAction(tracker, action = '', target = '') {
  if (!tracker?.history || tracker.history.length < 3) return false
  const recent = tracker.history.slice(-3)
  return recent.every(h => h.action === action && (h.command === target || h.target === target))
}

/**
 * Constructs a structured momentum checkpoint message to maintain focus across multi-turn plans.
 * @param {object} opts
 * @param {number} opts.step
 * @param {number} [opts.totalSteps]
 * @param {string} opts.summary
 * @returns {string}
 */
export function buildAutonomousMomentumDirective({ step = 1, totalSteps = null, summary = '' } = {}) {
  const progressStr = totalSteps ? `Step ${step}/${totalSteps}` : `Step ${step}`
  return `[AUTONOMOUS MOMENTUM DIRECTIVE - ${progressStr}]:\n` +
    `Checkpoint reached: ${summary || 'Previous step complete.'}\n` +
    `Proceed immediately to the next action without pausing or asking confirmation.`
}

