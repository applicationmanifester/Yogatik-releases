/**
 * Compact "skeleton" view of a source file — collapse long function/control
 * bodies and large literal blobs to a one-line summary while keeping every
 * declaration's SIGNATURE, and class/interface SHAPE, visible. The point:
 * fs_read pays for a file's full bytes even when the agent only needs to
 * know its SHAPE before deciding whether the body actually matters — the
 * same "map, not the territory" idea fs_codebase_map applies across a whole
 * repo (electron/codebaseMapCore.cjs), applied here within ONE file, and
 * complementary to fs_outline/fs_smart_read (tools/fsSmartRead.js): those
 * give a bare symbol LIST or a targeted read; this gives the file itself,
 * lightly compacted, when the agent doesn't yet know which part it needs.
 *
 * Deliberately regex/brace-counting, not a real parser — same "best-effort,
 * not a full parser" discipline codebaseMapCore.cjs's symbol extraction
 * already uses, and scoped to brace-delimited languages only (JS/TS/Java/
 * C-family/Go/Rust/CSS/…). A language this cannot reason about (Python,
 * YAML, Markdown, plain text) is reported as unsupported rather than
 * silently mis-collapsed — never a guess dressed up as a fact.
 *
 * Strings, template literals and comments are masked out before counting
 * braces so a stray `{`/`}` inside one of them can never desync the depth
 * counter (the exact class of bug that would otherwise make this either
 * over-collapse — swallowing real code — or under-collapse — collapsing
 * nothing at all). Every KEPT line is emitted byte-for-byte; the only thing
 * this ever removes is an interior body it has replaced with an honest
 * line-count note.
 */

export const SKELETON_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte',
  'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'go', 'rs',
  'swift', 'kt', 'kts', 'php', 'css', 'scss', 'less',
])

export function isSkeletonSupported(ext) {
  return SKELETON_EXTENSIONS.has(String(ext || '').replace(/^\./, '').toLowerCase())
}

// Containers whose MEMBERS matter individually — never collapse the whole
// body, walk into it instead so each method/property still gets its own
// signature line, and only ITS body (if long enough) collapses.
const RECURSE_KEYWORDS = /\b(class|interface|namespace|enum|module|struct|impl|trait)\b/

/**
 * Mask string/template-literal/comment content in one line to spaces so
 * brace-counting only ever sees structural braces. `state` carries whether
 * the NEXT line begins already inside a block comment or an unterminated
 * quote (template literals routinely span many lines — the one case a
 * naive per-line masker would get wrong without this).
 */
function maskLine(line, state) {
  let out = ''
  let i = 0
  let inBlockComment = state.inBlockComment
  let quote = state.quote || null
  while (i < line.length) {
    const ch = line[i]
    const next = line[i + 1]
    if (inBlockComment) {
      if (ch === '*' && next === '/') { out += '  '; i += 2; inBlockComment = false; continue }
      out += ' '; i++; continue
    }
    if (quote) {
      if (ch === '\\') { out += '  '; i += 2; continue }
      out += ' '
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '/' && next === '*') { inBlockComment = true; out += '  '; i += 2; continue }
    if (ch === '/' && next === '/') { out += ' '.repeat(line.length - i); break }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ' '; i++; continue }
    out += ch
    i++
  }
  return { masked: out, nextState: { inBlockComment, quote } }
}

/**
 * Build the skeleton for one file's already-read text. Pure — no fs, no
 * network — so it takes plain source text and returns plain text back.
 */
export function buildSkeleton(source, { collapseThreshold = 6 } = {}) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let collapsedRegions = 0
  let collapsedLines = 0

  // Pass 1: depth after every line, and each line's masked (structural-
  // braces-only) text — a single forward scan, no re-entrant lookahead.
  const depthAfter = new Array(lines.length)
  const maskedLines = new Array(lines.length)
  {
    let state = { inBlockComment: false, quote: null }
    let depth = 0
    for (let i = 0; i < lines.length; i++) {
      const { masked, nextState } = maskLine(lines[i], state)
      state = nextState
      maskedLines[i] = masked
      const opens = (masked.match(/\{/g) || []).length
      const closes = (masked.match(/\}/g) || []).length
      depth += opens - closes
      depthAfter[i] = depth
    }
  }

  // Pass 2: walk lines; a line that nets a brace OPEN and is not a
  // recurse-into container starts a candidate region — its matching close
  // is already known from pass 1, so no nested scanning is needed.
  let i = 0
  while (i < lines.length) {
    const depthBefore = i === 0 ? 0 : depthAfter[i - 1]
    const masked = maskedLines[i]
    const opens = (masked.match(/\{/g) || []).length
    const closes = (masked.match(/\}/g) || []).length
    const isOpener = (opens - closes) > 0 && !RECURSE_KEYWORDS.test(masked)

    if (isOpener) {
      let k = i
      while (k < lines.length && depthAfter[k] > depthBefore) k++
      const bodyLines = k - i - 1
      if (k < lines.length && bodyLines > collapseThreshold) {
        const indent = (lines[i + 1] || '').match(/^\s*/)[0]
        out.push(lines[i])
        out.push(`${indent}… ${bodyLines} line${bodyLines === 1 ? '' : 's'} collapsed …`)
        out.push(lines[k])
        collapsedRegions++
        collapsedLines += bodyLines
        i = k + 1
        continue
      }
    }
    out.push(lines[i])
    i++
  }

  return {
    text: out.join('\n'),
    collapsedRegions,
    collapsedLines,
    originalLines: lines.length,
    outputLines: out.length,
    reductionPct: lines.length ? Math.round((1 - out.length / lines.length) * 100) : 0,
  }
}
