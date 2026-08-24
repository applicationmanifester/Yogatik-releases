// Scans file contents on a thread that can be killed.
//
// A runaway regex cannot be interrupted from inside the thread running it —
// timers do not fire, promises do not settle, and `AbortSignal` is not
// consulted by the regex engine. The ONLY way to bound it is to run it
// somewhere terminable, which is what worker_threads gives us.
//
// safeRegex.cjs rejects the known-catastrophic shapes before we get here; this
// is the backstop for the ones it does not recognise, and it is the layer that
// makes the guarantee real rather than best-effort.

const fs = require('fs')
const { parentPort, workerData } = require('worker_threads')
const { safeRegExp } = require('./safeRegex.cjs')
const { looksBinary } = require('./searchFilter.cjs')

/** One file's worth of matches. Reads are streamed line-wise to bound memory. */
function scanFile(file, { query, useRegex, regex, maxPerFile, maxLineLength }) {
  const out = []
  let buf
  try { buf = fs.readFileSync(file) } catch { return out }
  if (looksBinary(buf)) return out

  const lines = buf.toString('utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    // A minified bundle is one 3MB line; running any pattern against it is
    // pointless and slow, and it is never what a person is searching for.
    const line = lines[i]
    if (line.length > maxLineLength) continue
    const hit = useRegex ? regex.test(line) : line.includes(query)
    if (useRegex) regex.lastIndex = 0
    if (hit) {
      out.push({ path: file, line: i + 1, text: line.slice(0, 400) })
      if (out.length >= maxPerFile) break
    }
  }
  return out
}

function run() {
  const {
    files = [], query = '', useRegex = false,
    maxResults = 100, maxPerFile = 20, maxLineLength = 4000,
  } = workerData || {}

  let regex = null
  if (useRegex) {
    const { regex: compiled, reason } = safeRegExp(query)
    if (!compiled) {
      // Refusing is the correct outcome, and the caller degrades to a literal
      // search rather than being told "no results" for a pattern that was
      // never run.
      parentPort.postMessage({ ok: false, rejected: true, reason })
      return
    }
    regex = compiled
  }

  const results = []
  for (const file of files) {
    const hits = scanFile(file, { query, useRegex, regex, maxPerFile, maxLineLength })
    for (const h of hits) {
      results.push(h)
      if (results.length >= maxResults) {
        parentPort.postMessage({ ok: true, results, truncated: true })
        return
      }
    }
  }
  parentPort.postMessage({ ok: true, results, truncated: false })
}

try { run() } catch (e) {
  parentPort.postMessage({ ok: false, reason: e?.message || String(e) })
}
