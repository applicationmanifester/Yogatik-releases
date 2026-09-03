// codebaseMapCore.cjs — the "instant whole-codebase awareness" feature.
//
// WHY THIS EXISTS: no model, however fast, can hold a huge repository in its
// context window at once — every provider has a hard token ceiling
// (compaction.js already budgets against it). Before this, the model's only
// way to learn a repo's shape was fs_list/fs_search round-trips, one file at
// a time — workable, but it feels slow on a first question about a big repo,
// and CLAUDE.md's own "instant learning" question came from exactly that.
//
// The real fix (the technique aider and similar tools use) is a REPO MAP: a
// compact index of every file's top-level exported symbols — not the file
// content — small enough to return from ONE tool call, so the model learns
// the whole shape of a codebase in one round trip and then reads full files
// only for the two or three that actually matter to the question at hand.
//
// Electron-free (no `require('electron')`) so vitest can reach it directly —
// same split as fsIndex.cjs/rootsCore.cjs and for the same reason: real fs
// walking and IPC live in codebaseMap.cjs, this file is pure string/regex
// logic over already-read file content, driven by INJECTED I/O so it is
// testable without a real disk.

/** Extensions this can pull symbols out of. Anything else is still LISTED
 *  (never silently dropped) but reported with no symbols. */
const SOURCE_EXTENSIONS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'go', 'rs', 'java', 'kt', 'cs', 'rb', 'php', 'c', 'cc', 'cpp', 'h', 'hpp', 'swift',
])

function extFor(relPath) {
  const m = /\.([A-Za-z0-9]+)$/.exec(relPath)
  return m ? m[1].toLowerCase() : ''
}

function isSourceFile(relPath) {
  return SOURCE_EXTENSIONS.has(extFor(relPath))
}

/**
 * Pull the alias (right-hand name) out of an `export { a, b as c }` clause.
 * `b as c` is exported AS `c` — that is the name a consumer actually imports,
 * so that is the name worth surfacing, not the local binding `b`.
 */
function namesFromExportList(inner) {
  return String(inner || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const asMatch = /^(.+?)\s+as\s+(.+)$/.exec(s)
      return (asMatch ? asMatch[2] : s).trim()
    })
    .filter(s => /^[A-Za-z_$][\w$]*$/.test(s))
}

/**
 * Best-effort, not a full parser — same discipline as this codebase's own
 * gitignore-glob translation and git-porcelain parsing: regex over real
 * syntax shapes, anchored to column 0 so a match INSIDE a function body
 * (indented) is never mistaken for a module-level export.
 */
function extractJsTsSymbols(content) {
  const names = new Set()
  const add = (n) => { if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n) }

  for (const m of content.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/gm)) add(m[1])
  for (const m of content.matchAll(/^export\s+default\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?/gm)) {
    add(m[1] ? m[1] : 'default')
  }
  for (const m of content.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1])
  for (const m of content.matchAll(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm)) add(m[1])
  for (const m of content.matchAll(/^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) add(m[1])
  for (const m of content.matchAll(/^export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1])
  for (const m of content.matchAll(/^export\s*\{([^}]*)\}/gm)) namesFromExportList(m[1]).forEach(add)
  for (const m of content.matchAll(/^module\.exports\.([A-Za-z_$][\w$]*)\s*=/gm)) add(m[1])
  for (const m of content.matchAll(/^exports\.([A-Za-z_$][\w$]*)\s*=/gm)) add(m[1])
  // `module.exports = { a, b: c, ... }` — best-effort destructure of a
  // single-object-literal export. A `require`d shorthand key or a `key: value`
  // pair both surface as the KEY, which is the name a consumer imports.
  const cjsDefault = /^module\.exports\s*=\s*\{([\s\S]*?)\n\}/m.exec(content) || /^module\.exports\s*=\s*\{([^}]*)\}/m.exec(content)
  if (cjsDefault) {
    for (const m of cjsDefault[1].matchAll(/(?:^|[,{\n])\s*([A-Za-z_$][\w$]*)\s*(?::|,|\n|$)/g)) add(m[1])
  }

  return [...names]
}

function extractPythonSymbols(content) {
  const names = new Set()
  for (const m of content.matchAll(/^def\s+([A-Za-z_]\w*)\s*\(/gm)) names.add(m[1])
  for (const m of content.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) names.add(m[1])
  return [...names]
}

function extractGoSymbols(content) {
  const names = new Set()
  // Exported Go identifiers are capitalized by language convention — that IS
  // the export mechanism, there is no separate `export` keyword.
  for (const m of content.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)\s*\(/gm)) names.add(m[1])
  for (const m of content.matchAll(/^type\s+([A-Z]\w*)\s+(?:struct|interface)\b/gm)) names.add(m[1])
  return [...names]
}

function extractRustSymbols(content) {
  const names = new Set()
  for (const m of content.matchAll(/^pub\s+(?:async\s+)?fn\s+([a-zA-Z_]\w*)/gm)) names.add(m[1])
  for (const m of content.matchAll(/^pub\s+struct\s+([A-Za-z_]\w*)/gm)) names.add(m[1])
  for (const m of content.matchAll(/^pub\s+enum\s+([A-Za-z_]\w*)/gm)) names.add(m[1])
  for (const m of content.matchAll(/^pub\s+trait\s+([A-Za-z_]\w*)/gm)) names.add(m[1])
  return [...names]
}

/**
 * @param {string} relPath repo-relative path (used only to pick the extractor)
 * @param {string} content file text, already read (and possibly capped) by the caller
 * @returns {string[]} exported/public top-level symbol names — [] means "no
 *   extractor for this language" or "genuinely nothing exported", the caller
 *   tells those apart by whether the extension is in SOURCE_EXTENSIONS.
 */
function extractSymbols(relPath, content) {
  if (!content) return []
  const ext = extFor(relPath)
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte'].includes(ext)) return extractJsTsSymbols(content)
  if (ext === 'py') return extractPythonSymbols(content)
  if (ext === 'go') return extractGoSymbols(content)
  if (ext === 'rs') return extractRustSymbols(content)
  // Java/C#/Kotlin/Ruby/PHP/C/C++/Swift: listed (never dropped) but with no
  // extracted symbols rather than a wrong guess from a pattern that does not
  // fit the language's real export/visibility rules.
  return []
}

/**
 * Render the collected per-file symbol lists into one compact text block,
 * budgeted like projectInstructions.js's budgetText — capped, and every
 * elision SAYS what it dropped rather than truncating silently.
 */
function formatMap(files, { maxChars = 80_000 } = {}) {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const lines = []
  let shown = 0
  for (const f of sorted) {
    const line = f.symbols && f.symbols.length
      ? `${f.path}: ${f.symbols.join(', ')}`
      : f.path
    // +1 for the newline this line will cost once joined.
    const nextLen = lines.reduce((n, l) => n + l.length + 1, 0) + line.length + 1
    if (nextLen > maxChars) break
    lines.push(line)
    shown++
  }
  const omitted = sorted.length - shown
  let text = lines.join('\n')
  if (omitted > 0) {
    text += `\n\n… ${omitted} more file${omitted === 1 ? '' : 's'} not shown (budget ${maxChars} chars). ` +
      'Call codebase_map again with a narrower `path` to map one subtree, or use fs_find_files/fs_search for the rest.'
  }
  return { text, shownCount: shown, omittedCount: Math.max(0, omitted) }
}

/**
 * Build the map. All I/O is injected so this is testable with fakes:
 * @param {object} io
 * @param {() => Promise<string[]>} io.listFiles resolves to repo-relative source-file paths (already skip-dir-filtered)
 * @param {(relPath: string) => Promise<string>} io.readFile resolves to that file's text (already capped by the caller)
 * @param {number} [maxFiles=600] hard cap on files actually read/parsed
 * @param {number} [maxChars=80000] hard cap on the rendered text
 * @param {number} [readConcurrency=24] bounded-parallel file reads
 */
async function buildCodebaseMap({ listFiles, readFile, maxFiles = 600, maxChars = 80_000, readConcurrency = 24 }) {
  const allPaths = (await listFiles()).filter(isSourceFile)
  const partial = allPaths.length > maxFiles
  const paths = allPaths.slice(0, maxFiles)

  const files = new Array(paths.length)
  let next = 0
  let readErrors = 0
  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= paths.length) return
      const p = paths[i]
      try {
        const content = await readFile(p)
        files[i] = { path: p, symbols: extractSymbols(p, content) }
      } catch {
        readErrors++
        files[i] = { path: p, symbols: [] }
      }
    }
  }
  const width = Math.min(readConcurrency, paths.length) || 1
  await Promise.all(Array.from({ length: width }, worker))

  const { text, shownCount, omittedCount } = formatMap(files, { maxChars })
  return {
    text,
    totalSourceFiles: allPaths.length,
    mappedFiles: shownCount,
    omittedByCharBudget: omittedCount,
    omittedByFileCap: partial ? allPaths.length - maxFiles : 0,
    readErrors,
    partial: partial || omittedCount > 0,
  }
}

module.exports = {
  SOURCE_EXTENSIONS, isSourceFile, extFor,
  extractSymbols, extractJsTsSymbols, extractPythonSymbols, extractGoSymbols, extractRustSymbols,
  namesFromExportList, formatMap, buildCodebaseMap,
}
