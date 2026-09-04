// Killing a process TREE, not just the shell that spawned it.
//
// `child.kill()` signals the SHELL only. On Windows, killing cmd.exe does not
// touch its children at all; on POSIX, SIGTERM to /bin/sh does not reach a
// grandchild. The survivor keeps the inherited stdio pipes open, so anything
// waiting on the child to close (a timeout, a "stop" button, app quit) can
// hang indefinitely against a process that is still very much alive — this is
// the exact, previously-fixed-once "terminal_run hung forever" bug
// (terminalSession.cjs's runBlock), and it applies to EVERY spawn in this app
// that wraps a command in a shell, not just that one call site.
//
// Shared by terminalSession.cjs (the agent/human shell) and bgProcesses.cjs
// (proc_start/proc_stop background processes) — a `proc_start`'d dev server
// stopped via `proc_stop` needs exactly the same tree-kill, or the port stays
// bound to an orphaned server after the tool reports success.
//
// The spawn that creates `child` MUST pass `detached: true` on POSIX for the
// process-group kill below to have a group to target at all — see runBlock
// and startProcess, both of which do.
const { spawn } = require('child_process')

function killTree(child) {
  if (!child?.pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      process.kill(-child.pid, 'SIGKILL')   // negative pid = the process GROUP
    }
  } catch { try { child.kill('SIGKILL') } catch { /* already gone */ } }
}

module.exports = { killTree }
