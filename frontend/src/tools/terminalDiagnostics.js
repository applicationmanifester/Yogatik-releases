/**
 * terminalDiagnostics.js — Semantic Compiler & Test Output Diagnostic Extractor
 *
 * Automatically parses raw compiler/linter/test outputs (Vitest, Jest, TypeScript tsc,
 * ESLint, Pytest, Python tracebacks, Rust Cargo, Go) into structured diagnostic objects:
 * { file, line, column, severity, rule, message, snippet }
 *
 * This allows coder agents to pinpoint syntax and logic errors in a single step
 * without parsing wall-of-text stderr.
 */

export function parseTerminalDiagnostics(output = '') {
  if (!output || typeof output !== 'string') return []
  const text = output.replace(/\u001b\[[0-9;]*m/g, '') // Strip ANSI colors
  const diagnostics = []
  const lines = text.split('\n')

  // 1. TypeScript / ESLint / GCC format: path/to/file.ts:12:34 - error TS2304: Cannot find name 'foo'
  const tsPattern = /([a-zA-Z0-9_.\-\/\\]+\.[a-zA-Z0-9]+):(\d+):(\d+)(?:\s*-\s*(error|warning)\s*([A-Z0-9_\-]+)?:?\s*(.*))?/i

  // 2. Vitest / Jest failure format: ❯ src/components/Foo.test.jsx:42:28
  const vitestPattern = /(?:❯|FAIL|Error:)\s+([a-zA-Z0-9_.\-\/\\]+\.[a-zA-Z0-9]+):(\d+):(\d+)/i

  // 3. Python traceback format: File "app.py", line 25, in <module>
  const pyPattern = /File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+([a-zA-Z0-9_<>]+))?/i

  // 4. Rust / Cargo format: --> src/main.rs:14:5
  const rustPattern = /-->\s+([a-zA-Z0-9_.\-\/\\]+\.[a-zA-Z0-9]+):(\d+):(\d+)/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Check TypeScript / GCC
    const tsMatch = line.match(tsPattern)
    if (tsMatch && !line.includes('node_modules')) {
      diagnostics.push({
        file: tsMatch[1].replace(/\\/g, '/'),
        line: parseInt(tsMatch[2], 10),
        column: parseInt(tsMatch[3], 10),
        severity: (tsMatch[4] || 'error').toLowerCase(),
        rule: tsMatch[5] || undefined,
        message: (tsMatch[6] || lines[i + 1] || '').trim(),
      })
      continue
    }

    // Check Vitest / Jest
    const vitestMatch = line.match(vitestPattern)
    if (vitestMatch && !line.includes('node_modules')) {
      const nextLine = lines[i + 1] ? lines[i + 1].trim() : ''
      diagnostics.push({
        file: vitestMatch[1].replace(/\\/g, '/'),
        line: parseInt(vitestMatch[2], 10),
        column: parseInt(vitestMatch[3], 10),
        severity: 'error',
        message: nextLine || 'Test assertion failure',
      })
      continue
    }

    // Check Python
    const pyMatch = line.match(pyPattern)
    if (pyMatch && !line.includes('site-packages')) {
      const nextLine = lines[i + 1] ? lines[i + 1].trim() : ''
      diagnostics.push({
        file: pyMatch[1].replace(/\\/g, '/'),
        line: parseInt(pyMatch[2], 10),
        column: 1,
        severity: 'error',
        message: nextLine || 'Python Exception',
      })
      continue
    }

    // Check Rust / Cargo
    const rustMatch = line.match(rustPattern)
    if (rustMatch) {
      const prevLine = lines[i - 1] ? lines[i - 1].trim() : ''
      diagnostics.push({
        file: rustMatch[1].replace(/\\/g, '/'),
        line: parseInt(rustMatch[2], 10),
        column: parseInt(rustMatch[3], 10),
        severity: 'error',
        message: prevLine || 'Rust compilation error',
      })
      continue
    }
  }

  // De-duplicate diagnostics on same file + line
  const seen = new Set()
  return diagnostics.filter(d => {
    const key = `${d.file}:${d.line}:${d.column}:${d.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 15) // Return top 15 most relevant
}
