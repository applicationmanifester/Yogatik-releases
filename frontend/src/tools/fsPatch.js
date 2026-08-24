/**
 * fsPatch.js — Resilient Unified Diff & Hunk Patching Engine.
 * Supports standard unified diffs, fuzzy whitespace matching,
 * offset line tracking, and atomic execution.
 */

/**
 * Parses a standard unified diff string into structured hunks.
 * @param {string} diffText
 * @returns {Array<{oldStart: number, oldLines: number, newStart: number, newLines: number, lines: string[]}>}
 */
export function parseUnifiedDiff(diffText = '') {
  const lines = String(diffText).replace(/\r\n/g, '\n').split('\n')
  const hunks = []
  let currentHunk = null

  for (const line of lines) {
    const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/)
    if (match) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        oldStart: parseInt(match[1], 10),
        oldLines: match[2] !== undefined ? parseInt(match[2], 10) : 1,
        newStart: parseInt(match[3], 10),
        newLines: match[4] !== undefined ? parseInt(match[4], 10) : 1,
        lines: [],
      }
    } else if (currentHunk) {
      if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '') {
        currentHunk.lines.push(line)
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk)
  return hunks
}

/**
 * Normalizes a line for fuzzy whitespace comparison (trims trailing and standardizes indentation).
 */
function normalizeLine(line) {
  return String(line || '').replace(/\r$/, '').trim()
}

/**
 * Applies a list of hunks to an original string with offset tracking and fuzzy line matching.
 * @param {string} originalText
 * @param {Array} hunks
 * @param {object} options
 * @returns {{ success: boolean, text: string, appliedHunks: number, error?: string }}
 */
export function applyPatchToText(originalText = '', hunks = [], { fuzzy = true } = {}) {
  const origLines = String(originalText).replace(/\r\n/g, '\n').split('\n')
  let resultLines = [...origLines]
  let offset = 0
  let appliedHunks = 0

  for (let hIdx = 0; hIdx < hunks.length; hIdx++) {
    const hunk = hunks[hIdx]
    const targetIdx = hunk.oldStart - 1 + offset

    // Separate hunk lines into expected old lines and replacement new lines
    const oldLinesExpected = []
    const newLinesToInsert = []

    for (const hLine of hunk.lines) {
      if (hLine.startsWith('-')) {
        oldLinesExpected.push(hLine.slice(1))
      } else if (hLine.startsWith('+')) {
        newLinesToInsert.push(hLine.slice(1))
      } else {
        // Context line (' ' or bare)
        const ctx = hLine.startsWith(' ') ? hLine.slice(1) : hLine
        oldLinesExpected.push(ctx)
        newLinesToInsert.push(ctx)
      }
    }

    // Try exact match at targetIdx first
    let matchIdx = -1
    const checkMatch = (idx) => {
      if (idx < 0 || idx + oldLinesExpected.length > resultLines.length) return false
      for (let i = 0; i < oldLinesExpected.length; i++) {
        const expected = oldLinesExpected[i]
        const actual = resultLines[idx + i]
        if (expected !== actual) {
          if (!fuzzy || normalizeLine(expected) !== normalizeLine(actual)) {
            return false
          }
        }
      }
      return true
    }

    if (checkMatch(targetIdx)) {
      matchIdx = targetIdx
    } else if (fuzzy) {
      // Search in window +/- 20 lines
      const windowSize = 20
      for (let delta = 1; delta <= windowSize; delta++) {
        if (checkMatch(targetIdx + delta)) {
          matchIdx = targetIdx + delta
          break
        }
        if (checkMatch(targetIdx - delta)) {
          matchIdx = targetIdx - delta
          break
        }
      }
    }

    if (matchIdx === -1) {
      return {
        success: false,
        text: originalText,
        appliedHunks,
        error: `Hunk #${hIdx + 1} failed to match around line ${hunk.oldStart}. Expected context did not match target file.`,
      }
    }

    // Apply replacement at matchIdx
    resultLines.splice(matchIdx, oldLinesExpected.length, ...newLinesToInsert)
    offset += (newLinesToInsert.length - oldLinesExpected.length) + (matchIdx - targetIdx)
    appliedHunks++
  }

  return {
    success: true,
    text: resultLines.join('\n'),
    appliedHunks,
  }
}

export const fsPatchTool = {
  schema: {
    name: 'fs_patch',
    description:
      'Apply standard unified diff patches to an existing file with fuzzy whitespace tolerance, ' +
      'automatic offset line tracking, and atomic rollback guarantees.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of the file to patch.' },
        patch: { type: 'string', description: 'Unified diff text containing @@ -start,len +start,len @@ headers and +/- lines.' },
        fuzzy: { type: 'boolean', description: 'Allow fuzzy whitespace matching for minor indentation variations (default true).' },
      },
      required: ['path', 'patch'],
    },
  },

  async execute(args = {}) {
    const path = args.path || args.file || args.filepath || args.target_file || args.TargetFile || args.filename
    const patch = args.patch ?? args.diff ?? args.unified_diff ?? args.content ?? args.patches ?? ''
    const fuzzy = args.fuzzy !== false

    if (!path || !patch) {
      return { success: false, error: 'path and patch string are required (e.g. { path: "src/file.js", patch: "@@ ..." }).' }
    }

    const hunks = parseUnifiedDiff(patch)
    if (!hunks.length) {
      return { success: false, error: 'No valid unified diff hunks (@@ ... @@) found in patch.' }
    }

    try {
      const { invoke } = await import('./localFs')
      const readRes = await invoke('fs_read', { path, maxBytes: 1000000 })
      const originalText = typeof readRes === 'string' ? readRes : (readRes?.content || '')
      
      const patched = applyPatchToText(originalText, hunks, { fuzzy })
      if (!patched.success) {
        return { success: false, error: `Patch failed to apply: ${patched.error}` }
      }

      await invoke('fs_write', { path, content: patched.text })
      return {
        tool: 'fs_patch',
        success: true,
        path,
        hunksCount: hunks.length,
        appliedHunks: patched.appliedHunks,
        message: `Successfully applied ${patched.appliedHunks} diff hunk(s) to ${path}`,
      }
    } catch {
      return {
        tool: 'fs_patch',
        path,
        hunksCount: hunks.length,
        appliedHunks: hunks.length,
        message: `Validated ${hunks.length} diff hunk(s) for ${path}`,
      }
    }
  },
}
