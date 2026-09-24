import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testAndHealTool } from './testAndHeal'
import { terminalRunTool } from './terminalRun'

vi.mock('./localFs', () => ({
  isDesktop: vi.fn(() => true),
}))

vi.mock('./terminalRun', () => ({
  terminalRunTool: {
    execute: vi.fn(),
  },
}))

describe('testAndHealTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares valid schema properties', () => {
    expect(testAndHealTool.schema.name).toBe('test_and_heal')
    expect(testAndHealTool.schema.parameters.properties.command).toBeDefined()
    expect(testAndHealTool.schema.parameters.properties.target_file).toBeDefined()
  })

  it('returns success when test suite passes', async () => {
    terminalRunTool.execute.mockResolvedValueOnce({
      exit_code: 0,
      stdout: '✓ src/app.test.js (5 tests)\nTest Files 1 passed\nTests 5 passed',
      stderr: '',
      diagnostics: [],
    })

    const res = await testAndHealTool.execute({ command: 'npm test' })
    expect(res.passed).toBe(true)
    expect(res.exit_code).toBe(0)
    expect(res.passed_count).toBe(5)
    expect(res.failed_count).toBe(0)
  })

  it('extracts diagnostics when tests fail', async () => {
    terminalRunTool.execute.mockResolvedValueOnce({
      exit_code: 1,
      stdout: 'FAIL src/auth.test.js > login\nAssertionError: expected true to be false',
      stderr: 'src/auth.test.js:42:10',
      diagnostics: [
        { file: 'src/auth.test.js', line: 42, column: 10, severity: 'error', message: 'expected true to be false' },
      ],
    })

    const res = await testAndHealTool.execute({ command: 'npm test' })
    expect(res.passed).toBe(false)
    expect(res.exit_code).toBe(1)
    expect(res.diagnostics.length).toBeGreaterThan(0)
    expect(res.diagnostics[0].file).toBe('src/auth.test.js')
  })

  it('targets specific test file when provided without custom command', async () => {
    terminalRunTool.execute.mockResolvedValueOnce({
      exit_code: 0,
      stdout: '1 passed',
      stderr: '',
    })

    await testAndHealTool.execute({ target_file: 'src/tools/myTest.test.js' })
    expect(terminalRunTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npx vitest run src/tools/myTest.test.js',
      }),
      expect.anything(),
    )
  })
})
