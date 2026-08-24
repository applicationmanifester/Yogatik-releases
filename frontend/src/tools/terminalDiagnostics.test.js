import { describe, it, expect } from 'vitest'
import { parseTerminalDiagnostics } from './terminalDiagnostics'

describe('terminalDiagnostics Extractor', () => {
  it('parses TypeScript compiler errors', () => {
    const raw = `
src/components/App.tsx:24:12 - error TS2304: Cannot find name 'unresolvedVar'.
src/utils/math.ts:50:5 - warning TS6133: 'unusedParam' is declared but its value is never read.
`
    const diags = parseTerminalDiagnostics(raw)
    expect(diags.length).toBe(2)
    expect(diags[0]).toEqual({
      file: 'src/components/App.tsx',
      line: 24,
      column: 12,
      severity: 'error',
      rule: 'TS2304',
      message: "Cannot find name 'unresolvedVar'.",
    })
    expect(diags[1].severity).toBe('warning')
    expect(diags[1].rule).toBe('TS6133')
  })

  it('parses Vitest / Jest failure stack traces', () => {
    const raw = `
FAIL src/tools/fsPatch.test.js > applyUnifiedPatch > fails on bad hunk
AssertionError: expected false to be true
 ❯ src/tools/fsPatch.test.js:45:10
     43| const res = applyUnifiedPatch(orig, patch)
     44| expect(res.ok).toBe(true)
`
    const diags = parseTerminalDiagnostics(raw)
    expect(diags.length).toBeGreaterThanOrEqual(1)
    expect(diags[0].file).toBe('src/tools/fsPatch.test.js')
    expect(diags[0].line).toBe(45)
    expect(diags[0].column).toBe(10)
    expect(diags[0].severity).toBe('error')
  })

  it('parses Python tracebacks', () => {
    const raw = `
Traceback (most recent call last):
  File "train.py", line 82, in run_epoch
    loss = criterion(preds, targets)
ValueError: Expected tensor of shape [32, 10] but got [32, 5]
`
    const diags = parseTerminalDiagnostics(raw)
    expect(diags.length).toBe(1)
    expect(diags[0].file).toBe('train.py')
    expect(diags[0].line).toBe(82)
    expect(diags[0].severity).toBe('error')
  })

  it('handles empty and clean outputs gracefully', () => {
    expect(parseTerminalDiagnostics('')).toEqual([])
    expect(parseTerminalDiagnostics(null)).toEqual([])
    expect(parseTerminalDiagnostics('Everything passed successfully! 100 tests passed.')).toEqual([])
  })
})
