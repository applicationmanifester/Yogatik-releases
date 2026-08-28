/**
 * On-device safety layer for companion use. Pure and testable — no network, no
 * model call — so it runs before every turn with zero latency and works offline.
 *
 * Two jobs:
 *  1) CRISIS detection (self-harm, suicidal ideation, disordered eating, violence)
 *     → surface region-appropriate resources + a non-judgmental system directive.
 *     Deliberately high-recall (better a false positive than a missed crisis) and
 *     paired with a soft UI, never a hard block.
 *  2) BOUNDARY detection (medical / legal / financial advice sought from a
 *     companion) → inject role-clarity so the model helps without impersonating a
 *     professional. Friend ≠ therapist/doctor/lawyer.
 *
 * This is a screening heuristic, not a classifier — it feeds the system prompt
 * and the UI; the model still does the actual, careful responding. Resource text
 * follows the codebase's documented posture (e.g. the National Alliance for
 * Eating Disorders, not NEDA which is disconnected).
 */

import { crisisResource } from './crisisResources'

const CRISIS_PATTERNS = [
  { type: 'self_harm', re: /\b(kill myself|end my life|suicid(e|al)|want to die|not want(ing)? to (be here|live)|take my (own )?life|hurt myself|harm myself|self[- ]harm|cut(ting)? myself)\b/i },
  // "purge" and "purging" used to match bare. They are everyday technical
  // words — purge the cache, purge the database, git purge, a branch called
  // backup-before-purge — so a developer asking a build question was shown an
  // eating-disorder helpline. That is not merely noise: a card that fires on
  // ordinary vocabulary teaches people to dismiss it, so the real crisis it
  // exists for gets dismissed too. High recall still, but anchored to a person
  // talking about themselves rather than a verb applied to data.
  // "purge"/"purging" matched bare, so "purge the CDN cache", "git purge" and a
  // branch named backup-before-purge all raised an eating-disorder helpline.
  // Anchoring on "I purge" is not enough either — "how do I purge the cache"
  // contains it. It now needs real context: purging AFTER A MEAL, or purging
  // ONESELF. Everything not about the verb "purge" is untouched, so
  // make-myself-throw-up, starving myself, not eaten in days, anorexia and
  // bulimia still match on their own.
  //
  // This trades a little recall (a bare "I've been purging" no longer fires)
  // for not crying wolf on everyday technical vocabulary — a card that fires on
  // routine words teaches the user to dismiss it, which costs precisely the
  // moment it exists for. The model's own careful response is unaffected either
  // way; this governs the resource card.
  { type: 'eating_disorder', re: /\b(purg(e|ed|ing) after (eating|meals?|food|dinner|lunch)|purg(e|ed|ing) myself|mak(e|ing) myself (throw up|vomit)|starv(e|ing) myself|not eaten? in (days|a week)|hate my body and (won'?t|can'?t) eat|anorexi|bulimi)\b/i },
  { type: 'violence', re: /\b(kill (him|her|them|someone)|hurt (someone|people)|shoot up|make (a |them )?(bomb|explosive)|plan(ning)? to attack)\b/i },
]

const BOUNDARY_PATTERNS = [
  { domain: 'medical', re: /\b(diagnos(e|is)|should i take|is it safe to (take|mix)|what('?s| is) wrong with me|my (symptoms?|rash|chest pain|dosage)|prescrib)\b/i },
  { domain: 'legal', re: /\b(sue|lawsuit|is it legal|legally (binding|required)|my rights as|contract says|will i go to (jail|prison))\b/i },
  { domain: 'financial', re: /\b(should i (buy|sell|invest)|which stock|is .* a good investment|put my savings|trade options|crypto to buy)\b/i },
]

// Resources come from crisisResources.js, chosen by REGION. They used to be
// three hardcoded American lines — 988, a US eating-disorder helpline, "911 in
// the US" — handed to every user on earth. Someone in genuine distress in
// Mumbai or Munich was given a number that does not connect, at the worst
// possible moment.

const BOUNDARY_DIRECTIVES = {
  medical:
    'The user is asking for medical guidance. You are a supportive companion, NOT a doctor. Share general, well-established information, encourage consulting a licensed clinician, and never diagnose or recommend specific dosages.',
  legal:
    'The user is asking for legal guidance. You are NOT a lawyer. Give general information only, note that laws vary by jurisdiction, and recommend a licensed attorney for their specific situation.',
  financial:
    'The user is asking for financial/investment guidance. You are NOT a financial advisor. Provide neutral factual context, avoid specific buy/sell recommendations, and suggest a qualified professional.',
}

/**
 * Assess a user message. Returns a structured verdict:
 * { crisis: {type, resource} | null, boundary: {domain, directive} | null,
 *   systemDirective: string, hasConcern: boolean }
 */
export function assessSafety(text, { region = null } = {}) {
  const s = String(text || '')
  let crisis = null
  for (const p of CRISIS_PATTERNS) {
    if (p.re.test(s)) { crisis = { type: p.type, region, resource: crisisResource(p.type, region) }; break }
  }
  let boundary = null
  for (const p of BOUNDARY_PATTERNS) {
    if (p.re.test(s)) { boundary = { domain: p.domain, directive: BOUNDARY_DIRECTIVES[p.domain] }; break }
  }

  const parts = []
  if (crisis) {
    parts.push(
      'SAFETY — the user may be in distress (' + crisis.type + '). Respond with warmth and without judgment. ' +
      'Do not lecture, do not provide any means or methods, and gently share this resource verbatim: "' +
      crisis.resource + '" Prioritise their emotional safety over any other task.',
    )
  }
  if (boundary) parts.push(boundary.directive)

  return {
    crisis,
    boundary,
    hasConcern: !!(crisis || boundary),
    systemDirective: parts.length ? '\n\n' + parts.join('\n\n') : '',
  }
}

/** UI-facing resource card payload for a crisis verdict (or null). */
export function crisisResourceCard(verdict) {
  if (!verdict?.crisis) return null
  return {
    type: verdict.crisis.type,
    title: 'You deserve support',
    body: verdict.crisis.resource,
  }
}
