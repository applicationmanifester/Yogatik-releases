// Process manager — list and (guardedly) kill OS processes. Impossible in the
// browser. Killing is the most sensitive capability exposed to the AI, so:
//   - our own PID and PID 0/4 (System) are never killable
//   - the renderer tool requires an explicit confirm flag before calling kill
//
// Renderer bridge: window.__YOGATIK_PROCESS__.{list,kill}

const { ipcMain } = require('electron')
const os = require('os')
const { exec } = require('child_process')

const PROTECTED_PIDS = new Set([0, 4, process.pid])

function listWindows() {
  return new Promise((resolve) => {
    // CSV: "Image Name","PID","Session Name","Session#","Mem Usage"
    exec('tasklist /FO CSV /NH', { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([])
      const rows = []
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^"([^"]*)","(\d+)","([^"]*)","(\d+)","([^"]*)"/)
        if (!m) continue
        rows.push({ name: m[1], pid: Number(m[2]), memory: m[5] })
      }
      resolve(rows)
    })
  })
}

function listUnix() {
  return new Promise((resolve) => {
    exec('ps -axo pid=,comm=,%mem=', { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve([])
      const rows = []
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+)\s+(.+?)\s+([\d.]+)$/)
        if (!m) continue
        rows.push({ name: m[2], pid: Number(m[1]), memory: `${m[3]}%` })
      }
      resolve(rows)
    })
  })
}

function registerProcesses() {
  ipcMain.handle('process:list', async (_e, { filter } = {}) => {
    try {
      let rows = os.platform() === 'win32' ? await listWindows() : await listUnix()
      if (filter) {
        const f = String(filter).toLowerCase()
        rows = rows.filter(r => r.name.toLowerCase().includes(f) || String(r.pid) === f)
      }
      return { success: true, count: rows.length, processes: rows.slice(0, 500) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('process:kill', async (_e, pid) => {
    const n = Number(pid)
    if (!Number.isInteger(n) || n <= 0) return { success: false, error: 'Invalid pid' }
    if (PROTECTED_PIDS.has(n)) return { success: false, error: `PID ${n} is protected and cannot be killed` }
    try {
      process.kill(n) // default SIGTERM; on Windows terminates the process
      return { success: true, pid: n }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerProcesses }
