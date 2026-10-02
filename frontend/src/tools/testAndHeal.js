/**
 * testAndHeal.js — Autonomous Test Runner & Healing Loop Tool
 *
 * Runs project tests autonomously, extracts structured assertion failures and
 * diagnostic line numbers, and returns a decisive report so AI agents can
 * immediately fix and verify code without stopping to ask user permission.
 */

import { terminalRunTool } from './terminalRun'
import { parseTerminalDiagnostics } from './terminalDiagnostics'
import { isDesktop } from './localFs'

/**
 * Extracts structured assertion failures and failing test details from test runner output.
 * @param {string} rawOutput
 * @returns {Array<{ file?: string, title?: string, expected?: string, received?: string, message?: string, line?: number }>}
 */
export function extractAssertionFailures(rawOutput = '') {
  if (!rawOutput || typeof rawOutput !== 'string') return []
  const failures = []

  const chunks = rawOutput.split(/(?=(?:FAIL\s+|●\s+|FAILED\s+))/g)

  for (const chunk of chunks) {
    if (!/(?:FAIL|●|FAILED)/.test(chunk)) continue

    const fileMatch = chunk.match(/(?:FAIL\s+|FAILED\s+)?([a-zA-Z0-9_\-./\\]+\.(?:test|spec)\.[a-zA-Z0-9]+|[a-zA-Z0-9_\-./\\]+\.(?:py|go|rs))/i)
    const file = fileMatch ? fileMatch[1].replace(/\\/g, '/') : null

    const titleMatch = chunk.match(/(?:FAIL|●|FAILED)\s+(?:[^\n>]+>\s+)?([^\n]+)/)
    const title = titleMatch ? titleMatch[1].trim() : ''

    const expectedMatch = chunk.match(/(?:Expected|expected):\s*([^\n\r]+)/i)
    const receivedMatch = chunk.match(/(?:Received|actual):\s*([^\n\r]+)/i)
    const errorMatch = chunk.match(/(?:AssertionError|Error|assert\s+):\s*([^\n\r]+)/i)

    const stackMatch = chunk.match(/(?:at\s+[^\n]*\(([^:)]+):(\d+):(\d+)\)|at\s+([^:)\s]+):(\d+):(\d+)|❯\s+([^:)\s]+):(\d+):(\d+)|([^\s:]+\.py):(\d+):)/i)
    let line = null
    let stackFile = null
    if (stackMatch) {
      stackFile = (stackMatch[1] || stackMatch[4] || stackMatch[7] || stackMatch[10] || '').replace(/\\/g, '/')
      line = parseInt(stackMatch[2] || stackMatch[5] || stackMatch[8] || stackMatch[11] || '0', 10) || null
    }

    if (file || stackFile || errorMatch || title) {
      failures.push({
        file: file || stackFile || null,
        title: title || 'Test failure',
        line: line || null,
        expected: expectedMatch ? expectedMatch[1].trim() : null,
        received: receivedMatch ? receivedMatch[1].trim() : null,
        message: errorMatch ? errorMatch[1].trim() : null,
      })
    }
  }

  return failures.slice(0, 10)
}

export const testAndHealTool = {
  schema: {
    name: 'test_and_heal',
    description:
      'Autonomously execute the project test suite or build command (Vitest, Jest, Pytest, Go test, Cargo test, or npm test), ' +
      'extract structured assertion failures, test counts, and line diagnostics. ' +
      'Allows autonomous TDD and self-healing verification without prompting the user. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Test command to run (e.g. "npm test", "npx vitest run src/myTest.test.js", "pytest", "cargo test"). Defaults to "npm test" or targeted vitest if target_file is supplied.',
        },
        target_file: {
          type: 'string',
          description: 'Optional path of a specific test file to run (e.g. "src/tools/localFsEnhanced.test.js").',
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds (default 120000 / 2 minutes).',
        },
      },
    },
  },

  async execute({ command, target_file, timeout_ms = 120000 } = {}, opts = {}) {
    if (!isDesktop()) {
      return {
        tool: 'test_and_heal',
        passed: false,
        error: 'test_and_heal requires the Yogatik Desktop app with shell access.',
      }
    }

    let runCmd = command?.trim()
    if (!runCmd) {
      if (target_file) {
        runCmd = `npx vitest run ${target_file.replace(/\\/g, '/')}`
      } else {
        runCmd = 'npm test'
      }
    }

    const runResult = await terminalRunTool.execute(
      {
        command: runCmd,
        timeout_ms,
      },
      opts,
    )

    const rawOutput = `${runResult.stdout || ''}\n${runResult.stderr || ''}`
    const diagnostics = runResult.diagnostics?.length
      ? runResult.diagnostics
      : parseTerminalDiagnostics(rawOutput)

    const isExitSuccess = runResult.exit_code === 0
    const passIndicator = /\b(passed|all tests passed|success|ok)\b/i.test(rawOutput) && !/\b(failed|failure|errors?)\b/i.test(rawOutput)
    const passed = isExitSuccess && (passIndicator || !diagnostics.length)

    // Parse pass/fail numbers if present
    const testsPassedMatch = rawOutput.match(/Tests\s+(\d+)\s+passed/i) || rawOutput.match(/(\d+)\s+passed/i)
    const testsFailedMatch = rawOutput.match(/Tests\s+(\d+)\s+failed/i) || rawOutput.match(/(\d+)\s+failed/i)
    const passedCount = testsPassedMatch ? parseInt(testsPassedMatch[1], 10) : (passed ? 1 : 0)
    const failedCount = testsFailedMatch ? parseInt(testsFailedMatch[1], 10) : (passed ? 0 : (diagnostics.length || 1))

    const assertionFailures = extractAssertionFailures(rawOutput)

    if (passed) {
      return {
        tool: 'test_and_heal',
        passed: true,
        command: runCmd,
        exit_code: 0,
        passed_count: passedCount,
        failed_count: 0,
        diagnostics: [],
        assertion_failures: [],
        message: `✅ All tests passed cleanly (${passedCount} passed). No healing needed.`,
      }
    }

    return {
      tool: 'test_and_heal',
      passed: false,
      command: runCmd,
      exit_code: runResult.exit_code ?? 1,
      passed_count: passedCount,
      failed_count: failedCount,
      assertion_failures: assertionFailures,
      diagnostics: diagnostics.slice(0, 10),
      stdout_tail: (runResult.stdout || '').slice(-2000),
      stderr: (runResult.stderr || '').slice(-2000),
      message: `❌ Tests failed (${failedCount} failure(s)). Inspect assertion failures and diagnostics to fix target files autonomously.`,
    }
  },
}
