// Unified-diff parsing + line/word diffing. PURE — no DOM, no imports.
//
// Two entry points, because the two change sources give us different things:
//   - git hands us a real unified diff  → parseUnifiedDiff()
//   - the undo journal hands us BEFORE and AFTER text → diffTexts()
// Both produce the same row shape, so DiffView renders one model, not two.

/* ────────────────────────────── unified diff ───────────────────────────── */

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/**
 * Parse `git diff` output into files → hunks → rows.
 * Deliberately tolerant: a diff that we cannot fully understand still renders
 * its recognisable parts rather than throwing, because the alternative in a
 * review panel is a blank screen with no way to see what changed.
 */
export function parseUnifiedDiff(text) {
  const lines = String(text || '').split(/\r?\n/)
  const files = []
  let file = null
  let hunk = null
  let oldNo = 0
  let newNo = 0

  const pushFile = () => { if (file) files.push(file) }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('diff --git ')) {
      pushFile()
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
      file = {
        oldPath: m ? m[1] : null,
        newPath: m ? m[2] : null,
        path: m ? m[2] : line.slice(11),
        hunks: [],
        binary: false,
        mode: null,
        added: 0,
        removed: 0,
      }
      hunk = null
      continue
    }

    if (!file) continue

    if (line.startsWith('Binary files ')) { file.binary = true; continue }
    if (line.startsWith('new file mode')) { file.mode = 'added'; continue }
    if (line.startsWith('deleted file mode')) { file.mode = 'deleted'; continue }
    if (line.startsWith('rename from ')) { file.mode = 'renamed'; file.oldPath = line.slice(12); continue }
    if (line.startsWith('rename to ')) { file.mode = 'renamed'; file.newPath = line.slice(10); file.path = file.newPath; continue }
    if (line.startsWith('--- ')) { continue }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4)
      if (p !== '/dev/null') file.path = p.replace(/^b\//, '')
      continue
    }
    if (line.startsWith('index ') || line.startsWith('similarity index')) continue

    const hm = line.match(HUNK_RE)
    if (hm) {
      oldNo = Number(hm[1])
      newNo = Number(hm[3])
      hunk = {
        oldStart: oldNo,
        oldLines: hm[2] === undefined ? 1 : Number(hm[2]),
        newStart: newNo,
        newLines: hm[4] === undefined ? 1 : Number(hm[4]),
        header: (hm[5] || '').trim(),
        rows: [],
      }
      file.hunks.push(hunk)
      continue
    }

    if (!hunk) continue
    if (line.startsWith('\\')) continue // "\ No newline at end of file"

    const kind = line[0]
    const body = line.slice(1)
    if (kind === '+') {
      hunk.rows.push({ type: 'add', text: body, oldNo: null, newNo: newNo++ })
      file.added++
    } else if (kind === '-') {
      hunk.rows.push({ type: 'del', text: body, oldNo: oldNo++, newNo: null })
      file.removed++
    } else if (kind === ' ') {
      hunk.rows.push({ type: 'ctx', text: body, oldNo: oldNo++, newNo: newNo++ })
    } else if (line === '' && i < lines.length - 1) {
      // A blank context line in a git diff is a SPACE, not an empty string. The
      // one genuinely empty string is the tail that split() produces from the
      // trailing newline — counting it as context appended a phantom line to
      // every hunk and pushed every subsequent line number off by one. Some
      // mail-mangled diffs do strip that space, so a blank line that is not the
      // last one is still accepted.
      hunk.rows.push({ type: 'ctx', text: '', oldNo: oldNo++, newNo: newNo++ })
    }
  }

  pushFile()
  for (const f of files) for (const h of f.hunks) markIntraline(h.rows)
  return files
}

export function diffStats(files) {
  return (files || []).reduce(
    (acc, f) => ({ files: acc.files + 1, added: acc.added + (f.added || 0), removed: acc.removed + (f.removed || 0) }),
    { files: 0, added: 0, removed: 0 },
  )
}

/* ─────────────────────────── text → diff (journal) ─────────────────────── */

const MAX_DIFF_LINES = 20000

/**
 * Myers-style LCS over lines, then hunks with `context` lines of padding.
 *
 * The LCS table is O(n*m); on two 20k-line files that is 400M cells and the tab
 * dies. Past MAX_DIFF_LINES the result is reported as `truncated` and rendered
 * as a whole-file replacement — an honest "too large to diff" beats a hang.
 */
export function diffTexts(before, after, { context = 3 } = {}) {
  const a = splitLines(before)
  const b = splitLines(after)

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return { truncated: true, hunks: [], added: b.length, removed: a.length }
  }

  const rows = lcsDiff(a, b)
  const hunks = groupHunks(rows, context)
  for (const h of hunks) markIntraline(h.rows)
  return {
    truncated: false,
    hunks,
    added: rows.filter(r => r.type === 'add').length,
    removed: rows.filter(r => r.type === 'del').length,
  }
}

function splitLines(s) {
  const t = String(s ?? '')
  if (!t) return []
  return t.split(/\r?\n/)
}

/** Common prefix/suffix trimming first — it makes the usual edit near-linear. */
function lcsDiff(a, b) {
  let lo = 0
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++
  let hiA = a.length
  let hiB = b.length
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) { hiA--; hiB-- }

  const rows = []
  for (let i = 0; i < lo; i++) rows.push({ type: 'ctx', text: a[i], oldNo: i + 1, newNo: i + 1 })

  const midA = a.slice(lo, hiA)
  const midB = b.slice(lo, hiB)
  const table = lcsTable(midA, midB)

  let i = 0
  let j = 0
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      rows.push({ type: 'ctx', text: midA[i], oldNo: lo + i + 1, newNo: lo + j + 1 })
      i++; j++
    } else if (j < midB.length && (i >= midA.length || table[i][j + 1] >= table[i + 1][j])) {
      rows.push({ type: 'add', text: midB[j], oldNo: null, newNo: lo + j + 1 })
      j++
    } else {
      rows.push({ type: 'del', text: midA[i], oldNo: lo + i + 1, newNo: null })
      i++
    }
  }

  for (let k = 0; k < a.length - hiA; k++) {
    rows.push({ type: 'ctx', text: a[hiA + k], oldNo: hiA + k + 1, newNo: hiB + k + 1 })
  }
  return rows
}

function lcsTable(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
    }
  }
  return t
}

/** Collapse long runs of unchanged lines into @@ hunks. */
function groupHunks(rows, context) {
  const changed = rows.map(r => r.type !== 'ctx')
  const keep = new Array(rows.length).fill(false)
  for (let i = 0; i < rows.length; i++) {
    if (!changed[i]) continue
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true
  }

  const hunks = []
  let cur = null
  for (let i = 0; i < rows.length; i++) {
    if (!keep[i]) { cur = null; continue }
    if (!cur) {
      cur = {
        oldStart: rows[i].oldNo ?? (hunks.length ? 0 : 1),
        newStart: rows[i].newNo ?? (hunks.length ? 0 : 1),
        oldLines: 0,
        newLines: 0,
        header: '',
        rows: [],
      }
      hunks.push(cur)
    }
    cur.rows.push(rows[i])
    if (rows[i].type !== 'add') cur.oldLines++
    if (rows[i].type !== 'del') cur.newLines++
  }
  return hunks
}

/* ──────────────────────────── intra-line highlight ─────────────────────── */

/**
 * Pair each del with the add that replaced it and mark the tokens that actually
 * differ. Without this a one-character change paints two entire red/green
 * lines, and the reviewer has to diff them by eye — which is exactly the moment
 * a wrong AI edit gets waved through.
 *
 * Only pairs runs of EQUAL length: a 3-del/1-add block has no honest pairing
 * and guessing one invents changes that are not there.
 */
export function markIntraline(rows) {
  let i = 0
  while (i < rows.length) {
    if (rows[i].type !== 'del') { i++; continue }
    let d = i
    while (d < rows.length && rows[d].type === 'del') d++
    let a = d
    while (a < rows.length && rows[a].type === 'add') a++
    const dels = d - i
    const adds = a - d
    if (dels > 0 && dels === adds && dels <= 40) {
      for (let k = 0; k < dels; k++) {
        const del = rows[i + k]
        const add = rows[d + k]
        if (!similarEnough(del.text, add.text)) continue
        const { left, right } = wordDiff(del.text, add.text)
        del.segments = left
        add.segments = right
      }
    }
    i = a > i ? a : i + 1
  }
  return rows
}

/**
 * Guard the pairing: two completely unrelated lines produce a highlight that
 * marks nearly everything, which is noisier than no highlight at all.
 */
export function similarEnough(a, b) {
  const x = String(a || '')
  const y = String(b || '')
  if (!x || !y) return false
  const short = Math.min(x.length, y.length)
  const long = Math.max(x.length, y.length)
  if (long > 400) return false
  let pre = 0
  while (pre < short && x[pre] === y[pre]) pre++
  let suf = 0
  while (suf < short - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++
  return (pre + suf) / long >= 0.25
}

const TOKEN_RE = /(\s+|[A-Za-z0-9_$]+|.)/g

export function tokenize(s) {
  return String(s ?? '').match(TOKEN_RE) || []
}

/** Token-level LCS → { left, right } segment arrays of { text, changed }. */
export function wordDiff(a, b) {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length * tb.length > 250000) {
    return { left: [{ text: String(a ?? ''), changed: true }], right: [{ text: String(b ?? ''), changed: true }] }
  }
  const t = lcsTable(ta, tb)
  const left = []
  const right = []
  let i = 0
  let j = 0
  while (i < ta.length || j < tb.length) {
    if (i < ta.length && j < tb.length && ta[i] === tb[j]) {
      push(left, ta[i], false); push(right, tb[j], false); i++; j++
    } else if (j < tb.length && (i >= ta.length || t[i][j + 1] >= t[i + 1][j])) {
      push(right, tb[j], true); j++
    } else {
      push(left, ta[i], true); i++
    }
  }
  return { left, right }
}

function push(arr, text, changed) {
  const last = arr[arr.length - 1]
  if (last && last.changed === changed) last.text += text
  else arr.push({ text, changed })
}

/* ───────────────────────────── side-by-side view ───────────────────────── */

/**
 * Turn a hunk's row list into aligned left/right pairs. Done here rather than
 * in the component so the alignment is testable — a side-by-side view that
 * misaligns by one row is worse than an inline one.
 */
export function toSideBySide(rows) {
  const out = []
  let i = 0
  while (i < rows.length) {
    const r = rows[i]
    if (r.type === 'ctx') { out.push({ left: r, right: r }); i++; continue }
    const dels = []
    const adds = []
    while (i < rows.length && rows[i].type === 'del') dels.push(rows[i++])
    while (i < rows.length && rows[i].type === 'add') adds.push(rows[i++])
    const n = Math.max(dels.length, adds.length)
    for (let k = 0; k < n; k++) out.push({ left: dels[k] || null, right: adds[k] || null })
    if (!dels.length && !adds.length) i++ // never stall on an unknown row type
  }
  return out
}

/** `@@ -a,b +c,d @@` for display. */
export function hunkHeader(h) {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@${h.header ? ' ' + h.header : ''}`
}
