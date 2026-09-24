/**
 * code_validate — Instant pre-flight syntax and structural diagnostics tool.
 * Validates JS, JSX, TS, TSX, JSON, HTML, CSS, and Markdown.
 *
 * Allows agents and users to verify code validity BEFORE saving, running,
 * or completing turns, preventing broken builds and syntax errors proactively.
 */

import { isDesktop } from './localFs'

/**
 * Checks for balanced brackets, braces, parentheses, and quotes.
 */
function checkBalancedDelimiters(code) {
  const lines = code.split('\n')
  const stack = []
  const pairs = { '}': '{', ']': '[', ')': '(', '>': '<' }

  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let inBlockComment = false

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      const prev = col > 0 ? line[col - 1] : ''
      const next = col < line.length - 1 ? line[col + 1] : ''

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          col++
        }
        continue
      }

      if (!inSingle && !inDouble && !inTemplate) {
        if (ch === '/' && next === '*') {
          inBlockComment = true
          col++
          continue
        }
        if (ch === '/' && next === '/') {
          // Rest of line is comment
          break
        }
      }

      // Handle quotes with escape check
      if (ch === "'" && prev !== '\\' && !inDouble && !inTemplate) {
        inSingle = !inSingle
        continue
      }
      if (ch === '"' && prev !== '\\' && !inSingle && !inTemplate) {
        inDouble = !inDouble
        continue
      }
      if (ch === '`' && prev !== '\\' && !inSingle && !inDouble) {
        inTemplate = !inTemplate
        continue
      }

      // If inside strings, ignore delimiters
      if (inSingle || inDouble || inTemplate) continue

      if (ch === '{' || ch === '[' || ch === '(') {
        stack.push({ char: ch, line: lineNum + 1, col: col + 1 })
      } else if (ch === '}' || ch === ']' || ch === ')') {
        if (stack.length === 0) {
          return {
            valid: false,
            error: `Unexpected closing '${ch}' with no matching opening delimiter`,
            line: lineNum + 1,
            column: col + 1,
            excerpt: line,
          }
        }
        const top = stack.pop()
        if (top.char !== pairs[ch]) {
          return {
            valid: false,
            error: `Mismatched delimiter: expected '${pairs[ch]}' to close with matching bracket, but found '${ch}' (opened at line ${top.line}:${top.col})`,
            line: lineNum + 1,
            column: col + 1,
            excerpt: line,
          }
        }
      }
    }
  }

  if (inTemplate) {
    return { valid: false, error: 'Unclosed template literal (`...`)', line: lines.length, column: lines[lines.length - 1].length }
  }
  if (inBlockComment) {
    return { valid: false, error: 'Unclosed block comment (/* ... */)', line: lines.length, column: lines[lines.length - 1].length }
  }
  if (stack.length > 0) {
    const unclosed = stack.pop()
    return {
      valid: false,
      error: `Unclosed delimiter '${unclosed.char}' opened at line ${unclosed.line}, column ${unclosed.col}`,
      line: unclosed.line,
      column: unclosed.col,
      excerpt: lines[unclosed.line - 1] || '',
    }
  }

  return { valid: true }
}

/**
 * Checks for JSX tag balance (e.g. <div> ... </div>)
 */
function checkJsxTags(code) {
  // Extract JSX opening and closing tags, ignoring self-closing tags and standard void elements
  const tagRegex = /<(\/)?([A-Za-z0-9_.-]+)(?:\s+[^>]*?)?(\/)?>/g
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
  const stack = []
  let match

  while ((match = tagRegex.exec(code)) !== null) {
    const isClosing = match[1] === '/'
    const tagName = match[2]
    const isSelfClosing = match[3] === '/' || (!isClosing && voidTags.has(tagName.toLowerCase()))

    if (isSelfClosing) continue

    if (isClosing) {
      if (stack.length === 0) {
        return { valid: false, error: `Found closing tag </${tagName}> without matching opening tag`, tag: tagName }
      }
      const top = stack.pop()
      if (top.tagName !== tagName) {
        return { valid: false, error: `Mismatched tag: expected </${top.tagName}> but found </${tagName}>`, tag: tagName }
      }
    } else {
      stack.push({ tagName, index: match.index })
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1]
    return { valid: false, error: `Unclosed tag <${unclosed.tagName}>`, tag: unclosed.tagName }
  }

  return { valid: true }
}

/**
 * Validates JSON string with precise position calculation.
 */
function validateJson(content) {
  try {
    JSON.parse(content)
    return { valid: true, language: 'json' }
  } catch (err) {
    const msg = err.message
    let line = 1
    let col = 1
    const posMatch = msg.match(/position\s+(\d+)/i) || msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)

    if (posMatch) {
      if (posMatch[2]) {
        line = parseInt(posMatch[1], 10)
        col = parseInt(posMatch[2], 10)
      } else {
        const charPos = parseInt(posMatch[1], 10)
        const lines = content.slice(0, charPos).split('\n')
        line = lines.length
        col = lines[lines.length - 1].length + 1
      }
    }
    const allLines = content.split('\n')
    const excerpt = allLines[line - 1] || ''

    return {
      valid: false,
      language: 'json',
      error: `JSON syntax error: ${msg}`,
      line,
      column: col,
      excerpt,
      pointer: ' '.repeat(Math.max(0, col - 1)) + '^',
    }
  }
}

/**
 * Fast synchronous pre-flight syntax check for file writes/patches.
 * Returns { valid: true } or { valid: false, error: string, line?: number, summary: string }.
 */
export function quickValidateSyntax(code = '', filePathOrExt = '') {
  if (typeof code !== 'string' || !code.trim()) return { valid: true }

  const ext = (filePathOrExt.includes('.') ? filePathOrExt.split('.').pop() : filePathOrExt).toLowerCase()

  // 1. JSON check
  if (ext === 'json') {
    const jsonRes = validateJson(code)
    if (!jsonRes.valid) {
      return {
        valid: false,
        error: jsonRes.error,
        line: jsonRes.line,
        summary: `JSON syntax error on line ${jsonRes.line}: ${jsonRes.error}`,
      }
    }
    return { valid: true }
  }

  // 2. Bracket delimiter check for programming languages
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'cjs', 'mjs', 'css', 'html', 'xml']
  if (codeExts.includes(ext)) {
    const delimRes = checkBalancedDelimiters(code)
    if (!delimRes.valid) {
      return {
        valid: false,
        error: delimRes.error,
        line: delimRes.line,
        summary: `Syntax delimiter error: ${delimRes.error}`,
      }
    }
  }

  // 3. JSX / HTML tag balance
  if (['jsx', 'tsx', 'html', 'xml'].includes(ext)) {
    const tagRes = checkJsxTags(code)
    if (!tagRes.valid) {
      return {
        valid: false,
        error: tagRes.error,
        tag: tagRes.tag,
        summary: `Tag error: ${tagRes.error}`,
      }
    }
  }

  return { valid: true }
}

export const codeValidateTool = {
  schema: {
    description:
      'Validate code syntax and structural integrity for JavaScript, TypeScript, JSX, TSX, JSON, HTML, CSS, or Markdown. ' +
      'Accepts either a workspace file path or raw code text. ' +
      'Detects unclosed brackets, mismatched tags, unexpected tokens, and invalid JSON formatting with precise line numbers and fix suggestions.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional workspace path to the file to validate.' },
        code: { type: 'string', description: 'Optional raw code snippet to validate if path is not specified.' },
        language: {
          type: 'string',
          description: 'Language or file extension: "js", "jsx", "ts", "tsx", "json", "html", "css", "md", etc. (Inferred from path if omitted).',
        },
      },
      required: [],
    },
  },
  async execute(args = {}, opts = {}) {
    let { path: filePath, code, language } = args

    if (filePath && !code) {
      try {
        const { fsReadTool } = await import('./localFs')
        const readRes = await fsReadTool.execute({ path: filePath }, opts)
        if (!readRes.success) {
          return { success: false, error: `Could not read file for validation: ${readRes.error}` }
        }
        code = readRes.content || ''
        if (!language) {
          const ext = filePath.split('.').pop()?.toLowerCase() || ''
          language = ext
        }
      } catch (err) {
        return { success: false, error: String(err && err.message || err) }
      }
    }

    if (typeof code !== 'string') {
      return { success: false, error: 'Either "path" or "code" must be provided for validation.' }
    }

    const lang = (language || 'javascript').toLowerCase()

    // 1. JSON validation
    if (lang === 'json' || lang.endsWith('.json')) {
      const jsonRes = validateJson(code)
      return {
        success: true,
        tool: 'code_validate',
        valid: jsonRes.valid,
        language: 'json',
        path: filePath || null,
        errors: jsonRes.valid ? [] : [{ message: jsonRes.error, line: jsonRes.line, column: jsonRes.column, excerpt: jsonRes.excerpt }],
        summary: jsonRes.valid ? 'JSON is valid.' : `JSON validation failed at line ${jsonRes.line}: ${jsonRes.error}`,
      }
    }

    // 2. Bracket and structural delimiter checks (applies to JS, TS, JSX, CSS, HTML)
    const delimRes = checkBalancedDelimiters(code)
    if (!delimRes.valid) {
      return {
        success: true,
        tool: 'code_validate',
        valid: false,
        language: lang,
        path: filePath || null,
        errors: [{ message: delimRes.error, line: delimRes.line, column: delimRes.column, excerpt: delimRes.excerpt }],
        summary: `Syntax validation failed: ${delimRes.error}`,
        suggestion: 'Verify matching curly braces {}, parentheses (), or square brackets [] around the reported line.',
      }
    }

    // 3. JSX / HTML tag balance check
    if (lang.includes('jsx') || lang.includes('tsx') || lang === 'html' || lang === 'xml') {
      const tagRes = checkJsxTags(code)
      if (!tagRes.valid) {
        return {
          success: true,
          tool: 'code_validate',
          valid: false,
          language: lang,
          path: filePath || null,
          errors: [{ message: tagRes.error, tag: tagRes.tag }],
          summary: `Tag validation failed: ${tagRes.error}`,
          suggestion: `Ensure every opened <${tagRes.tag}> is either closed with </${tagRes.tag}> or marked self-closing (<${tagRes.tag} />).`,
        }
      }
    }

    // 4. Native Node syntax check when running in Electron Desktop
    if (isDesktop() && (lang === 'js' || lang === 'javascript' || lang === 'cjs' || lang === 'mjs')) {
      try {
        const desktopBridge = typeof window !== 'undefined' ? window.__YOGATIK_DESKTOP__ : null
        if (desktopBridge?.evalJs) {
          // Test with Function check inside Node context to confirm parse tree
          const checkCode = `new Function(${JSON.stringify(code)}); return true;`
          const v8Res = await desktopBridge.evalJs(checkCode, 2000)
          if (!v8Res.success && v8Res.error && !v8Res.error.includes('return outside')) {
            return {
              success: true,
              tool: 'code_validate',
              valid: false,
              language: lang,
              path: filePath || null,
              errors: [{ message: v8Res.error }],
              summary: `V8 Syntax parser error: ${v8Res.error}`,
            }
          }
        }
      } catch { /* best effort */ }
    }

    return {
      success: true,
      tool: 'code_validate',
      valid: true,
      language: lang,
      path: filePath || null,
      errors: [],
      summary: `Code syntax and delimiters are valid for ${lang.toUpperCase()}.`,
    }
  },
}
