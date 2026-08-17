// Interactive streaming terminal (PTY) — impossible in the browser and a step up
// from the one-shot terminal:exec: real shell sessions with stdin, streaming
// output and resize (live REPLs, `npm run dev` you can talk to, interactive git).
//
// node-pty is a NATIVE module and is loaded lazily in a try/catch. If it isn't
// installed (default), every handler returns a clear "unavailable" result and
// the app falls back to the existing one-shot terminal:exec — nothing breaks.
// To enable: `npm i node-pty` then `npx electron-rebuild -f -w node-pty`.
//
// Renderer bridge: window.__YOGATIK_PTY__.{available,spawn,write,resize,kill,onData,onExit}

const { ipcMain } = require('electron')
const path = require('path')
const { getGrantedRoot } = require('./fsBridge.cjs')

let pty = null
let ptyTried = false
const sessions = new Map() // id -> { proc }
let nextId = 1

function loadPty() {
  if (ptyTried) return pty
  ptyTried = true
  try { pty = require('node-pty') } catch { pty = null }
  return pty
}

function registerPty(getWindow) {
  ipcMain.handle('pty:available', () => Boolean(loadPty()))

  ipcMain.handle('pty:spawn', (_e, { cwd, cols = 80, rows = 24, shell } = {}) => {
    const mod = loadPty()
    if (!mod) return { success: false, error: 'PTY unavailable — node-pty is not installed. Use terminal_run instead.' }
    const root = getGrantedRoot() || process.cwd()
    const workingDir = cwd ? path.resolve(root, cwd) : root
    const shellCmd = shell || (process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash'))
    try {
      const proc = mod.spawn(shellCmd, [], {
        name: 'xterm-color', cols, rows, cwd: workingDir, env: process.env,
      })
      const id = `pty${nextId++}`
      proc.onData((data) => {
        const win = getWindow?.()
        if (win && !win.isDestroyed()) win.webContents.send('pty:data', { id, data })
      })
      proc.onExit(({ exitCode }) => {
        sessions.delete(id)
        const win = getWindow?.()
        if (win && !win.isDestroyed()) win.webContents.send('pty:exit', { id, exitCode })
      })
      sessions.set(id, { proc })
      return { success: true, id, shell: shellCmd, cwd: workingDir }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('pty:write', (_e, { id, data } = {}) => {
    const s = sessions.get(id)
    if (!s) return { success: false, error: 'No such session' }
    try { s.proc.write(data); return { success: true } } catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('pty:resize', (_e, { id, cols, rows } = {}) => {
    const s = sessions.get(id)
    if (!s) return { success: false, error: 'No such session' }
    try { s.proc.resize(cols, rows); return { success: true } } catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('pty:kill', (_e, id) => {
    const s = sessions.get(id)
    if (!s) return { success: false, error: 'No such session' }
    try { s.proc.kill() } catch { /* ignore */ }
    sessions.delete(id)
    return { success: true, id }
  })
}

function killAllPty() {
  for (const s of sessions.values()) { try { s.proc.kill() } catch { /* ignore */ } }
  sessions.clear()
}

module.exports = { registerPty, killAllPty }
