/**
 * More open, keyless tools — pure-client utilities that can never fail on a
 * network, plus two well-known CORS-friendly, no-key APIs (Datamuse, REST
 * Countries) routed through the shared proxy for resilience.
 *
 *   uuid / password_generate / number_base / cron_next / timezone   pure client
 *   thesaurus            Datamuse (api.datamuse.com)   keyless, CORS
 *   country_info         REST Countries (restcountries.com) keyless, CORS
 */

import { proxyJson } from './http'

// ─── UUID / IDs (pure client) ────────────────────────────────────────────────
export const uuidTool = {
  schema: {
    description: 'Generate random UUID v4 identifiers (RFC 4122). Optionally several at once.',
    parameters: {
      type: 'object',
      properties: { count: { type: 'number', description: 'How many to generate (1–100, default 1).' } },
      required: [],
    },
  },
  async execute({ count = 1 } = {}) {
    const n = Math.max(1, Math.min(100, Math.floor(count) || 1))
    const gen = () => (crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (crypto.getRandomValues(new Uint8Array(1))[0]) % 16
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
        }))
    const ids = Array.from({ length: n }, gen)
    return { success: true, tool: 'uuid', count: n, ids, result: ids.join('\n') }
  },
}

// ─── Password / passphrase (pure client) ─────────────────────────────────────
export const passwordTool = {
  schema: {
    description: 'Generate a strong random password or passphrase with a rough entropy/strength estimate.',
    parameters: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Password length (default 20).' },
        words: { type: 'number', description: 'If set, make a passphrase of this many words instead.' },
        symbols: { type: 'boolean', description: 'Include symbols in a password (default true).' },
      },
      required: [],
    },
  },
  async execute({ length = 20, words = 0, symbols = true } = {}) {
    const rand = (max) => crypto.getRandomValues(new Uint32Array(1))[0] % max
    const WL = 'correct horse battery staple orbit velvet lantern maple cipher tundra falcon ember quartz nimbus cobalt harbor meadow zephyr thistle onyx pixel saffron cinder willow'.split(' ')
    let value, poolSize
    if (words && words > 0) {
      const w = Math.max(3, Math.min(12, Math.floor(words)))
      value = Array.from({ length: w }, () => WL[rand(WL.length)]).join('-')
      poolSize = WL.length ** w
    } else {
      const L = Math.max(6, Math.min(128, Math.floor(length)))
      let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      if (symbols) chars += '!@#$%^&*()-_=+[]{};:,.?'
      value = Array.from({ length: L }, () => chars[rand(chars.length)]).join('')
      poolSize = chars.length ** L
    }
    const bits = Math.round(Math.log2(poolSize))
    const strength = bits < 50 ? 'weak' : bits < 80 ? 'good' : bits < 120 ? 'strong' : 'very strong'
    return { success: true, tool: 'password_generate', value, entropy_bits: bits, strength, result: value }
  },
}

// ─── Number base conversion (pure client) ────────────────────────────────────
export const numberBaseTool = {
  schema: {
    description: 'Convert an integer between bases (2–36). Shows binary, octal, decimal and hex plus any target base.',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'string', description: 'The number, e.g. "255", "0xFF", "0b1010".' },
        from_base: { type: 'number', description: 'Base of the input (2–36). Auto-detected for 0x/0b prefixes.' },
        to_base: { type: 'number', description: 'Optional extra target base (2–36).' },
      },
      required: ['value'],
    },
  },
  async execute({ value, from_base, to_base } = {}) {
    if (value == null) return { success: false, error: 'value is required' }
    let s = String(value).trim().toLowerCase()
    let base = from_base
    if (/^0x/.test(s)) { s = s.slice(2); base = 16 }
    else if (/^0b/.test(s)) { s = s.slice(2); base = 2 }
    else if (/^0o/.test(s)) { s = s.slice(2); base = 8 }
    base = base || 10
    if (base < 2 || base > 36) return { success: false, error: 'from_base must be 2–36' }
    const n = parseInt(s, base)
    if (Number.isNaN(n)) return { success: false, error: `"${value}" is not a valid base-${base} integer` }
    const out = { binary: n.toString(2), octal: n.toString(8), decimal: n.toString(10), hex: n.toString(16).toUpperCase() }
    if (to_base && to_base >= 2 && to_base <= 36) out[`base${to_base}`] = n.toString(to_base)
    return { success: true, tool: 'number_base', input: String(value), from_base: base, ...out, result: JSON.stringify(out) }
  },
}

// ─── Cron next run times (pure client) ───────────────────────────────────────
function cronField(expr, min, max) {
  const set = new Set()
  for (const part of String(expr).split(',')) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!m) throw new Error(`bad cron field: ${part}`)
    const step = m[3] ? +m[3] : 1
    const lo = m[1] === '*' ? min : +m[1]
    const hi = m[2] ? +m[2] : (m[1] === '*' ? max : (m[3] ? max : +m[1]))
    for (let v = lo; v <= hi; v += step) if (v >= min && v <= max) set.add(v)
  }
  return set
}
export const cronTool = {
  schema: {
    description: 'Parse a 5-field cron expression (min hour day-of-month month day-of-week) and list its next run times.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'e.g. "0 9 * * 1-5" (weekdays 9am).' },
        count: { type: 'number', description: 'How many upcoming runs to list (default 5, max 20).' },
      },
      required: ['expression'],
    },
  },
  async execute({ expression, count = 5 } = {}) {
    if (!expression) return { success: false, error: 'expression is required' }
    const f = String(expression).trim().split(/\s+/)
    if (f.length !== 5) return { success: false, error: 'expected 5 fields: min hour dom month dow' }
    let mins, hrs, doms, mons, dows
    try {
      mins = cronField(f[0], 0, 59); hrs = cronField(f[1], 0, 23)
      doms = cronField(f[2], 1, 31); mons = cronField(f[3], 1, 12); dows = cronField(f[4], 0, 6)
    } catch (e) { return { success: false, error: e.message } }
    const n = Math.max(1, Math.min(20, Math.floor(count) || 5))
    const runs = []
    const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1)
    for (let i = 0; i < 527040 && runs.length < n; i++) { // scan up to ~1 year of minutes
      if (mins.has(d.getMinutes()) && hrs.has(d.getHours()) && mons.has(d.getMonth() + 1) &&
          doms.has(d.getDate()) && dows.has(d.getDay())) {
        runs.push(d.toLocaleString())
      }
      d.setMinutes(d.getMinutes() + 1)
    }
    if (!runs.length) return { success: false, error: 'no runs found within the next year' }
    return { success: true, tool: 'cron_next', expression: expression.trim(), next_runs: runs, result: runs.join('\n') }
  },
}

// ─── Timezone conversion / world clock (pure client) ─────────────────────────
function zoneOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {})
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - date.getTime()
}
function fmtIn(instant, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(instant)
}
export const timezoneTool = {
  schema: {
    description: 'Convert a time between IANA time zones, or show the current time in one or more zones (world clock).',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'ISO datetime or "YYYY-MM-DD HH:mm". Omit for "now".' },
        from: { type: 'string', description: 'Source IANA zone for the given time, e.g. "America/New_York". Default UTC.' },
        to: { type: 'array', items: { type: 'string' }, description: 'Target IANA zones, e.g. ["Asia/Kolkata","Europe/London"].' },
      },
      required: ['to'],
    },
  },
  async execute({ time, from = 'UTC', to } = {}) {
    const zones = Array.isArray(to) ? to : (to ? [to] : [])
    if (!zones.length) return { success: false, error: 'at least one target zone (to) is required' }
    let instant
    try {
      if (!time) instant = new Date()
      else {
        const iso = time.trim().replace(' ', 'T')
        const naive = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
        if (Number.isNaN(naive)) return { success: false, error: 'could not parse time' }
        // Reinterpret the wall-clock time as being in `from`, then find the UTC instant.
        const t0 = new Date(naive)
        instant = new Date(naive - zoneOffsetMs(t0, from))
      }
    } catch (e) { return { success: false, error: e.message } }
    const results = {}
    for (const z of zones) {
      try { results[z] = fmtIn(instant, z) } catch { results[z] = 'invalid zone' }
    }
    return { success: true, tool: 'timezone', utc: instant.toISOString(), from, times: results, result: Object.entries(results).map(([z, t]) => `${z}: ${t}`).join('\n') }
  },
}

// ─── Thesaurus / word tools (Datamuse, keyless CORS) ─────────────────────────
export const thesaurusTool = {
  schema: {
    description: 'Find synonyms, antonyms, rhymes, or related words for a word (Datamuse, open + keyless). Great for writing.',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: 'The word to look up.' },
        kind: { type: 'string', enum: ['synonyms', 'antonyms', 'rhymes', 'related', 'sounds_like', 'means_like'], description: 'Default synonyms.' },
        max: { type: 'number', description: 'Max results (default 20).' },
      },
      required: ['word'],
    },
  },
  async execute({ word, kind = 'synonyms', max = 20 } = {}) {
    if (!word) return { success: false, error: 'word is required' }
    const PARAM = {
      synonyms: 'rel_syn', antonyms: 'rel_ant', rhymes: 'rel_rhy',
      related: 'ml', means_like: 'ml', sounds_like: 'sl',
    }
    const key = PARAM[kind] || 'rel_syn'
    const q = `${key}=${encodeURIComponent(word)}`
    try {
      const data = await proxyJson(`https://api.datamuse.com/words?${q}&max=${Math.min(100, max)}`)
      const words = (data || []).map(d => d.word)
      if (!words.length) return { success: true, tool: 'thesaurus', word, kind, words: [], result: `No ${kind} found for "${word}".` }
      return { success: true, tool: 'thesaurus', word, kind, words, result: words.join(', ') }
    } catch (e) { return { success: false, error: e.message } }
  },
}

// ─── Country facts (REST Countries, keyless CORS) ────────────────────────────
export const countryTool = {
  schema: {
    description: 'Look up facts about a country: capital, population, region, currencies, languages, timezones, calling code, flag.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Country name or code, e.g. "Japan", "IN", "brazil".' } },
      required: ['name'],
    },
  },
  async execute({ name } = {}) {
    if (!name) return { success: false, error: 'name is required' }
    try {
      const path = /^[a-z]{2,3}$/i.test(name.trim()) ? `alpha/${name.trim()}` : `name/${encodeURIComponent(name.trim())}`
      const data = await proxyJson(`https://restcountries.com/v3.1/${path}?fields=name,capital,population,region,subregion,currencies,languages,timezones,idd,flag,cca2`)
      const c = Array.isArray(data) ? data[0] : data
      if (!c?.name) return { success: false, error: `No country found for "${name}"` }
      const currencies = Object.values(c.currencies || {}).map(x => `${x.name} (${x.symbol || ''})`).join(', ')
      const languages = Object.values(c.languages || {}).join(', ')
      const calling = c.idd?.root ? `${c.idd.root}${(c.idd.suffixes || [''])[0]}` : ''
      return {
        success: true, tool: 'country_info',
        name: c.name.common, official: c.name.official, flag: c.flag,
        capital: (c.capital || [])[0] || '—', population: c.population,
        region: `${c.region}${c.subregion ? ' / ' + c.subregion : ''}`,
        currencies, languages, timezones: c.timezones, calling_code: calling,
        result: `${c.flag} ${c.name.common} — capital ${(c.capital || ['—'])[0]}, pop ${c.population?.toLocaleString()}, ${languages}`,
      }
    } catch (e) { return { success: false, error: e.message } }
  },
}
