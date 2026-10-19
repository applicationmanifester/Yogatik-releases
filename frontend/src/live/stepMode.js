/**
 * Step-by-step mode (Horizon 2 item 8) — the pure state machine.
 *
 * For repair, cooking, a lab bench: the model is asked how to do something,
 * its numbered reply becomes THE plan, and the user — hands busy, eyes on the
 * work — says "next" / "done" / "back" / "repeat" / "what's left". Rather than
 * trusting the model to remember where it was, the whole progress block is
 * rebuilt from THIS file and handed into the system prompt every turn (see
 * buildStepPrompt), so the model always holds the current step.
 *
 * Everything here is pure and imports NOTHING: plan extraction, command
 * recognition, step dispatch and prompt building are plain string functions.
 * The four parser variants, the five command words and the dispatch matrix
 * are exactly what makes this testable without a call, and the same machine
 * works for both engines — cascade interposes the words locally before they
 * reach the model, the sheaf strip's buttons drive the same events when the
 * realtime engine's voice is server-side and cannot be intercepted.
 */

/** A plan never feeds more than this into a prompt bound for a live call. */
export const MAX_STEPS = 12

/**
 * One plan line: "1. text" / "1) text", a markdown or typographic dash bullet
 * ("- text" / "— text" / "• text"), or an ordinal-word starter ("First, text",
 * "Then — text"). Group 1 carries the number, group 2 the ordinal word and
 * group 3 the item text.
 */
const ITEM_RE = /^[ \t]*(?:(\d{1,2})[).][.)]?[ \t]+|[-–—•][ \t]+|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|next|then|finally|lastly)\b[,:. \t-]+)(\S.*\S|\S)[ \t]*$/i

const TEXT_CLEANER = (s) => String(s).replace(/[*_`]+/g, '').replace(/[ \t]+/g, ' ').trim()

/**
 * Pull the plan out of a reply. Only a RUN of at least two list items counts —
 * a single "1." inside ordinary prose is punctuation, not a plan — and the
 * longest run wins. Blank lines do not close a run; any prose line does.
 *
 * @returns {{steps: string[], count: number, kind: 'numbered'|'dash'|'ordinal'} | null}
 */
export function extractPlan(text = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const runs = []
  let run = []
  let kinds = []
  for (const line of lines) {
    const m = ITEM_RE.exec(line)
    if (m) {
      const item = TEXT_CLEANER(m[3])
      if (item) {
        run.push(item)
        kinds.push(m[1] ? 'numbered' : m[2] ? 'ordinal' : 'dash')
      }
      continue
    }
    if (/^[ \t]*$/.test(line)) continue         // blank: a plan may breathe
    if (run.length) { runs.push({ run, kinds }); run = []; kinds = [] }
  }
  if (run.length) runs.push({ run, kinds })
  // Longest run — sub-notes under a numbered step form their own (short) run.
  const best = runs.reduce((a, b) => (b.run.length > (a?.run.length ?? 0) ? b : a), null)
  if (!best || best.run.length < 2) return null
  const steps = best.run.slice(0, MAX_STEPS)
  const majored = ['numbered', 'dash', 'ordinal']
    .map((k) => [k, best.kinds.filter(x => x === k).length])
    .sort((a, b) => b[1] - a[1])[0][0]
  return { steps, count: steps.length, kind: majored }
}

/**
 * Spoken commands, recognised on WORD BOUNDARIES anywhere in the utterance,
 * because a final transcript is a sentence: "okay, next one", "no that's what
 * I did — how much is left". Substring matching alone would hand "back" for
 * "backup"; boundaries stop that. Out-of-plan speech returns null and the
 * caller flows it to the model untouched.
 *
 * Order matters: overlapping phrases resolve to the LONGEST intent first
 * ("what's left" is a status ask even though it contains no step words, and
 * "what's next" is an advance even though it shares "what" with the asks).
 *
 * @returns {'next'|'done'|'repeat'|'back'|'remaining'|null}
 */
const REMAINING_RE = /\b(?:what'?s|what is) (?:left|remaining)|\bhow many (?:steps?|more) (?:do i have )?(?:left|remaining)|\bhow many more|\bhow far (?:along|in)|\bwhere are we\b/i
const BACK_RE = /\b(?:back|go back|previous|last step|step back|skip back)\b/i
const DONE_RE = /\b(?:all done|did it|finalised|finished|task complete|step complete|that'?s it|done)\b/i
const REPEAT_RE = /\b(?:come again|one more time|read (?:that|it) again|say (?:that|it) again|repeat)\b/i
const NEXT_RE = /\b(?:continue|go on|keep going|next step|onward|next)\b/i

export function recognizeStepCommand(text = '') {
  const t = String(text)
  const trimmed = t.trim()
  // A question-word prefix turns ANY step-word into a query, not a command.
  // "what about next", "when do I go next", "why is the next step" are questions.
  const looksLikeQuestion = /^(?:how|what|when|where|why|who)\b/i.test(trimmed)
  if (REMAINING_RE.test(t)) return 'remaining'
  if (BACK_RE.test(t)) return 'back'
  if (DONE_RE.test(t)) return looksLikeQuestion ? null : 'done'
  if (REPEAT_RE.test(t)) return 'repeat'
  if (NEXT_RE.test(t)) return looksLikeQuestion ? null : 'next'
  return null
}

/** The state the machine keeps while a plan is live: just where we are. */
export function createPlanState(plan) {
  const total = plan?.steps?.length || 0
  return { index: 0, total }
}

/**
 * Advance the machine. `used` says the word was one of OUR commands (the
 * caller swallowed it before the model heard it); for every recognised
 * command it is true — including clamped no-ops, because the user DID ask
 * — and the event says what the UI and the camera should do next:
 *
 *   advance   the step changed (index carried, step text attached)
 *   complete  the last step was marked done
 *   back      went back a step
 *   repeat    re-show current step (display only)
 *   remaining progress report ("step k of n, m left")
 *   noop      "next" on the last step or "back" on the first — no change
 *
 * An unrecognised command is a no-op: state untouched, used:false, event:null
 * — it was never one of ours, and the model saw it in the normal flow.
 */
export function dispatchStep(plan, state, cmd) {
  const steps = plan?.steps || []
  const total = steps.length
  const index = Math.min(Math.max(0, state?.index ?? 0), Math.max(0, total - 1))
  const here = { index, total }
  switch (cmd) {
    case 'next':
      if (index + 1 < total) {
        return { state: { ...here, index: index + 1 }, used: true, event: { type: 'advance', index: index + 1, step: steps[index + 1] } }
      }
      return { state: here, used: true, event: { type: 'noop', reason: 'last-step' } }
    case 'done':
      // "done" means "this step is finished" — the mark AND the advance in
      // one. On the last step it ends the plan instead of finding a next one.
      if (index >= total - 1) {
        return { state: here, used: true, event: { type: 'complete', index } }
      }
      return { state: { ...here, index: index + 1 }, used: true, event: { type: 'advance', index: index + 1, step: steps[index + 1] } }
    case 'back':
      if (index > 0) {
        return { state: { ...here, index: index - 1 }, used: true, event: { type: 'back', index: index - 1, step: steps[index - 1] } }
      }
      return { state: here, used: true, event: { type: 'noop', reason: 'first-step' } }
    case 'repeat':
      return { state: here, used: true, event: { type: 'repeat', index, step: steps[index] } }
    case 'remaining':
      return { state: here, used: true, event: { type: 'remaining', index, left: Math.max(0, total - 1 - index) } }
    default:
      return { state: here, used: false, event: null }
  }
}

/**
 * The plan, rebuilt as a system-prompt block. Injected before EVERY cascade
 * turn so the model holds the current step even when the advance happened
 * while it was mid-thought. Returns '' when there is no live plan — the
 * system prompt is then byte-identical to a call without step mode.
 */
export function buildStepPrompt(plan, { index = 0, writes = 0 } = {}) {
  const steps = plan?.steps || []
  const total = steps.length
  if (!total) return ''
  const i = Math.min(Math.max(0, Math.floor(index) || 0), total - 1)
  const w = Math.max(0, Math.min(i, Math.floor(writes) || 0))
  const lines = [
    'STEP-BY-STEP MODE — the app holds the plan locally; "next"/"done" advance it:',
    '- The user is following this with their hands busy. One short sentence per answer.',
    '- Talk about the CURRENT step unless they ask; never jump ahead or renumber.',
    '- If asked to plan something new, output the WHOLE numbered list ("1." lines, at most 12 steps) in one go so the app can join it.',
    '',
    `PLAN — step ${i + 1} of ${total}${w > 0 ? ` (${w} done)` : ''}`,
    `Current step ${i + 1}: ${steps[i]}`,
  ]
  const ahead = steps.slice(i + 1)
  if (ahead.length) {
    lines.push('Still to come (do not do these yet):')
    ahead.forEach((s, k) => lines.push(`${i + k + 2}. ${s}`))
  } else {
    lines.push('This is the last step — when they say "done", the plan is finished.')
  }
  return lines.join('\n')
}

/** One compact strip payload: k/n, the current step text, the voice hint. */
export function stepLabel(plan, index = 0) {
  const steps = plan?.steps || []
  const total = steps.length
  if (!total) return null
  const i = Math.min(Math.max(0, Math.floor(index) || 0), total - 1)
  return {
    k: i + 1,
    n: total,
    text: steps[i],
    hint: 'Say "next", "done", "back", "repeat" or "what\'s left"',
  }
}
