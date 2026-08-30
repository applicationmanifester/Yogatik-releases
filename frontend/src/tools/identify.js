/**
 * Turn an image into a grounded, sourced answer.
 *
 * The chain: read the image with everything available → pull out the strings
 * that could actually identify something → search the web for them → hand the
 * model the evidence.
 *
 * This exists because reading an image and knowing what it IS are different
 * problems. A perfect OCR of a video player gives you an episode number and a
 * timestamp; the series name is on the internet, not in the frame. Describing
 * harder was never going to answer "what series is this" — searching is.
 *
 * The extraction half is pure and exported, because deciding which strings are
 * worth searching for is the part that is easy to get subtly wrong and
 * impossible to debug from a screenshot.
 */

import { describeWithoutModel } from '../vision/source'
import { webSearchTool } from './webSearch'
import { pillLookupTool } from './pillLookup'
import { barcodeLookupTool } from './barcodeLookup'

/** Chrome, units and UI furniture — never worth a search on their own. */
const STOPWORDS = new Set([
  'play', 'pause', 'stop', 'next', 'prev', 'previous', 'back', 'home', 'menu',
  'settings', 'search', 'close', 'cancel', 'ok', 'done', 'save', 'edit', 'delete',
  'loading', 'error', 'warning', 'info', 'help', 'more', 'less', 'show', 'hide',
  'subscribe', 'like', 'share', 'comment', 'follow', 'login', 'signin', 'signup',
  'episode', 'season', 'part', 'chapter', 'volume', 'page', 'min', 'mins', 'sec',
  'hour', 'hours', 'am', 'pm', 'http', 'https', 'www', 'com', 'net', 'org',
])

const TIMECODE = /^\d{1,2}:\d{2}(:\d{2})?$/
const NUMERIC = /^[\d\s.,:%+\-/|»«•·—–]+$/

/** Edit distance, capped — we only ever care whether it is 0 or 1. */
function within1(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let slips = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++slips > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else { i++; j++ }
  }
  return slips + (a.length - i) + (b.length - j) <= 1
}

/**
 * Is this a GARBLED piece of UI chrome?
 *
 * OCR on interface text misreads constantly — the screenshot that prompted all
 * this produced "PLEY" for a play button. "PLEY" survives every other filter:
 * it is four letters, all caps, not a stopword, not numeric. Searching for it
 * returns confident nonsense.
 *
 * So chrome is matched fuzzily, not exactly. This is the difference between
 * filtering the word the button says and filtering the word OCR THOUGHT the
 * button said, and only the second one is the situation we are actually in.
 */
export function isLikelyMisreadChrome(token) {
  const t = String(token || '').toLowerCase().replace(/[^a-z]/g, '')
  if (t.length < 3) return true
  for (const w of STOPWORDS) if (within1(t, w)) return true
  return false
}

/**
 * Which fragments of the image could identify something?
 *
 * Ranked, because a search is only as good as its query and the model should
 * be handed the best two or three, not twenty.
 *
 * @param {object} reading  the result of describeWithoutModel
 * @returns {Array<{text, kind, score}>}
 */
export function extractIdentifiers(reading = {}) {
  const out = []
  const seen = new Set()

  const add = (text, kind, score) => {
    const t = String(text || '').trim().replace(/\s+/g, ' ')
    if (!t || t.length < 3) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ text: t, kind, score })
  }

  // 1. Whole OCR lines. A title is a line, not a word — splitting first is how
  // you turn "The Expanse" into two useless tokens.
  for (const raw of String(reading.ocr || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.length < 3) continue
    if (NUMERIC.test(line)) continue
    if (TIMECODE.test(line)) continue
    const words = line.split(/\s+/).filter(w => /[A-Za-z]/.test(w))
    if (!words.length) continue
    const meaningful = words.filter(w => !isLikelyMisreadChrome(w))
    if (!meaningful.length) continue

    // Title-ish lines score highest: several words, mostly capitalised, no
    // sentence punctuation.
    const capitalised = meaningful.filter(w => /^[A-Z]/.test(w)).length
    const titleish = meaningful.length >= 2 && capitalised / meaningful.length > 0.5 && !/[.!?]$/.test(line)
    add(line, titleish ? 'title' : 'text', titleish ? 0.9 : 0.5 + Math.min(0.2, line.length / 200))
  }

  // 2. Distinctive single tokens — proper nouns, product names, versions.
  for (const w of String(reading.ocr || '').split(/\s+/)) {
    const token = w.replace(/^[^\w]+|[^\w]+$/g, '')
    if (token.length < 4) continue
    if (isLikelyMisreadChrome(token)) continue
    if (/^\d+$/.test(token)) continue
    // CamelCase or ALLCAPS reads as a name rather than prose.
    if (/^[A-Z][a-z]+[A-Z]|^[A-Z]{3,}$/.test(token)) add(token, 'name', 0.7)
  }

  // 3. What the classifier thought it was — a weak query alone, but it makes a
  // good qualifier when combined with a title.
  for (const l of reading.labels || []) {
    if (l.score > 0.35) add(l.label, 'category', 0.3)
  }

  return out.sort((a, b) => b.score - a.score)
}

/**
 * Build the search queries. At most `max`, because each one is a real network
 * round trip and three good queries beat twenty bad ones.
 */
export function buildQueries(identifiers = [], hint = '', max = 3) {
  const strong = identifiers.filter(i => i.kind === 'title' || i.kind === 'name')
  const category = identifiers.find(i => i.kind === 'category')
  const queries = []

  for (const id of strong.slice(0, max)) {
    // The user's own words are the best possible qualifier — "what series is
    // this" tells you to search for a series, which no image analysis can.
    queries.push(hint ? `${id.text} ${hint}`.trim() : id.text)
  }
  if (!queries.length && category) {
    queries.push(hint ? `${category.text} ${hint}`.trim() : category.text)
  }
  return queries.slice(0, max)
}

/** Strip the question down to the words worth adding to a query. */
export function searchHint(question = '') {
  const q = String(question).toLowerCase()
  const KINDS = [
    ['series', 'tv series'], ['show', 'tv show'], ['movie', 'movie'], ['film', 'film'],
    ['anime', 'anime'], ['game', 'video game'], ['song', 'song'], ['album', 'album'],
    ['book', 'book'], ['product', 'product'], ['error', 'error'], ['logo', 'logo'],
    ['plant', 'plant species'], ['bird', 'bird species'], ['car', 'car model'],
    ['pill', 'pill identification imprint'], ['tablet', 'tablet medication imprint'],
    ['medicine', 'medication pill'], ['drug', 'pharmaceutical drug'],
    ['barcode', 'upc barcode product'],
  ]
  for (const [needle, hint] of KINDS) if (q.includes(needle)) return hint
  return ''
}

export const identifyTool = {
  schema: {
    description:
      'Identify what is in an image and, when it names something real, look it up on the web. ' +
      'Reads the image with every on-device signal available (structure, OCR, zero-shot labels, ' +
      'object detection), extracts the strings that could identify it, searches for them, and ' +
      'returns the evidence with sources. Use this for "what is this / what series / what product / ' +
      'what error / what pill or medication is this" questions about an image — it is the tool that can answer them, because ' +
      'the answer is usually on the internet rather than in the pixels.',
    parameters: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL or data URL of the image.' },
        question: { type: 'string', description: 'What the user actually asked, e.g. "what series is this" or "what pill is this".' },
        search: { type: 'boolean', description: 'Look the findings up on the web (default true).' },
      },
      required: ['image_url'],
    },
  },
  async execute({ image_url, question = '', search = true } = {}) {
    if (typeof image_url !== 'string' || !image_url.trim()) {
      return { success: false, error: 'image_url is required' }
    }

    let reading
    try {
      reading = await describeWithoutModel(image_url, question)
    } catch (e) {
      return { success: false, error: `The image could not be read: ${e?.message || e}` }
    }

    const identifiers = extractIdentifiers(reading)
    const hint = searchHint(question)
    const queries = buildQueries(identifiers, hint)
    const isMedical = /\b(pill|tablet|capsule|medicine|medication|drug|dose|prescription)\b/i.test(question)

    const result = {
      success: true,
      tool: 'identify',
      description: reading.text,
      read_with: reading.sources,
      identifiers: identifiers.slice(0, 8).map(i => ({ text: i.text, kind: i.kind })),
      queries,
      findings: [],
      sources: [],
    }

    // Direct specialized lookup for medical pills/tablets via RxNav & OpenFDA
    if (isMedical && identifiers.length > 0) {
      for (const id of identifiers.slice(0, 2)) {
        try {
          const pillRes = await pillLookupTool.execute({ imprint: id.text, drug_name: id.text })
          if (pillRes?.matches?.length || pillRes?.fda_facts) {
            result.medication_lookup = pillRes
            break
          }
        } catch {}
      }
    }

    if (!search || !queries.length) {
      result.note = queries.length
        ? undefined
        : 'Nothing in the image was distinctive enough to search for — no title, label or readable name. ' +
          'Say what the image appears to be and ask the user for the name, or for a frame that shows one.'
      return result
    }

    for (const q of queries) {
      try {
        const r = await webSearchTool.execute({ query: q, count: 4 })
        const hits = (r?.results || []).slice(0, 4).map(h => ({
          title: h.title, url: h.url, snippet: (h.description || h.snippet || '').slice(0, 300),
        }))
        if (hits.length) {
          result.findings.push({ query: q, hits })
          result.sources.push(...hits.map(h => h.url).filter(Boolean))
        }
      } catch { /* one dead query must not sink the identification */ }
    }

    if (!result.findings.length && !result.medication_lookup) {
      result.note = 'The image was read, but searching for what it contains returned nothing usable. ' +
        'Report what the image shows and be explicit that the identification is unconfirmed.'
    }
    return result
  },
}
