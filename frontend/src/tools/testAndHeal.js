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

    if (passed) {
      return {
        tool: 'test_and_heal',
        passed: true,
        command: runCmd,
        exit_code: 0,
        passed_count: passedCount,
        failed_count: 0,
        diagnostics: [],
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
      diagnostics: diagnostics.slice(0, 10),
      stdout_tail: (runResult.stdout || '').slice(-2000),
      stderr: (runResult.stderr || '').slice(-2000),
      message: `❌ Tests failed (${failedCount} failure(s)). Inspect diagnostics and fix target files autonomously.`,
    }
  },
}
