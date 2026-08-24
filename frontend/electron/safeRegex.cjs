// Deciding whether a pattern is safe to run, and correct glob translation.
//
// MEASURED 2026-08-24: `new RegExp('(a+)+$').test('a'.repeat(40) + '!')` in a
// bare Node process did not merely take a long time — it never returned, and a
// setTimeout scheduled BEFORE it never fired. The regex engine holds the
// thread through backtracking, so the event loop stops entirely.
//
// fs_search does `regex ? new RegExp(query) : null` with a query the MODEL
// wrote, on the Electron main process — the process that also composites the
// window. One catastrophic pattern therefore freezes the whole desktop app
// permanently, with no dialog, no cancel and no timeout possible, until the
// user kills it from Task Manager.
//
// Two defences, because neither is sufficient alone:
//   1. this file rejects the shapes that cause it, cheaply and before running
//   2. searchWorker.cjs runs whatever survives on a thread that can be killed
//
// Electron-free so it can be tested directly.

/**
 * Patterns whose shape permits exponential backtracking.
 *
 * This is deliberately a STRUCTURAL check, not an attempt to decide the halting
 * problem: a quantified group that itself contains a quantifier, or two
 * adjacent quantified groups matching overlapping text, are the shapes behind
 * essentially every real catastrophic regex. False positives are acceptable —
 * the caller falls back to a literal substring search, which is what the user
 * usually meant anyway.
 */
const NESTED_QUANTIFIER = /\([^)]*[+*}][^)]*\)\s*[+*]|\([^)]*\)\s*\{\d+,\}\s*[+*]/
const OVERLAPPING_ALTERNATION = /\((?:[^)|]*\|)+[^)]*\)\s*[+*]/

/** Longest pattern we will even consider compiling. */
const MAX_PATTERN_LENGTH = 500

/**
 * @returns {{safe: boolean, reason?: string}}
 */
function assessPattern(source) {
  const pattern = String(source ?? '')
  if (!pattern) return { safe: false, reason: 'The pattern is empty.' }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { safe: false, reason: `The pattern is longer than ${MAX_PATTERN_LENGTH} characters.` }
  }

  // It must at least be a valid regex before its shape is worth judging.
  try { new RegExp(pattern) } catch (e) {
    return { safe: false, reason: `Not a valid regular expression: ${e.message}` }
  }

  if (NESTED_QUANTIFIER.test(pattern)) {
    return {
      safe: false,
      reason: 'The pattern nests one repetition inside another (for example "(a+)+"), which can take '
        + 'exponential time on ordinary input. Searching for it literally instead.',
    }
  }
  if (OVERLAPPING_ALTERNATION.test(pattern)) {
    return {
      safe: false,
      reason: 'The pattern repeats a group of alternatives (for example "(a|a)*"), which can take '
        + 'exponential time on ordinary input. Searching for it literally instead.',
    }
  }
  return { safe: true }
}

/** Compile, or return null with the reason. Never throws. */
function safeRegExp(source, flags = '') {
  const verdict = assessPattern(source)
  if (!verdict.safe) return { regex: null, reason: verdict.reason }
  try { return { regex: new RegExp(source, flags), reason: null } }
  catch (e) { return { regex: null, reason: e.message } }
}

// ── Globs ───────────────────────────────────────────────────────────────────

/**
 * Translate a glob to a regex with the semantics people expect.
 *
 * The previous version was `.replace(/\*​/g, '.*')`, which makes `*` match
 * across directory separators — so `src/*.js` matched `src/deep/nested/a.js`
 * — and had no notion of `**` at all. The distinction is the entire point of
 * a glob: `*` stays inside one path segment, `**` crosses them.
 */
function globToRegExp(glob, { caseInsensitive = true } = {}) {
  const input = String(glob ?? '')
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '*') {
      if (input[i + 1] === '*') {
        // `**/` also has to match zero directories, so `**/*.js` finds a file
        // at the root as well as a nested one.
        if (input[i + 2] === '/') { out += '(?:.*/)?'; i += 2 }
        else { out += '.*'; i += 1 }
      } else {
        out += '[^/]*'
      }
    } else if (c === '?') {
      out += '[^/]'
    } else if (c === '{') {
      // {js,ts,jsx} — an alternation, which is what people reach for next.
      const close = input.indexOf('}', i)
      if (close === -1) { out += '\\{' } else {
        const options = input.slice(i + 1, close).split(',').map(s => s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&'))
        out += `(?:${options.join('|')})`
        i = close
      }
    } else if ('.+^$()|[]\\'.includes(c)) {
      out += `\\${c}`
    } else {
      out += c
    }
  }
  return new RegExp(`^${out}$`, caseInsensitive ? 'i' : '')
}

module.exports = { assessPattern, safeRegExp, globToRegExp, MAX_PATTERN_LENGTH }
