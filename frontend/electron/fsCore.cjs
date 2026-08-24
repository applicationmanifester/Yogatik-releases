// The parts of the filesystem bridge where getting it slightly wrong destroys
// the user's work. Electron-free on purpose — exactly like rootsCore.cjs, this
// split is the only reason any of it is testable, and these are the functions
// whose correctness the user's files depend on.
//
// Every rule here was written against a MEASURED failure, driven through the
// real handlers against a real temp directory (see electronFsBridge.test.js):
//
//   fs_edit with old_string:"" and replace_all turned "hello" into "hXeXlXlXo"
//   fs_write turned a CRLF file into an LF file, i.e. a whole-file git diff
//   fs_read truncated at maxBytes and said nothing, so the model believed it
//     had seen the entire file and then rewrote it from that belief
//   fs_move renamed onto an existing file and destroyed it silently
//   fs_write was writeFile-in-place: a crash mid-write truncates the original

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ── Encoding ────────────────────────────────────────────────────────────────
// Not a general charset detector, and it does not pretend to be. It recognises
// the encodings a text editor actually meets on Windows, and round-trips them.

const BOMS = [
  { name: 'utf8', bytes: [0xEF, 0xBB, 0xBF], enc: 'utf8' },
  { name: 'utf16le', bytes: [0xFF, 0xFE], enc: 'utf16le' },
  { name: 'utf16be', bytes: [0xFE, 0xFF], enc: null },   // Node cannot encode BE
]

function detectBom(buf) {
  for (const b of BOMS) {
    if (buf.length >= b.bytes.length && b.bytes.every((v, i) => buf[i] === v)) return b
  }
  return null
}

/**
 * A file is binary if it holds a NUL in the part we sampled. Same test the
 * search filter uses; kept here so a caller can refuse to hand a JPEG to a
 * language model as "text".
 */
function looksBinaryBuffer(buf, sample = 8000) {
  const n = Math.min(buf.length, sample)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

/**
 * Decode a buffer, remembering everything needed to write it back unchanged.
 * @returns {{text, encoding, bom, binary}}
 */
function decodeBuffer(buf) {
  const bom = detectBom(buf)
  if (bom) {
    if (!bom.enc) {
      // UTF-16BE: readable, but Node cannot write it back, so say so rather
      // than silently converting the user's file to something else.
      return { text: buf.swap16().slice(2).toString('utf16le'), encoding: 'utf16be', bom: true, binary: false, readOnly: true }
    }
    return { text: buf.slice(bom.bytes.length).toString(bom.enc), encoding: bom.name, bom: true, binary: false }
  }
  // A UTF-16LE file without a BOM shows as text bytes interleaved with NULs.
  // Without this check it trips the binary test and the file reads as unusable.
  if (buf.length >= 2 && buf.length % 2 === 0) {
    let nulOdd = 0
    const n = Math.min(buf.length, 512)
    for (let i = 1; i < n; i += 2) if (buf[i] === 0) nulOdd++
    if (nulOdd > n / 4) return { text: buf.toString('utf16le'), encoding: 'utf16le', bom: false, binary: false }
  }
  return { text: buf.toString('utf8'), encoding: 'utf8', bom: false, binary: looksBinaryBuffer(buf) }
}

/** Turn text back into bytes the way the file was originally stored. */
function encodeText(text, { encoding = 'utf8', bom = false } = {}) {
  if (encoding === 'utf16le') {
    const body = Buffer.from(text, 'utf16le')
    return bom ? Buffer.concat([Buffer.from([0xFF, 0xFE]), body]) : body
  }
  const body = Buffer.from(text, 'utf8')
  return bom ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), body]) : body
}

// ── Line endings ────────────────────────────────────────────────────────────

/**
 * What this file uses. A model writes '\n' whatever it was handed, so without
 * this every edit to a CRLF file rewrites all of it and the diff is the whole
 * file — which is how a one-line change becomes unreviewable.
 */
function detectEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length
  const lf = (text.match(/(?<!\r)\n/g) || []).length
  if (crlf === 0 && lf === 0) return null      // no newline at all: don't guess
  return crlf >= lf ? '\r\n' : '\n'
}

/** Normalise to '\n' for matching, then restore on the way out. */
function toLf(text) { return String(text).replace(/\r\n/g, '\n') }
function applyEol(text, eol) {
  if (!eol || eol === '\n') return toLf(text)
  return toLf(text).replace(/\n/g, eol)
}

// ── Editing ─────────────────────────────────────────────────────────────────

/**
 * Count occurrences without `text.split(needle).length - 1`, which allocates an
 * array of every fragment — on a large file that is a needless copy of the
 * whole thing, and with an empty needle it is an array of every character.
 */
function countOccurrences(haystack, needle) {
  if (!needle) return 0
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) { n++; i = haystack.indexOf(needle, i + needle.length) }
  return n
}

function replaceAllLiteral(haystack, needle, replacement) {
  if (!needle) return haystack
  let out = ''
  let from = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    out += haystack.slice(from, i) + replacement
    from = i + needle.length
    i = haystack.indexOf(needle, from)
  }
  return out + haystack.slice(from)
}

/**
 * The pure edit. Returns the new text and how many replacements happened, or
 * throws with a message the MODEL can act on — "not found" and "not unique"
 * are both recoverable if you say which one it is.
 *
 * @throws on an empty old_string. That is not an edit, it is a request to
 * insert the replacement between every character of the file, which is what
 * the old implementation actually did.
 */
function applyEdit(text, oldString, newString, replaceAll = false) {
  if (typeof oldString !== 'string' || oldString === '') {
    throw new Error('old_string must be a non-empty string. To create or replace a whole file use fs_write.')
  }
  if (oldString === newString) {
    throw new Error('old_string and new_string are identical — nothing to do.')
  }
  const count = countOccurrences(text, oldString)
  if (count === 0) throw new Error('old_string not found')
  if (count > 1 && !replaceAll) {
    throw new Error(`old_string is not unique (${count} matches); set replace_all or add more surrounding context`)
  }
  const next = replaceAll
    ? replaceAllLiteral(text, oldString, newString ?? '')
    : (() => {
      const i = text.indexOf(oldString)
      return text.slice(0, i) + (newString ?? '') + text.slice(i + oldString.length)
    })()
  return { text: next, replaced: replaceAll ? count : 1 }
}

// ── Identity ────────────────────────────────────────────────────────────────

/** Cheap content identity, used to notice a file changing under an edit. */
function hashContent(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8')
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

// ── Atomic write ────────────────────────────────────────────────────────────

/**
 * Write bytes so that the file on disk is either entirely the old content or
 * entirely the new one, never a truncated half.
 *
 * writeFile() opens with O_TRUNC: the original is destroyed the instant the
 * call starts, and a crash, a full disk or a killed process in the middle
 * leaves a zero-length or half-written file with no copy anywhere. Writing a
 * sibling temp file and renaming is atomic on both POSIX and NTFS, and the
 * fsync is what makes that promise survive a power cut rather than just a
 * process crash.
 *
 * The temp file is a SIBLING because rename is only atomic within a filesystem;
 * os.tmpdir() is frequently a different volume.
 */
async function writeFileAtomic(file, data, { mode } = {}) {
  const dir = path.dirname(file)
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  let handle = null
  try {
    await fs.promises.mkdir(dir, { recursive: true })
    handle = await fs.promises.open(tmp, 'w', mode ?? 0o666)
    await handle.writeFile(data)
    await handle.sync()          // bytes are on the platter, not just in cache
    await handle.close()
    handle = null
    // Preserve the original's permission bits: a rename replaces the inode, so
    // an executable script would silently lose its +x without this.
    if (mode != null) { try { await fs.promises.chmod(tmp, mode) } catch { /* best effort */ } }
    await fs.promises.rename(tmp, file)
  } catch (e) {
    if (handle) { try { await handle.close() } catch { /* closing a broken handle */ } }
    try { await fs.promises.unlink(tmp) } catch { /* nothing to clean */ }
    throw e
  }
}

/** The mode of an existing file, or null when it does not exist yet. */
async function existingMode(file) {
  try { return (await fs.promises.stat(file)).mode & 0o777 } catch { return null }
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Read a file and be HONEST about what came back.
 *
 * The old handler sliced the buffer at maxBytes and returned a bare string, so
 * a 4MB file arrived as its first 500KB with nothing to distinguish it from a
 * complete one — and the model then edited, or rewrote, from that belief. It
 * also cut the buffer mid-codepoint, putting a replacement character at the
 * boundary of every large file.
 *
 * @param {object} opts
 * @param {number} [opts.maxBytes]  byte ceiling for the whole-file path
 * @param {number} [opts.offset]    1-based first line, for a ranged read
 * @param {number} [opts.limit]     number of lines to return
 */
async function readFileSmart(file, { maxBytes = 500_000, offset = 0, limit = 0 } = {}) {
  const stat = await fs.promises.stat(file)
  if (stat.isDirectory()) throw new Error('Path is a directory, not a file')

  const buf = await fs.promises.readFile(file)
  const { text, encoding, bom, binary, readOnly } = decodeBuffer(buf)

  if (binary) {
    return {
      binary: true, truncated: false, bytes: stat.size, encoding, bom,
      content: '',
      note: `${path.basename(file)} is a binary file (${stat.size} bytes); its bytes were not decoded as text.`,
    }
  }

  const eol = detectEol(text)
  const base = {
    binary: false, bytes: stat.size, encoding, bom, eol: eol === '\r\n' ? 'crlf' : 'lf',
    readOnly: !!readOnly,
    hash: hashContent(buf),
    mtimeMs: stat.mtimeMs,
  }

  // Ranged read: the right way to work with a file too big to hand over whole.
  if (offset > 0 || limit > 0) {
    const lines = toLf(text).split('\n')
    const start = Math.max(0, (offset || 1) - 1)
    const end = limit > 0 ? Math.min(lines.length, start + limit) : lines.length
    return {
      ...base,
      content: lines.slice(start, end).join('\n'),
      lines: lines.length,
      range: { firstLine: start + 1, lastLine: end },
      truncated: end < lines.length || start > 0,
    }
  }

  if (buf.length > maxBytes) {
    // Cut on a LINE boundary inside the budget: a decoded string sliced at a
    // byte count can end mid-character, and half a line is worse than none.
    const head = buf.slice(0, maxBytes)
    const decodedHead = decodeBuffer(head).text
    const lastNl = decodedHead.lastIndexOf('\n')
    const content = lastNl > 0 ? decodedHead.slice(0, lastNl) : decodedHead
    return {
      ...base,
      content,
      truncated: true,
      lines: toLf(text).split('\n').length,
      note: `TRUNCATED: showing the first ${content.length} characters of ${stat.size} bytes. Read the rest with offset/limit — do NOT rewrite this file from what you have seen.`,
    }
  }

  return { ...base, content: text, truncated: false, lines: toLf(text).split('\n').length }
}

module.exports = {
  detectBom, decodeBuffer, encodeText, looksBinaryBuffer,
  detectEol, toLf, applyEol,
  countOccurrences, replaceAllLiteral, applyEdit,
  hashContent,
  writeFileAtomic, existingMode,
  readFileSmart,
}
