/**
 * terminalRunTool — executes CLI shell commands in the desktop app's granted folder.
 */

import { isDesktop, getWorkspaceCtx } from './localFs'

export const terminalRunTool = {
  schema: {
    description:
      'Execute a terminal CLI command in this chat’s primary working folder. ' +
      'Use to run tests (npm test), build projects, check git status, or execute scripts. ' +
      'Returns stdout, stderr, and exit code. ' +
      'It WAITS for the command to finish and times out (default 30s), so it is the wrong tool ' +
      'for anything long-running: use proc_start for dev servers, watch-mode tests and streaming ' +
      'builds. Needs a working folder granted for this chat — if none is bound, ask the user to ' +
      'add one instead of concluding you cannot run commands. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The exact CLI command string to run.' },
        cwd: { type: 'string', description: 'Optional relative path for working directory.' },
        timeout: { type: 'number', description: 'Optional timeout in milliseconds (default 30000).' },
      },
      required: ['command'],
    },
  },
  async execute({ command, cwd, timeout = 30000 }) {
    if (!isDesktop()) {
      return { success: false, error: 'Terminal execution runs only in the Yogatik desktop app.' }
    }
    if (!window.__YOGATIK_TERMINAL__?.exec) {
      return { success: false, error: 'Terminal bridge is unavailable in this environment.' }
    }
    try {
      const res = await window.__YOGATIK_TERMINAL__.exec(command, { cwd, timeout, ctx: getWorkspaceCtx() })
      return {
        success: res.success,
        exitCode: res.exitCode,
        stdout: res.stdout || '(no output)',
        stderr: res.stderr || '',
        killed: res.killed || false,
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
