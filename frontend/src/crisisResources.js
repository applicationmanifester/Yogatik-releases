/**
 * Crisis resources, chosen by region.
 *
 * safety.js had three hardcoded lines: 988, a US eating-disorder helpline, and
 * "911 in the US". A user in Mumbai or Munich in genuine distress was handed a
 * number that does not connect. That is the one place in this app where "does
 * not adapt to the country" has consequences beyond mild annoyance.
 *
 * THE RULES THIS FILE FOLLOWS, in order of importance:
 *
 *  1. NEVER INVENT A NUMBER. A wrong helpline number given to someone in crisis
 *     is worse than no number, because they will dial it and be met with a dead
 *     line at the worst possible moment. Regions not in the table below get the
 *     international directory and a generic pointer to local emergency
 *     services — which is honest, and still actionable.
 *  2. findahelpline.com is ALWAYS included, whatever the region. It is a vetted
 *     directory covering 175+ countries, so it is correct for everyone,
 *     including the users this table does not name.
 *  3. Entries are verified, not remembered. Each carries the date it was
 *     checked. Helplines DO change — NEDA's US line was permanently
 *     disconnected and long outlived that in software that had memorised it.
 *
 * PURE: a lookup table and selectors, no imports, no DOM.
 */

/** When the numbers below were last checked against their operators' own sites. */
export const VERIFIED_AT = '2026-08-25'

/**
 * Emergency services numbers. These are far more stable than helplines and are
 * published by governments, but the table is still only regions I am confident
 * about — an unknown region says "your local emergency number" instead.
 */
const EMERGENCY = {
  US: '911', CA: '911', MX: '911',
  GB: '999 (or 112)', IE: '112 or 999',
  DE: '112', FR: '112', ES: '112', IT: '112', NL: '112', BE: '112', AT: '112', CH: '112',
  SE: '112', NO: '112', DK: '112', FI: '112', PL: '112', CZ: '112', PT: '112', GR: '112',
  RO: '112', HU: '112',
  IN: '112', PK: '15', BD: '999', LK: '119', NP: '100',
  AU: '000', NZ: '111',
  JP: '119 (ambulance) or 110 (police)', KR: '119', CN: '120 (ambulance) or 110 (police)',
  HK: '999', SG: '995', MY: '999', TH: '191', ID: '112', PH: '911',
  AE: '999', SA: '997', IL: '101', TR: '112',
  ZA: '10177 (or 112 from a mobile)', NG: '112', KE: '999 or 112', EG: '123',
  BR: '192 (ambulance) or 190 (police)', AR: '911', CL: '131', CO: '123', PE: '106',
}

/**
 * Named crisis lines. Small on purpose — see rule 1. Every one of these was
 * checked against its operator on the date above.
 */
const LINES = {
  US: {
    suicide: '988 (US Suicide & Crisis Lifeline — call or text)',
    eating: 'the National Alliance for Eating Disorders helpline, 1-866-662-1235',
  },
  CA: { suicide: '988 (Suicide Crisis Helpline — call or text)' },
  GB: { suicide: '116 123 (Samaritans, free, 24/7)', eating: 'Beat’s helpline, 0808 801 0677' },
  IE: { suicide: '116 123 (Samaritans, free, 24/7)' },
  IN: { suicide: '14416 or 1-800-891-4416 (Tele-MANAS, free, 24/7, 20+ languages)' },
  AU: { suicide: '13 11 14 (Lifeline, 24/7)', eating: 'the Butterfly Foundation, 1800 33 4673' },
  NZ: { suicide: '1737 (Need to Talk? — call or text, free, 24/7)' },
}

/**
 * 116 123 is an EU-reserved number for emotional-support helplines, but it is
 * NOT active in every member state, so it is offered as "may work" rather than
 * asserted — the directory stays the primary route for these regions.
 */
const EU_116_123 = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'GR', 'FI', 'PL', 'CZ', 'HU', 'RO', 'DK', 'SE'])

export const DIRECTORY = 'findahelpline.com'
const DIRECTORY_PHRASE = `find a verified helpline for your country at ${DIRECTORY}`

/**
 * Build the resource line for one crisis type in one region.
 *
 * @param {'self_harm'|'eating_disorder'|'violence'} type
 * @param {string|null} region  ISO-3166 alpha-2, or null when unknown
 */
export function crisisResource(type, region) {
  const r = String(region || '').toUpperCase()
  const local = LINES[r] || {}
  const emergency = EMERGENCY[r] || null

  if (type === 'eating_disorder') {
    const named = local.eating
    return [
      'For eating concerns you deserve support from someone trained in it.',
      named ? `In your area you can contact ${named}.` : null,
      `You can also ${DIRECTORY_PHRASE}.`,
      'You are not alone in this.',
    ].filter(Boolean).join(' ')
  }

  if (type === 'violence') {
    return [
      emergency
        ? `If someone is in immediate danger, call ${emergency}.`
        : 'If someone is in immediate danger, contact your local emergency services.',
      local.suicide
        ? `If you are having thoughts of hurting someone, talking to a crisis line can help right now — ${local.suicide}.`
        : `If you are having thoughts of hurting someone, talking to a crisis line can help right now — ${DIRECTORY_PHRASE}.`,
    ].join(' ')
  }

  // self_harm — the default, and the one that must never carry a wrong number.
  const named = local.suicide
    || (EU_116_123.has(r) ? '116 123, the European emotional-support number, which operates in many countries' : null)
  return [
    'If you are thinking about harming yourself, please reach out now:',
    named ? `call ${named},` : null,
    named ? `or ${DIRECTORY_PHRASE}.` : `${DIRECTORY_PHRASE}.`,
    emergency ? `In an emergency, call ${emergency}.` : null,
    'You deserve support from a real person.',
  ].filter(Boolean).join(' ')
}

/** True when we have a named line for this region — used only for testing/UI. */
export function hasLocalLine(type, region) {
  const key = type === 'eating_disorder' ? 'eating' : 'suicide'
  const r = String(region || '').toUpperCase()
  return !!(LINES[r]?.[key]) || (key === 'suicide' && EU_116_123.has(r))
}

export function emergencyNumber(region) {
  return EMERGENCY[String(region || '').toUpperCase()] || null
}

/** Regions with at least one named line. Exported so a test can enumerate them. */
export function coveredRegions() { return Object.keys(LINES) }
