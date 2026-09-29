/**
 * Smart filesystem tools: fs_outline and fs_smart_read.
 * Provides high-speed semantic symbol outlining and symbol-targeted or high-capacity single-pass file reading.
 */

import { invoke, ok, fail, guard, isDesktop } from './localFs'

/**
 * Lightweight regex-based AST/symbol extractor for JS/TS, Python, HTML/CSS, Go, Rust, and C/C++.
 */
export function extractFileSymbols(content, ext = '') {
  if (typeof content !== 'string') return []
  const lines = content.split(/\r?\n/)
  const symbols = []

  const jsLike = !ext || /^\.?(js|jsx|ts|tsx|mjs|cjs)$/i.test(ext)
  const pyLike = /^\.?(py|pyw)$/i.test(ext)
  const rustLike = /^\.?(rs)$/i.test(ext)
  const goLike = /^\.?(go)$/i.test(ext)

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i].trim()
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) continue

    if (jsLike) {
      // Functions / Arrow functions / Components
      const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/)
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], type: 'function', line: lineNum, signature: `function ${funcMatch[1]}(${funcMatch[2]})` })
        continue
      }
      const constMatch = line.match(/^(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:React\.(?:memo|forwardRef)\()?(?:async\s*)?(?:\(([^)]*)\)|([a-zA-Z0-9_$]+))\s*=>/)
      if (constMatch) {
        const name = constMatch[1]
        const params = constMatch[2] || constMatch[3] || ''
        const isComponent = /^[A-Z]/.test(name)
        symbols.push({ name, type: isComponent ? 'component' : 'function', line: lineNum, signature: `const ${name} = (${params}) =>` })
        continue
      }
      // Classes
      const classMatch = line.match(/^(?:export\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$.]+))?/)
      if (classMatch) {
        symbols.push({ name: classMatch[1], type: 'class', line: lineNum, signature: `class ${classMatch[1]}${classMatch[2] ? ` extends ${classMatch[2]}` : ''}` })
        continue
      }
    }

    if (pyLike) {
      const defMatch = line.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/)
      if (defMatch) {
        symbols.push({ name: defMatch[1], type: 'function', line: lineNum, signature: `def ${defMatch[1]}(${defMatch[2]})` })
        continue
      }
      const pyClass = line.match(/^class\s+([a-zA-Z0-9_]+)(?:\(([^)]*)\))?:/)
      if (pyClass) {
        symbols.push({ name: pyClass[1], type: 'class', line: lineNum, signature: `class ${pyClass[1]}` })
        continue
      }
    }

    if (rustLike) {
      const fnMatch = line.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/)
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], type: 'function', line: lineNum, signature: `fn ${fnMatch[1]}(${fnMatch[2]})` })
        continue
      }
      const structMatch = line.match(/^(?:pub\s+)?(?:struct|enum|trait)\s+([a-zA-Z0-9_]+)/)
      if (structMatch) {
        symbols.push({ name: structMatch[1], type: 'type', line: lineNum, signature: line.slice(0, 60) })
        continue
      }
    }

    if (goLike) {
      const goFn = line.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/)
      if (goFn) {
        symbols.push({ name: goFn[1], type: 'function', line: lineNum, signature: `func ${goFn[1]}(${goFn[2]})` })
        continue
      }
    }
  }

  return symbols
}

/**
 * fs_outline tool — Generates an instant semantic structural outline of functions, classes, and components.
 */
export const fsOutlineTool = {
  schema: {
    description: 'Get an instant structural outline (functions, classes, components, line numbers) of a source code file in 1 single pass without reading thousands of lines. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the source file (e.g. "src/App.jsx" or "weather.js").' },
      },
      required: ['path'],
    },
  },
  async execute({ path } = {}, opts = {}) {
    if (!path) return fail('path is required')
    return guard(async () => {
      const res = await invoke('fs_read', { path, maxBytes: 2000000 }, opts?.ctx)
      const content = typeof res === 'string' ? res : (res?.content || '')
      const ext = path.split('.').pop() || ''
      const symbols = extractFileSymbols(content, ext)
      const allLines = content ? content.split(/\r?\n/) : []
      // True total from the native read — allLines is only the readable head
      // when the byte budget truncated the file.
      const trueTotal = Number(res?.lines) > 0 ? Number(res?.lines) : allLines.length
      const headTruncated = !!res?.truncated

      return ok({
        tool: 'fs_outline',
        path,
        totalLines: trueTotal,
        symbolCount: symbols.length,
        symbols,
        truncated: headTruncated,
        ...(headTruncated ? {
          note: `OUTLINE PARTIAL: symbols cover lines 1-${allLines.length} of ${trueTotal} total (fs_read's byte cap). Read deeper with fs_read(path, start_line: ${allLines.length + 1}) for the rest.`,
        } : {}),
        summary: `Found ${symbols.length} definitions across ${allLines.length}${headTruncated ? ` of ${trueTotal}` : ''} lines in ${path}. Use fs_smart_read(path, symbol) to inspect specific functions.`,
      })
    })
  },
}

/**
 * fs_smart_read tool — Reads files by symbol name or line ranges with up to 1,500 lines per call.
 */
export const fsSmartReadTool = {
  schema: {
    description: 'Smart code reader. Reads a file by symbol name (e.g. symbol: "handleClick") or high-capacity line ranges (up to 1500 lines per read) with line numbering. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file.' },
        symbol: { type: 'string', description: 'Optional function or class name to read directly.' },
        start_line: { type: 'number', description: 'Optional 1-indexed start line number.' },
        end_line: { type: 'number', description: 'Optional 1-indexed end line number.' },
        max_lines: { type: 'number', description: 'Max lines to return (default 1000, max 1500).' },
      },
      required: ['path'],
    },
  },
  async execute(args = {}, opts = {}) {
    const path = args.path || args.file || args.filepath || args.target
    const symbol = args.symbol || args.function || args.class || args.component || args.name
    const rawStart = args.start_line ?? args.offset ?? args.line_start ?? args.startLine ?? args.offset_lines ?? args.from_line
    const rawEnd = args.end_line ?? args.endLine ?? args.line_end ?? args.to_line
    const rawLimit = args.max_lines ?? args.limit ?? args.length ?? args.lines ?? args.count ?? 1000

    if (!path) return fail('path is required')
    return guard(async () => {
      const res = await invoke('fs_read', { path, maxBytes: 5000000 }, opts?.ctx)
      const content = typeof res === 'string' ? res : (res?.content || '')
      if (!content) {
        if (res?.binary) return ok({ tool: 'fs_smart_read', path, binary: true, note: res?.note })
        return ok({ tool: 'fs_smart_read', path, lines: 0, content: '' })
      }

      const allLines = content.split(/\r?\n/)
      // The native read knows the TRUE line count even when it truncated the
      // head to fit its byte budget — allLines.length is only the head.
      const trueTotal = Number(res?.lines) > 0 ? Number(res?.lines) : allLines.length
      const headTruncated = !!res?.truncated
      const readableEnd = headTruncated ? allLines.length : trueTotal

      // 1. Symbol targeted read
      if (symbol) {
        const cleanSym = String(symbol).trim()
        const symbols = extractFileSymbols(content, path.split('.').pop() || '')
        const target = symbols.find(s => s.name.toLowerCase() === cleanSym.toLowerCase())
        if (target) {
          // Read until the NEXT definition so a whole function comes back,
          // capped by max_lines — a blind +150 cut long functions mid-body
          // with no note.
          const cap = Math.min(Math.max(50, Number(rawLimit) || 1000), 1500)
          const nextSym = symbols.filter(s => s.line > target.line).sort((a, b) => a.line - b.line)[0]
          const naturalEnd = nextSym ? nextSym.line - 1 : target.line + cap
          const sLine = Math.max(1, target.line - 1)
          const eLine = Math.min(naturalEnd, sLine - 1 + cap, readableEnd)
          const sliced = allLines.slice(sLine - 1, eLine).map((l, idx) => `${sLine + idx}: ${l}`).join('\n')
          const cutEarly = eLine < naturalEnd
          return ok({
            tool: 'fs_smart_read',
            path,
            targetSymbol: target.name,
            symbolType: target.type,
            startLine: sLine,
            endLine: eLine,
            totalLines: trueTotal,
            returnedLines: eLine - sLine + 1,
            truncated: cutEarly,
            ...(cutEarly ? {
              note: (headTruncated && eLine >= readableEnd)
                ? `Read stopped at line ${eLine}: the readable head ends here (file has ${trueTotal} lines total; fs_read's byte cap). Read deeper with fs_read(path, start_line: ${readableEnd + 1}) then retry.`
                : `Symbol body continues past line ${eLine} (ends ~line ${naturalEnd}). Continue with fs_smart_read(path, start_line: ${eLine + 1}).`,
            } : {}),
            content: sliced,
          })
        }
        // Symbol not found in the readable head of a truncated file: say WHY
        // instead of silently reading the wrong range.
        if (headTruncated) {
          return fail(`Symbol "${String(symbol).trim()}" was not found in the readable head (lines 1-${allLines.length} of ${trueTotal} total — fs_read's byte cap truncated the file). Read deeper with fs_read(path, start_line: ${allLines.length + 1}), or use fs_search to locate it first.`)
        }
      }

      // 2. Range or full read (up to 1500 lines)
      const s = Number(rawStart) > 0 ? Number(rawStart) : 1
      const cap = Math.min(Math.max(50, Number(rawLimit) || 1000), 1500)
      // A start past what is readable must fail LOUDLY — silently returning
      // empty content made the model believe the file ended.
      if (s > readableEnd) {
        return fail(headTruncated
          ? `start_line ${s} is past the readable head (lines 1-${allLines.length} of ${trueTotal} total — the file was truncated by fs_read's byte cap). Read deeper with fs_read(path, start_line: ${allLines.length + 1}) first.`
          : `start_line ${s} is past the end of the file (${trueTotal} lines).`)
      }
      const e = rawEnd ? Math.min(readableEnd, Number(rawEnd)) : Math.min(readableEnd, s + cap - 1)

      const formatted = allLines.slice(s - 1, e).map((l, idx) => `${s + idx}: ${l}`).join('\n')
      return ok({
        tool: 'fs_smart_read',
        path,
        startLine: s,
        endLine: e,
        totalLines: trueTotal,
        returnedLines: (e - s + 1),
        truncated: e < trueTotal,
        ...(headTruncated ? {
          note: `The readable head covers lines 1-${allLines.length} of ${trueTotal} total (fs_read's byte cap). Read deeper sections with fs_read(path, start_line: ${allLines.length + 1}).`,
        } : (e < trueTotal ? {
          note: `Lines ${s}-${e} of ${trueTotal}. Continue with fs_smart_read(path, start_line: ${e + 1}).`,
        } : {})),
        content: formatted,
      })
    })
  },
}
