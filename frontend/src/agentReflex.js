/**
 * Reflex Prefetch — speculative execution for the agent loop.
 *
 * This codebase already does two related things: agent.js's `seenCalls` /
 * `callSignature` dedupe an identical tool call within one turn, and
 * tools/index.js's `prioritizeToolSchemas` does fast, non-LLM keyword scoring
 * to decide which tool schemas the model even sees. This module is the same
 * idea taken one step further — for a SMALL, deliberately conservative
 * whitelist of tools that are read-only, idempotent and side-effect-free, a
 * fully-derivable call is detected straight from the raw user message with
 * enough confidence to start running BEFORE the model has decided anything,
 * in parallel with the model's own first inference call rather than instead
 * of it. If the model's real tool call ends up matching, the round loop in
 * agent.js awaits the already-in-flight result instead of paying for it
 * twice; if it doesn't match, the promise below is simply never awaited by
 * anyone and its result is discarded.
 *
 * This is not an "instant decision" and it is not a guess dressed up as one.
 * Every detector below either extracts a value it is fully confident in — an
 * explicit unit pair, a clean numeric expression, an explicitly named place,
 * a resolvable known city, a plainly worded "translate X to <language>" — or
 * returns null. Nothing here invents a location, assumes a unit, or guesses
 * a timezone: a miss costs nothing (the model still decides normally; the
 * speculative promise, if any, is simply never consulted), so there is no
 * incentive to be clever and every incentive to be exact.
 *
 * Kept pure (no `window`, no DOM, no import of the tool registry or
 * `executeTool`) so it is testable without Electron or jsdom, the same split
 * this codebase already uses for browserTree.cjs and rootsCore.cjs. agent.js
 * is the only caller — it is the one place that knows how to actually run a
 * tool and what the permission/gate rules are.
 */

// Deliberately excludes anything with a side effect (fs_*, terminal_*,
// browser_control, memory writes, purchases, sends, anything that touches
// the OS) and anything whose own pre-emptive fast-path already exists
// elsewhere in agent.js (web_search / social_search — see
// isRealtimeOrSearchQuery / isSocialQuery). A tool belongs on this list only
// if running it twice, running it for nothing, or running it on a wrong
// guess is completely harmless — no popup, no permission prompt, no network
// side effect beyond a read.
export const REFLEX_WHITELIST = Object.freeze(['unit_convert', 'calculator', 'weather', 'timezone', 'translate'])

const MAX_MESSAGE_LEN = 300

// ---------------------------------------------------------------------------
// unit_convert — "5 km to miles", "100 f in c", "10kg into lb"
// ---------------------------------------------------------------------------
const UNIT_ALIASES = {
  km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  mi: 'mi', mile: 'mi', miles: 'mi',
  ft: 'ft', foot: 'ft', feet: 'ft',
  cm: 'cm',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  mg: 'mg',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
  qt: 'qt',
  c: 'c', celsius: 'c',
  f: 'f', fahrenheit: 'f',
  k: 'k', kelvin: 'k',
}

const UNIT_RE = /(-?\d+(?:\.\d+)?)\s*°?([a-z]+)\s+(?:to|into|in)\s+°?([a-z]+)\b/i

function detectUnitConvert(message) {
  const m = UNIT_RE.exec(message)
  if (!m) return null
  const value = Number(m[1])
  const from = UNIT_ALIASES[m[2].toLowerCase()]
  const to = UNIT_ALIASES[m[3].toLowerCase()]
  if (!Number.isFinite(value) || !from || !to || from === to) return null
  return { name: 'unit_convert', args: { value, from, to } }
}

// ---------------------------------------------------------------------------
// calculator — "what is 12 * (7+3)", "calculate 45/9-2", "compute sqrt(144)"
// ---------------------------------------------------------------------------
// Mirrors calculator.js's own whitelist of function/constant names — kept as
// a separate, smaller copy on purpose: this only needs to recognise a SAFE
// shape, never to evaluate it. The real tool is the sole authority on
// whether the expression is actually valid; a detector false-positive just
// means the real, harmless tool returns success:false a moment sooner.
const CALC_WORDS = 'sqrt|cbrt|abs|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|ln|log10|log2|log|exp|pow|hypot|ceil|floor|round|trunc|sign|min|max|fact|pi|e|tau'
const CALC_TRIGGER = /^(?:what(?:'s| is)|calc(?:ulate)?|compute|evaluate|solve(?: for)?)\b[:\s]+(.+?)\s*\??$/i
const CALC_SAFE_CHARS = new RegExp(`^(?:\\s|\\d|[+\\-*/%^().,]|${CALC_WORDS})+$`, 'i')

function detectCalculator(message) {
  const m = CALC_TRIGGER.exec(message.trim())
  if (!m) return null
  const expr = m[1].trim()
  if (!expr || expr.length > 120) return null
  if (!/\d/.test(expr)) return null
  if (!CALC_SAFE_CHARS.test(expr)) return null
  return { name: 'calculator', args: { expression: expr } }
}

// ---------------------------------------------------------------------------
// weather — "weather in Tokyo", "forecast for Paris", "temperature at Delhi"
// ---------------------------------------------------------------------------
// Deliberately requires an EXPLICIT place. "weather" / "weather here" /
// "weather today" with no named place would resolve to device GPS in the
// real tool — firing that speculatively would pop a geolocation permission
// prompt before the model has even been asked, which is the one kind of
// surprise this feature exists to never cause.
const WEATHER_RE = /\b(?:weather|forecast|temperature)\b.*?\b(?:in|for|at)\s+([a-z][a-z .'-]{1,40}?)\s*\??$/i
const WEATHER_STOPWORDS = /^(?:the|current|here|today|now|there|this|my|our)$/i

function detectWeather(message) {
  const m = WEATHER_RE.exec(message.trim())
  if (!m) return null
  const location = m[1].trim().replace(/[.?!]+$/, '')
  if (!location || WEATHER_STOPWORDS.test(location)) return null
  return { name: 'weather', args: { location } }
}

// ---------------------------------------------------------------------------
// timezone — "what time is it in Tokyo", "current time in London"
// ---------------------------------------------------------------------------
// A small, explicitly non-exhaustive city -> IANA zone map. Unlike weather
// (which accepts any place name — Open-Meteo geocodes it) the timezone tool
// needs a real IANA identifier, so a city this map does not know simply
// yields no reflex candidate rather than a guess.
const CITY_TZ = {
  'new york': 'America/New_York', nyc: 'America/New_York', 'new york city': 'America/New_York',
  'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', chicago: 'America/Chicago',
  toronto: 'America/Toronto', vancouver: 'America/Vancouver',
  'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  madrid: 'Europe/Madrid', rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam',
  moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul', zurich: 'Europe/Zurich',
  dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon', athens: 'Europe/Athens',
  dubai: 'Asia/Dubai', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata',
  kolkata: 'Asia/Kolkata', chennai: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata',
  pune: 'Asia/Kolkata', india: 'Asia/Kolkata',
  tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo', beijing: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai', 'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore',
  seoul: 'Asia/Seoul', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta',
  manila: 'Asia/Manila', karachi: 'Asia/Karachi',
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne',
  perth: 'Australia/Perth', brisbane: 'Australia/Brisbane',
  auckland: 'Pacific/Auckland',
  cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', 'cape town': 'Africa/Johannesburg',
  johannesburg: 'Africa/Johannesburg', nairobi: 'Africa/Nairobi',
  utc: 'UTC', gmt: 'UTC',
}

const TZ_RE = /\b(?:what(?:'s| is)? the time|current time|the time|time)\b(?: is it)?\s+in\s+([a-z][a-z .'-]{1,30}?)\s*\??$/i

function detectTimezone(message) {
  const m = TZ_RE.exec(message.trim())
  if (!m) return null
  const key = m[1].trim().toLowerCase().replace(/[.?!]+$/, '')
  const zone = CITY_TZ[key]
  if (!zone) return null
  return { name: 'timezone', args: { to: [zone] } }
}

// ---------------------------------------------------------------------------
// translate — "translate 'hello' to spanish", "translate good morning into french"
// ---------------------------------------------------------------------------
// A small subset of translate.js's own LANG_MAP. Only the literal
// "translate ... to/into <known language word>" phrasing is recognised —
// "how do you say X in Y" and similar are deliberately left to the model,
// not guessed at.
const LANG_WORDS = {
  spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
  japanese: 'ja', chinese: 'zh', mandarin: 'zh', hindi: 'hi', korean: 'ko',
  russian: 'ru', arabic: 'ar', dutch: 'nl', polish: 'pl', turkish: 'tr',
  vietnamese: 'vi', greek: 'el', swedish: 'sv', czech: 'cs', romanian: 'ro',
  danish: 'da', finnish: 'fi', hungarian: 'hu', indonesian: 'id', thai: 'th',
  ukrainian: 'uk', hebrew: 'he', bengali: 'bn', urdu: 'ur', tamil: 'ta', telugu: 'te',
}

const TRANSLATE_RE = /^translate\s+["“']?(.+?)["”']?\s+(?:to|into)\s+([a-z]+)\s*\??$/i

function detectTranslate(message) {
  const m = TRANSLATE_RE.exec(message.trim())
  if (!m) return null
  const text = m[1].trim()
  const target = LANG_WORDS[m[2].trim().toLowerCase()]
  if (!text || text.length > 300 || !target) return null
  return { name: 'translate', args: { text, target } }
}

// Priority order — the cheapest/least ambiguous first. A message very rarely
// matches more than one; only the first hit is returned, since one
// speculative call is the whole point (one wasted cheap call is harmless;
// racing several against each other adds cost and complexity for no
// measurable benefit at this whitelist's size).
const DETECTORS = [detectUnitConvert, detectCalculator, detectWeather, detectTimezone, detectTranslate]

/**
 * Detect a fully-confident, side-effect-free tool call from a raw user
 * message, or return null. Never throws — a detector bug must degrade to
 * "no reflex fired", not break the turn it was trying to speed up.
 */
export function detectReflexCandidate(userMessage) {
  if (typeof userMessage !== 'string') return null
  const trimmed = userMessage.trim()
  if (!trimmed || trimmed.length > MAX_MESSAGE_LEN) return null
  for (const detect of DETECTORS) {
    try {
      const hit = detect(trimmed)
      if (hit) return hit
    } catch { /* a detector must never break the turn it is trying to speed up */ }
  }
  return null
}
