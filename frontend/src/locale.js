/**
 * Where the user actually is, and what that implies.
 *
 * The app was locale-aware wherever the browser handed the answer over for free
 * — `Intl…resolvedOptions().timeZone` for the clock, `navigator.language` for
 * speech recognition — and hardcoded to the United States everywhere a value
 * had to be typed by hand: the date the model is told (`toLocaleDateString
 * ('en-US')`, three sites), the news search (`hl=en-US&gl=US`), and the crisis
 * helpline numbers. That split is not a policy; it is what happens when nobody
 * owns the question.
 *
 * This module owns it. PURE — every function takes what it needs, so the whole
 * thing is testable without a browser and none of it can silently read a global
 * at the wrong moment.
 */

/* ─────────────────────────────── resolution ────────────────────────────── */

export const DEFAULT_LOCALE = 'en-US'

/**
 * The user's locale tag. Preference first, then the browser.
 *
 * `navigator.languages` is ordered by preference and is the honest source;
 * `navigator.language` alone loses a user whose first choice is unavailable in
 * the UI but who still wants their own date format.
 */
export function resolveLocale({ override = null, nav = null } = {}) {
  if (override && typeof override === 'string' && override !== 'auto') return override
  const list = nav?.languages
  if (Array.isArray(list) && list.length && typeof list[0] === 'string') return list[0]
  if (typeof nav?.language === 'string' && nav.language) return nav.language
  return DEFAULT_LOCALE
}

/**
 * The ISO-3166 region, upper-cased. A bare language tag like `en` or `de` has
 * no region at all, which is most of the interesting cases, so fall back to
 * what the timezone implies rather than assuming the US.
 */
export function regionOf(locale, { timeZone = null } = {}) {
  try {
    const parts = String(locale || '').replace(/_/g, '-').split('-')
    // Skip the script subtag (`zh-Hant-TW`): a region is 2 letters or 3 digits.
    for (const p of parts.slice(1)) {
      if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase()
      if (/^\d{3}$/.test(p)) return p
    }
  } catch { /* fall through */ }
  return regionFromTimeZone(timeZone)
}

/**
 * A coarse region from an IANA zone. Deliberately small: it exists so a user
 * whose locale is plain `en` is not told to call an American helpline, not to
 * be a geolocation service. Unknown returns null, and every consumer must
 * behave sensibly with null.
 */
const ZONE_REGION = {
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Bucharest': 'RO', 'Europe/Budapest': 'HU',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH',
  'Asia/Bangkok': 'TH', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
  'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Buenos_Aires': 'AR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO', 'America/Santiago': 'CL',
  'America/Lima': 'PE',
}

export function regionFromTimeZone(timeZone) {
  const tz = String(timeZone || '')
  if (!tz) return null
  if (ZONE_REGION[tz]) return ZONE_REGION[tz]
  // Every US zone is America/<city> and there are dozens; listing the prefix is
  // honest where listing the cities would be a guess at coverage.
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Honolulu|Indiana|Kentucky|North_Dakota)/.test(tz)) return 'US'
  if (tz === 'Pacific/Honolulu') return 'US'
  return null
}

/** The IANA zone, which the browser has always answered correctly. */
export function resolveTimeZone({ override = null, intl = typeof Intl !== 'undefined' ? Intl : null } = {}) {
  if (override && override !== 'auto') return override
  try { return intl?.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/* ───────────────────────────── measurement ─────────────────────────────── */

/**
 * The three countries that do not use the metric system for everyday
 * measurement. Everyone else gets metric, which is the opposite of what the
 * weather tool did — it passed no unit parameters at all, so Open-Meteo's
 * metric defaults were served to Americans with no way to change them.
 */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM'])

/** Fahrenheit is used for weather in a slightly different set than full imperial. */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'LR'])

export function measurementSystem(region, { override = null } = {}) {
  if (override === 'metric' || override === 'imperial') return override
  return IMPERIAL_REGIONS.has(String(region || '').toUpperCase()) ? 'imperial' : 'metric'
}

/**
 * Weather units as Open-Meteo names. Kept separate from `measurementSystem`
 * because the UK is metric for distance and Celsius for weather but still
 * reports wind in mph — a single imperial/metric switch cannot express that.
 */
export function weatherUnits(region, { override = null } = {}) {
  const r = String(region || '').toUpperCase()
  if (override === 'metric') return { temperature: 'celsius', wind: 'kmh', precipitation: 'mm' }
  if (override === 'imperial') return { temperature: 'fahrenheit', wind: 'mph', precipitation: 'inch' }
  const temperature = FAHRENHEIT_REGIONS.has(r) ? 'fahrenheit' : 'celsius'
  const wind = (r === 'US' || r === 'GB' || r === 'LR' || r === 'MM') ? 'mph' : 'kmh'
  const precipitation = IMPERIAL_REGIONS.has(r) ? 'inch' : 'mm'
  return { temperature, wind, precipitation }
}

/** 'h12' or 'h23', from the locale itself rather than from a region guess. */
export function hourCycle(locale, { override = null } = {}) {
  if (override === '12' || override === 'h12') return 'h12'
  if (override === '24' || override === 'h23') return 'h23'
  try {
    const opts = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions()
    if (opts.hourCycle) return opts.hourCycle === 'h11' ? 'h12' : opts.hourCycle
    if (typeof opts.hour12 === 'boolean') return opts.hour12 ? 'h12' : 'h23'
  } catch { /* unsupported locale */ }
  return 'h12'
}

/* ─────────────────────────────── direction ─────────────────────────────── */

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb'])

export function textDirection(locale) {
  const lang = String(locale || '').replace(/_/g, '-').split('-')[0].toLowerCase()
  // Intl.Locale knows this properly where it exists; the set is the fallback.
  try {
    const info = new Intl.Locale(locale).getTextInfo?.() || new Intl.Locale(locale).textInfo
    if (info?.direction) return info.direction
  } catch { /* not supported here */ }
  return RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr'
}

/* ────────────────────────────── formatting ─────────────────────────────── */

/** A safe formatter: an invalid locale tag must not throw inside a prompt build. */
function fmt(locale, options) {
  try { return new Intl.DateTimeFormat(locale, options) }
  catch { return new Intl.DateTimeFormat(DEFAULT_LOCALE, options) }
}

export function formatDate(date, locale, { timeZone = undefined } = {}) {
  return fmt(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone }).format(date)
}

export function formatTime(date, locale, { timeZone = undefined, cycle = undefined } = {}) {
  return fmt(locale, {
    hour: 'numeric', minute: '2-digit', timeZone,
    hour12: cycle ? cycle === 'h12' : undefined,
  }).format(date)
}

/** The language name in English, for telling a model which language to use. */
export function languageName(locale) {
  try {
    const lang = String(locale).replace(/_/g, '-').split('-')[0]
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) || lang
  } catch { return String(locale || '').split('-')[0] || 'English' }
}

export function regionName(region) {
  if (!region) return null
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(region) || region }
  catch { return region }
}

/* ─────────────────────────── search regionalisation ────────────────────── */

/**
 * Google News RSS parameters. It was pinned to `hl=en-US&gl=US&ceid=US:en`, so
 * "what's in the news" returned American results in Mumbai, Berlin and Lagos
 * alike — the single most visibly wrong regional behaviour in the app.
 */
export function newsParams(locale, region) {
  const tag = String(locale || DEFAULT_LOCALE).replace(/_/g, '-')
  const lang = tag.split('-')[0].toLowerCase()
  const gl = String(region || regionOf(tag) || 'US').toUpperCase()
  // Google wants a full hl tag; `en` alone works, `en-US` is better when we
  // actually know the region.
  const hl = tag.includes('-') ? tag : `${lang}-${gl}`
  return { hl, gl, ceid: `${gl}:${lang}` }
}

/* ──────────────────────────────── snapshot ─────────────────────────────── */

/**
 * The user's explicit choices, if any.
 *
 * Held in a module variable rather than read from the database on demand
 * because localeSnapshot() is called SYNCHRONOUSLY while a system prompt is
 * being assembled, and an async read there would either block the turn or
 * silently return the default. App.jsx pushes prefs in whenever they change.
 */
let _overrides = {}

/** { locale, region, units, hourCycle, timeZone } — any subset; 'auto' clears one. */
export function setLocaleOverrides(next = {}) {
  const clean = {}
  for (const [k, v] of Object.entries(next)) {
    if (v && v !== 'auto') clean[k] = v
  }
  _overrides = clean
  return _overrides
}

export function getLocaleOverrides() { return _overrides }

/** Read the overrides out of a chat_prefs object. */
export function overridesFromPrefs(prefs = {}) {
  return {
    locale: prefs.locale_override || null,
    region: prefs.region_override || null,
    units: prefs.units_override || null,
    hourCycle: prefs.hour_cycle_override || null,
  }
}

/**
 * Everything at once, for the callers that want the whole picture (the system
 * prompt, the settings panel). Takes its inputs so tests can drive it.
 */
export function localeSnapshot({
  overrides = _overrides,
  nav = typeof navigator !== 'undefined' ? navigator : null,
} = {}) {
  const locale = resolveLocale({ override: overrides.locale, nav })
  const timeZone = resolveTimeZone({ override: overrides.timeZone })
  const region = String(overrides.region || '').toUpperCase() || regionOf(locale, { timeZone })
  return {
    locale,
    timeZone,
    region,
    regionLabel: regionName(region),
    language: languageName(locale),
    measurement: measurementSystem(region, { override: overrides.units }),
    weather: weatherUnits(region, { override: overrides.units }),
    hourCycle: hourCycle(locale, { override: overrides.hourCycle }),
    direction: textDirection(locale),
  }
}

/**
 * Put the locale on <html>, which is not cosmetic:
 *  - `lang` drives hyphenation, the spellchecker and every screen reader's
 *    pronunciation. Left at the build's default, an Arabic or German user is
 *    read aloud by a voice speaking English phonetics.
 *  - `dir` mirrors the whole layout for right-to-left scripts. Without it the
 *    app is not merely untranslated in Arabic or Hebrew, it is backwards.
 */
export function applyDocumentLocale(snapshot, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc?.documentElement) return null
  const L = snapshot || localeSnapshot()
  doc.documentElement.lang = L.locale
  doc.documentElement.dir = L.direction
  return L
}
