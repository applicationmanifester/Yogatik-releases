/**
 * When the companion should think, and when it has earned the right to speak.
 *
 * "Always be thinking about what the user needs" is easy to say and expensive
 * to get wrong: every observation is a real LLM call, and an assistant that
 * interrupts on a hunch is one the user closes. So the policy is split in two —
 * noticing is free and frequent, speaking is rare and must clear several gates.
 *
 * Pure and clock-injected, because the interesting cases are all about time and
 * would otherwise be untestable.
 */

/** Context is sampled this often. Cheap: a window title, no model involved. */
export const OBSERVE_INTERVAL_MS = 20000
/** Minimum gap between two unprompted messages, however much changes. */
export const SPEAK_COOLDOWN_MS = 120000
/** Hard ceiling per session, so a busy day cannot become a chat wall. */
export const MAX_PROACTIVE_PER_SESSION = 12
/** A context must hold still this long before it is worth commenting on. */
export const SETTLE_MS = 6000

/**
 * Has the user genuinely moved to something else?
 *
 * Window titles churn constantly — an unsaved-dot, a line:column readout, a
 * tab's unread count. Treating those as "new context" would fire on every
 * keystroke, so the app must change, or the title must change substantially.
 */
export function contextChanged(prev, next) {
  if (!next?.appName && !next?.title) return false
  if (!prev) return true
  if ((prev.appName || '') !== (next.appName || '')) return true

  const a = normaliseTitle(prev.title)
  const b = normaliseTitle(next.title)
  if (a === b) return false
  // Same document, cosmetic churn: one is a prefix of the other, or they differ
  // only by a leading marker.
  if (a.startsWith(b) || b.startsWith(a)) return false
  return true
}

function normaliseTitle(t) {
  return String(t || '')
    .replace(/^[•*●]\s*/, '')          // unsaved-changes markers
    .replace(/\(\d+\)\s*/g, '')        // unread counts
    .replace(/\b\d+[:,]\d+\b/g, '')    // line:column readouts
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Is it even worth sampling? Cheap gate, run on a timer.
 */
export function shouldObserve({ enabled, open, streaming, now, lastObservedAt }) {
  if (!enabled || !open) return false
  if (streaming) return false                       // it is already talking
  if (!lastObservedAt) return true
  return now - lastObservedAt >= OBSERVE_INTERVAL_MS
}

/**
 * The expensive gate. Every `false` here is a call not made and an
 * interruption not inflicted.
 */
export function shouldSpeak({
  changed, settledMs, streaming, userTyping, now,
  lastSpokeAt, spokenCount, maxPerSession = MAX_PROACTIVE_PER_SESSION,
}) {
  if (!changed) return false
  if (streaming) return false
  // Mid-sentence in the composer means they are already asking something; an
  // unprompted message would land on top of their own thought.
  if (userTyping) return false
  // Do not narrate a flick through five windows — wait for them to land.
  if (settledMs < SETTLE_MS) return false
  if (spokenCount >= maxPerSession) return false
  if (lastSpokeAt && now - lastSpokeAt < SPEAK_COOLDOWN_MS) return false
  return true
}

/**
 * The prompt for an unprompted turn.
 *
 * Explicitly licenses silence. Without that, a model asked "what does the user
 * need?" always finds something to say, which is precisely the failure mode —
 * a companion that comments on everything gets muted.
 */
export function buildObservationPrompt(ctx = {}) {
  const where = [ctx.appName, ctx.title].filter(Boolean).join(' — ') || 'an unknown window'
  return [
    `[Ambient check — the user did not ask anything. They are now in: ${where}.]`,
    '',
    'Look at the screen. If there is something genuinely useful you can say in',
    'one or two sentences — an error you can fix, a risk you can flag, a next',
    'step that is obviously needed — say only that, briefly.',
    '',
    'If there is nothing genuinely useful, reply with exactly: SILENT',
    'Do not greet, do not summarise what they are doing back at them, and do not',
    'offer help in the abstract. Silence is the correct answer most of the time.',
  ].join('\n')
}

/** The model's opt-out. Anything that is really a decline should not be shown. */
export function isSilentReply(text = '') {
  const t = String(text).trim()
  if (!t) return true
  if (/^silent[.!]?$/i.test(t)) return true
  // Models often wrap the sentinel in politeness despite instructions.
  return /^\W*silent\W*$/i.test(t)
}

/** Minimum interval between offering silent proactive action chips. */
export const CHIPS_COOLDOWN_MS = 45000

/**
 * Optical screen diffing: checks if perceptual hash difference exceeds threshold.
 * Prevents re-analyzing static screens or subtle font smoothing differences.
 */
export function screenHashDiffers(hashA, hashB, threshold = 0.08) {
  if (!hashA || !hashB) return Boolean(hashA || hashB)
  if (hashA === hashB) return false

  // Compute normalized Hamming distance between hex string hashes
  let diffCount = 0
  const maxLen = Math.max(hashA.length, hashB.length)
  for (let i = 0; i < maxLen; i++) {
    if (hashA[i] !== hashB[i]) diffCount++
  }

  const distance = diffCount / maxLen
  return distance >= threshold
}

/**
 * Decides whether to silently surface non-intrusive action chips without speaking
 */
export function shouldOfferChips({
  screenChanged = false,
  userIdleMs = 0,
  lastChipsAt = null,
  now = Date.now(),
  cooldownMs = CHIPS_COOLDOWN_MS,
  minIdleMs = 2500,
} = {}) {
  if (!screenChanged) return false
  if (userIdleMs < minIdleMs) return false
  if (lastChipsAt && now - lastChipsAt < cooldownMs) return false
  return true
}

/**
 * Generate contextual 1-click action chips based on detected screen/window state
 */
export function generateProactiveActionChips(context = {}) {
  const chips = []
  const text = String(context.screenText || context.title || '').toLowerCase()
  const app = String(context.appName || '').toLowerCase()

  // 1. Code debugging & compiler errors
  if (
    /typeerror|syntaxerror|referenceerror|fatal|exception|failed with exit code|err!/i.test(text) ||
    app.includes('code') ||
    app.includes('terminal')
  ) {
    if (/error|failed|exception/i.test(text)) {
      chips.push({
        id: 'chip_fix_error',
        label: 'Fix Detected Error',
        action: 'diagnose_error',
        prompt: 'Analyze the error displayed on screen, identify the root cause, and apply the minimal correct fix.',
        priority: 'high',
      })
    }
    chips.push({
      id: 'chip_run_tests',
      label: 'Run Test Suite',
      action: 'run_tests',
      prompt: 'Run the project test suite and verify all unit tests pass.',
      priority: 'medium',
    })
  }

  // 2. Legal / contract review
  if (/agreement|contract|nda|terms|clause|confidentiality/i.test(text)) {
    chips.push({
      id: 'chip_summarize_risks',
      label: 'Audit Contract Risks',
      action: 'audit_contract',
      prompt: 'Review this document for unusual indemnities, governing law, and non-standard liabilities.',
      priority: 'high',
    })
  }

  // 3. Web browser research & synthesis
  if (app.includes('chrome') || app.includes('edge') || app.includes('browser') || app.includes('firefox')) {
    chips.push({
      id: 'chip_summarize_page',
      label: 'Summarize Key Takeaways',
      action: 'summarize',
      prompt: 'Provide a 3-bullet executive summary of the content currently on screen.',
      priority: 'low',
    })
  }

  // Always capped at 3 chips to prevent visual clutter
  return chips.slice(0, 3)
}

