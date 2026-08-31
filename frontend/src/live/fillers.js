/**
 * What to say while a tool runs.
 *
 * THE PROBLEM THIS SOLVES IS PERCEPTUAL, NOT COMPUTATIONAL. A web search takes
 * three or four seconds however fast the model is. In a text chat that is a
 * spinner; in a SPOKEN conversation it is dead air, and dead air reads as
 * "it broke" — people repeat themselves, which barges in, which cancels the
 * turn, which makes it genuinely broken. A person says "let me look that up"
 * and the same three seconds become unremarkable.
 *
 * Pure and DOM-free so the choice logic is testable without a speaker.
 *
 * Rules that matter more than the wording:
 *  - say it ONLY if nothing has been spoken yet this turn. Interrupting the
 *    model's own opening sentence to announce a search is worse than silence.
 *  - say it once per turn, not once per tool. A three-tool round should not
 *    narrate itself three times.
 *  - stay quiet for tools that finish faster than the sentence takes to speak;
 *    announcing a 200ms calculator call costs more time than it covers.
 */

/** Tools slow enough that silence is worse than a sentence. */
const SLOW_TOOLS = new Set([
  'web_search', 'deep_research', 'web_extract', 'link_preview', 'rss_feed',
  'browser_control', 'browser_autopilot', 'identify', 'pill_lookup', 'barcode_lookup',
  'image_generate', 'sticker_generate', 'video_render', 'text_to_audio', 'segment',
  'code_execute', 'terminal_run', 'spawn_agents', 'crew_orchestrator', 'doc_search',
  'scrapling', 'firecrawl', 'market_data', 'finance_analytics',
])

/**
 * Wording grouped by what the tool is actually doing, because "let me look
 * that up" is wrong for image generation and irritating for a file read.
 */
const PHRASES = {
  search: ['Let me look that up.', 'One moment, checking.', 'Let me search for that.'],
  browse: ['Opening that up now.', 'Let me take a look at the page.'],
  make: ['Making that now.', 'Give me a moment to put that together.'],
  run: ['Running that now.', 'One moment, executing.'],
  look: ['Let me take a closer look.', 'Looking at that now.'],
  think: ['Give me a second on this one.', 'Working on it.'],
}

const GROUP = {
  web_search: 'search', deep_research: 'search', doc_search: 'search',
  market_data: 'search', finance_analytics: 'search', rss_feed: 'search',
  web_extract: 'browse', link_preview: 'browse', browser_control: 'browse',
  browser_autopilot: 'browse', scrapling: 'browse', firecrawl: 'browse',
  image_generate: 'make', sticker_generate: 'make', video_render: 'make',
  text_to_audio: 'make',
  code_execute: 'run', terminal_run: 'run',
  identify: 'look', pill_lookup: 'look', barcode_lookup: 'look', segment: 'look',
  spawn_agents: 'think', crew_orchestrator: 'think',
}

/** Is this tool worth speaking about at all? */
export function isSlowTool(name) {
  return SLOW_TOOLS.has(String(name || '')) || String(name || '').startsWith('mcp__')
}

/**
 * Pick the line to speak for a round of tools, or null to stay silent.
 *
 * @param {string[]} names        tools starting in this round
 * @param {object}   state
 * @param {boolean}  state.hasSpoken   the model already said something this turn
 * @param {boolean}  state.announced   a filler was already spoken this turn
 * @param {string}   [state.last]      the previous filler, to avoid repeating it
 * @param {() => number} [state.rand]  injectable for deterministic tests
 */
export function pickFiller(names = [], { hasSpoken = false, announced = false, last = '', rand = Math.random } = {}) {
  // Never talk over the model's own answer, and never twice in one turn.
  if (hasSpoken || announced) return null
  const slow = (Array.isArray(names) ? names : []).filter(isSlowTool)
  if (!slow.length) return null

  const group = GROUP[slow[0]] || 'think'
  const options = PHRASES[group] || PHRASES.think
  // Avoid saying the same thing twice in a row — the fastest way to sound
  // like a recording rather than a participant.
  const usable = options.length > 1 ? options.filter(p => p !== last) : options
  return usable[Math.floor(rand() * usable.length) % usable.length]
}

export const _PHRASES = PHRASES
