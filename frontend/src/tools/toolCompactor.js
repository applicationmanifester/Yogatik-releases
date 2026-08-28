/**
 * toolCompactor.js — Structural and semantic compaction of tool outputs for LLM context windows.
 * Replaces crude character slicing with structured array/object compaction that preserves
 * critical schema hierarchy, headers, and head/tail items.
 */

const HEAVY_KEY_PATTERN = /data_?url|dataurl|base64|blob|rawbuffer|audiobuffer|screenshot|image|photo|pdf_data|pptx_data/i

/**
 * Recursively strip oversized binary/image/data-URL data from tool output objects.
 */
export function stripHeavyFields(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(item => stripHeavyFields(item, depth + 1))

  const clean = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if ((HEAVY_KEY_PATTERN.test(k) || v.startsWith('data:')) && v.length > 150) {
        clean[k] = `[${k} binary omitted (${Math.round(v.length / 1024)} KB - rendered in UI)]`
        continue
      }
    }
    clean[k] = stripHeavyFields(v, depth + 1)
  }
  return clean
}

/**
 * Compact large tool payloads to fit within character constraints while preserving structure.
 *
 * @param {any} result - The tool execution result
 * @param {number} [maxChars=12000] - Maximum allowed character length
 * @returns {string} Clean, compact JSON or string representation
 */
export function compactToolResult(result, maxChars = 12000) {
  if (result === undefined || result === null) return ''
  if (typeof result === 'string') {
    if (result.length <= maxChars) return result
    const head = result.slice(0, Math.floor(maxChars * 0.75))
    const tail = result.slice(-Math.floor(maxChars * 0.2))
    return `${head}\n\n... [${result.length - head.length - tail.length} characters compacted] ...\n\n${tail}`
  }

  // 1. Strip binary data
  let cleaned = stripHeavyFields(result)

  // 2. Compact large arrays inside result
  if (Array.isArray(cleaned) && cleaned.length > 25) {
    cleaned = [
      ...cleaned.slice(0, 15),
      { _compacted: `[... ${cleaned.length - 20} items omitted for context efficiency ...]` },
      ...cleaned.slice(-5),
    ]
  } else if (typeof cleaned === 'object') {
    for (const [k, v] of Object.entries(cleaned)) {
      if (Array.isArray(v) && v.length > 25) {
        cleaned[k] = [
          ...v.slice(0, 15),
          { _compacted: `[... ${v.length - 20} items omitted for context efficiency ...]` },
          ...v.slice(-5),
        ]
      }
    }
  }

  let jsonStr = ''
  try {
    jsonStr = JSON.stringify(cleaned)
  } catch {
    jsonStr = String(cleaned)
  }

  if (jsonStr.length <= maxChars) return jsonStr

  // Fallback head/tail string compaction for very dense JSON objects
  const head = jsonStr.slice(0, Math.floor(maxChars * 0.8))
  return `${head} ... [output truncated to fit token window]}`
}
