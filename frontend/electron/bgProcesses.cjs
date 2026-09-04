// Long-running processes + the hooks runner. Both spawn, so they share a file.
//
// Every process is bound to the CHAT that started it and runs in that chat's
// primary working folder — never process.cwd(), which is the app's own install
// directory. Processes are killed when the app quits so nothing is orphaned.

const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { createRingBuffer, createRegistry } = require('./procCore.cjs')
const { parseHooksFile, matchHooks, hooksEnabledFor } = require('./hooksCore.cjs')
const { killTree } = require('./procKill.cjs')

const registry = createRegistry({ maxPerChat: 8 })
let seq = 0

const IS_WIN = process.platform === 'win32'

function shellFor(command) {
  return IS_WIN
    ? { cmd: 'cmd.exe', args: ['/d', '/s', '/c', command] }
    : { cmd: '/bin/sh', args: ['-c', command] }
}

/** Start a detached-from-the-turn process. Returns a handle immediately. */
function startProcess({ chatId, command, cwd }) {
  if (!registry.canAdd(chatId)) {
    return { success: false, error: 'Too many background processes for this chat. Stop one first.' }
  }
  seq += 1
  const id = `proc_${Date.now().toString(36)}_${seq}`
  const out = createRingBuffer(200000)
  const { cmd, args } = shellFor(command)

  let child
  try {
    child = spawn(cmd, args, {
      cwd, windowsHide: true, env: { ...process.env },
      // POSIX: its own process GROUP, so proc_stop (and killAllBgProcesses on
      // quit) can kill the whole tree rather than just this shell — without
      // it there is no group for `process.kill(-pid, ...)` in procKill.cjs to
      // target at all, and a dev server spawned through the shell survives
      // "stopping" it, still bound to its port.
      detached: !IS_WIN,
    })
  } catch (e) {
    return { success: false, error: e.message }
  }

  const entry = {
    id, chatId: String(chatId ?? ''), command, cwd,
    startedAt: Date.now(), exitCode: null, running: true, out, child,
  }
  child.stdout?.on('data', d => out.push(d.toString('utf8')))
  child.stderr?.on('data', d => out.push(d.toString('utf8')))
  child.on('error', e => { out.push(`\n[process error] ${e.message}\n`); entry.running = false })
  child.on('close', code => { entry.exitCode = code; entry.running = false })

  registry.add(entry)
  return { success: true, id, command, cwd }
}

function readProcess(id, cursor) {
  const p = registry.get(id)
  if (!p) return { success: false, error: 'No such process.' }
  const text = cursor == null ? p.out.text() : p.out.since(cursor)
  return {
    success: true,
    id: p.id,
    running: p.running,
    exitCode: p.exitCode,
    truncated: p.out.truncated(),
    cursor: p.out.cursor(),
    output: text,
  }
}

function stopProcess(id) {
  const p = registry.get(id)
  if (!p) return { success: false, error: 'No such process.' }
  // killTree, not p.child.kill() — the process is spawned through a shell
  // (cmd.exe /c or sh -c), and a plain kill only signals that shell. The real
  // command (a dev server, a watcher) is a CHILD of it and survives, still
  // holding its port, while proc_stop reports success.
  killTree(p.child)
  p.running = false
  registry.remove(id)
  return { success: true, id }
}

function listProcesses(chatId) {
  return registry.list(chatId).map(p => ({
    id: p.id, command: p.command, running: p.running,
    exitCode: p.exitCode, startedAt: p.startedAt,
  }))
}

function killAllBgProcesses() {
  // Same reasoning as stopProcess: a plain kill() on quit leaves every
  // proc_start'd dev server / watcher running as an orphan, still bound to
  // its port, after the Yogatik window itself is gone.
  for (const p of registry.all()) {
    try { killTree(p.child) } catch { /* ignore */ }
  }
}

// ── Hooks ───────────────────────────────────────────────────────────────────

function loadHooks(rootPath) {
  try {
    return parseHooksFile(fs.readFileSync(path.join(rootPath, '.yogatik', 'hooks.json'), 'utf8'))
  } catch { return [] }
}

/**
 * Run the hooks matching an event. Silently does nothing unless the user has
 * explicitly trusted this root — a hooks file arrives inside a repository, and
 * cloning a project must never be enough to execute commands.
 */
function runHooks({ trustState, rootPath, event, toolName, payload }) {
  if (!rootPath || !hooksEnabledFor(trustState, rootPath)) return []
  const hooks = matchHooks(loadHooks(rootPath), event, toolName)
  const started = []
  for (const h of hooks) {
    const { cmd, args } = shellFor(h.command)
    try {
      const child = spawn(cmd, args, { cwd: rootPath, windowsHide: true, env: { ...process.env }, detached: !IS_WIN })
      try {
        child.stdin?.write(JSON.stringify({ event, tool: toolName, payload }))
        child.stdin?.end()
      } catch { /* hook may not read stdin */ }
      // killTree: a hook that shells out to its own long-running command (a
      // watcher, a linter daemon) must not survive its own timeout the same
      // way a stray dev server could survive proc_stop.
      const timer = setTimeout(() => killTree(child), h.timeout)
      timer.unref?.()
      child.on('close', () => clearTimeout(timer))
      started.push(h.command)
    } catch { /* a broken hook must not break the turn */ }
  }
  return started
}

function registerBgProcessIpc({ rootPathsFor, resolvePath, getTrustState }) {
  ipcMain.handle('proc_start', (_e, { ctx, command, cwd } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) {
      return { success: false, error: 'No working folder for this chat. Ask the user to add one.' }
    }
    let workingDir
    try { workingDir = resolvePath(ctx, cwd || '.') }
    catch (e) { return { success: false, error: `Invalid working directory: ${e.message}` } }
    return startProcess({ chatId: ctx?.conversationId, command, cwd: workingDir })
  })

  ipcMain.handle('proc_output', (_e, { id, cursor } = {}) => readProcess(id, cursor))
  ipcMain.handle('proc_stop', (_e, { id } = {}) => stopProcess(id))
  ipcMain.handle('proc_list', (_e, { ctx } = {}) => listProcesses(ctx?.conversationId))

  ipcMain.handle('hooks_run', (_e, { ctx, event, toolName, payload } = {}) => {
    const roots = rootPathsFor(ctx)
    return runHooks({
      trustState: getTrustState ? getTrustState() : {},
      rootPath: roots[0] || null,
      event, toolName, payload,
    })
  })

  ipcMain.handle('hooks_list', (_e, { ctx } = {}) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) return { trusted: false, hooks: [] }
    const trustState = getTrustState ? getTrustState() : {}
    return {
      trusted: hooksEnabledFor(trustState, roots[0]),
      root: roots[0],
      hooks: loadHooks(roots[0]).map(h => ({ event: h.event, match: h.match, command: h.command })),
    }
  })
}

module.exports = {
  registerBgProcessIpc, startProcess, readProcess, stopProcess, listProcesses,
  killAllBgProcesses, runHooks, loadHooks,
}
