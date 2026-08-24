/**
 * codeOutline.js — High-Speed Code Outline & Symbol Extraction Engine.
 * Extracts functions, classes, interfaces, types, and exports across multiple languages
 * without full heavyweight language server overhead.
 */

/**
 * Extracts symbols from source code text based on file extension.
 * @param {string} text
 * @param {string} filenameOrExt
 * @returns {Array<{ name: string, kind: string, line: number, signature?: string }>}
 */
export function extractSymbolsFromCode(text = '', filenameOrExt = '') {
  if (!text || typeof text !== 'string') return []

  const ext = String(filenameOrExt).includes('.')
    ? filenameOrExt.split('.').pop().toLowerCase()
    : String(filenameOrExt).toLowerCase()

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const symbols = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const lineNum = i + 1

    // Skip empty lines and full line comments
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue
    }

    if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte'].includes(ext) || !ext) {
      // Functions
      const fnMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/)
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', line: lineNum, signature: `function ${fnMatch[1]}(${fnMatch[2]})` })
        continue
      }

      // Arrow / function expressions
      const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/)
      if (arrowMatch) {
        symbols.push({ name: arrowMatch[1], kind: 'function', line: lineNum, signature: arrowMatch[0] })
        continue
      }

      // Classes
      const classMatch = trimmed.match(/^(?:export\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+[a-zA-Z0-9_$]+)?/)
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', line: lineNum, signature: classMatch[0] })
        continue
      }

      // Interfaces & Types (TS)
      const tsMatch = trimmed.match(/^(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_$]+)/)
      if (tsMatch) {
        symbols.push({ name: tsMatch[1], kind: trimmed.includes('interface') ? 'interface' : 'type', line: lineNum, signature: tsMatch[0] })
        continue
      }
    }

    if (['py', 'python'].includes(ext)) {
      // Python def / class
      const pyFn = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/)
      if (pyFn) {
        symbols.push({ name: pyFn[1], kind: 'function', line: lineNum, signature: `def ${pyFn[1]}(${pyFn[2]})` })
        continue
      }
      const pyClass = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\([^)]*\))?:/)
      if (pyClass) {
        symbols.push({ name: pyClass[1], kind: 'class', line: lineNum, signature: pyClass[0] })
        continue
      }
    }

    if (['rs', 'rust'].includes(ext)) {
      // Rust fn, struct, enum, trait, impl
      const rsFn = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/)
      if (rsFn) {
        symbols.push({ name: rsFn[1], kind: 'function', line: lineNum, signature: trimmed.replace(/\{$/, '').trim() })
        continue
      }
      const rsType = trimmed.match(/^(?:pub\s+)?(struct|enum|trait|type)\s+([a-zA-Z0-9_]+)/)
      if (rsType) {
        symbols.push({ name: rsType[2], kind: rsType[1], line: lineNum, signature: rsType[0] })
        continue
      }
    }

    if (['go', 'golang'].includes(ext)) {
      // Go func / type
      const goFn = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/)
      if (goFn) {
        symbols.push({ name: goFn[1], kind: 'function', line: lineNum, signature: trimmed.replace(/\{$/, '').trim() })
        continue
      }
      const goType = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/)
      if (goType) {
        symbols.push({ name: goType[1], kind: goType[2], line: lineNum, signature: goType[0] })
        continue
      }
    }
  }

  return symbols
}

export const codeOutlineTool = {
  schema: {
    name: 'code_outline',
    description:
      'Extract a high-speed structured outline (functions, classes, interfaces, types, methods) ' +
      'from source code with exact line numbers for quick symbol inspection without reading whole files.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The source code text to outline.' },
        path: { type: 'string', description: 'File path or filename to determine syntax grammar (e.g. index.ts, model.py).' },
      },
      required: ['code'],
    },
  },

  async execute({ code, path = '' } = {}) {
    if (!code || typeof code !== 'string') {
      return { success: false, error: 'code string is required.' }
    }

    const symbols = extractSymbolsFromCode(code, path)
    return {
      success: true,
      tool: 'code_outline',
      path,
      symbolsCount: symbols.length,
      symbols,
    }
  },
}
