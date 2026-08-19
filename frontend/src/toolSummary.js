/**
 * Human-readable summaries of tool results.
 *
 * Used when a turn ends with no answer: rather than lose the work the tools
 * did, the user is shown what was gathered. The first version pasted raw
 * JSON.stringify output — including a 187KB file's contents and internal
 * bookkeeping like the repeated-call note — which is barely better than a blank
 * bubble. This renders what a person would actually want to read.
 *
 * Pure and DOM-free so the shapes can be pinned by tests.
 */

const MAX_TEXT = 400

/** Fields that are internal plumbing, not findings. */
const NOISE = new Set(['tool', 'success', 'repeated', 'note', 'blocked', 'stale', 'media_id'])

function clip(v, max = MAX_TEXT) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

/** One tool's result, as a line or two of prose. */
export function summariseResult(name, result) {
  if (result == null) return `**${name}** — no result.`
  if (typeof result === 'string') return `**${name}** — ${clip(result)}`

  // Failures are worth one line: the reason, nothing else.
  if (result.success === false || result.error) {
    return `**${name}** — did not succeed: ${clip(result.error || 'no reason given', 200)}`
  }

  const bits = []

  // The fields people actually care about, named rather than dumped.
  if (result.path) bits.push(String(result.path))
  if (typeof result.bytes === 'number') bits.push(`${result.bytes.toLocaleString()} bytes`)
  if (typeof result.count === 'number') bits.push(`${result.count} result${result.count === 1 ? '' : 's'}`)
  if (Array.isArray(result.results)) bits.push(`${result.results.length} result${result.results.length === 1 ? '' : 's'}`)
  if (Array.isArray(result.jobs)) bits.push(`${result.jobs.length} listing${result.jobs.length === 1 ? '' : 's'}`)
  if (Array.isArray(result.matches)) bits.push(`${result.matches.length} match${result.matches.length === 1 ? '' : 'es'}`)
  if (result.url) bits.push(String(result.url))
  if (result.title) bits.push(String(result.title))

  const head = bits.length ? ` — ${bits.join(' · ')}` : ''

  // A content preview, but a SHORT one: the point is to show what was found,
  // not to reprint the file.
  const preview = result.content || result.text || result.excerpt || result.output || result.tree
  const body = preview ? `\n\n${clip(preview)}` : ''

  if (!head && !body) {
    // Nothing recognisable — fall back to the keys, which at least says what
    // shape came back without pasting the whole payload.
    const keys = Object.keys(result).filter((k) => !NOISE.has(k))
    return `**${name}**${keys.length ? ` — returned ${keys.join(', ')}` : ' — no details.'}`
  }
  return `**${name}**${head}${body}`
}

/**
 * All results, successes first — a failure is context, not a finding, and
 * leading with one buries whatever did work.
 */
export function summariseToolResults(results) {
  const names = Object.keys(results || {})
  if (!names.length) return ''
  const failed = (n) => {
    const r = results[n]
    return !!(r && typeof r === 'object' && (r.success === false || r.error))
  }
  const ordered = [...names.filter((n) => !failed(n)), ...names.filter(failed)]
  return ordered.map((n) => summariseResult(n, results[n])).join('\n\n')
}
