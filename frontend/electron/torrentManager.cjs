// Background BitTorrent Engine for Yogatik Desktop
// Uses WebTorrent to manage P2P swarms, DHT, trackers, and disk piece storage.
// Runs purely inside Electron Node.js main process.

const { ipcMain, app, shell } = require('electron')
const path = require('path')
const fs = require('fs')

let client = null
let WebTorrentClass = null
let statusTimer = null

// Map of infoHash -> { torrent, paused, customPath, addedAt }
const activeTorrents = new Map()

async function getWebTorrentClient() {
  if (client) return client
  if (!WebTorrentClass) {
    const mod = await import('webtorrent')
    WebTorrentClass = mod.default || mod
  }
  client = new WebTorrentClass({
    // Standard TCP BitTorrent & UDP Trackers + DHT enabled
    dht: true,
    tracker: true,
    lsd: true,
  })

  client.on('error', (err) => {
    console.error('[Yogatik BitTorrent] Client error:', err?.message || err)
  })

  return client
}

function formatTorrentData(t, isPaused = false) {
  if (!t) return null
  return {
    name: t.name || 'Retrieving metadata...',
    infoHash: t.infoHash,
    magnetURI: t.magnetURI,
    progress: Math.min(1, Math.max(0, t.progress || 0)),
    downloaded: t.downloaded || 0,
    uploaded: t.uploaded || 0,
    downloadSpeed: isPaused ? 0 : (t.downloadSpeed || 0),
    uploadSpeed: isPaused ? 0 : (t.uploadSpeed || 0),
    numPeers: isPaused ? 0 : (t.numPeers || 0),
    length: t.length || 0,
    timeRemaining: isPaused ? Infinity : (t.timeRemaining || 0),
    done: Boolean(t.done),
    paused: Boolean(isPaused),
    path: t.path || '',
    files: (t.files || []).map(f => ({
      name: f.name,
      path: f.path,
      length: f.length,
      downloaded: f.downloaded,
      progress: f.progress
    }))
  }
}

function startBroadcasting(getWindow) {
  if (statusTimer) return
  statusTimer = setInterval(() => {
    if (!activeTorrents.size) return
    const win = getWindow?.()
    if (!win || win.isDestroyed()) return

    const list = []
    for (const [infoHash, record] of activeTorrents.entries()) {
      if (record.torrent) {
        list.push(formatTorrentData(record.torrent, record.paused))
      }
    }
    try {
      win.webContents.send('torrent:update', list)
    } catch {
      // window closed or navigating
    }
  }, 1000)
}

function registerTorrentIpc(getWindow) {
  ipcMain.handle('torrent:getDefaultPath', () => {
    try {
      return app.getPath('downloads')
    } catch {
      return path.join(app.getPath('home'), 'Downloads')
    }
  })

  ipcMain.handle('torrent:add', async (_e, { uri, downloadPath } = {}) => {
    if (!uri || typeof uri !== 'string') {
      return { success: false, error: 'A valid Magnet URI or .torrent file path is required.' }
    }

    const trimmed = uri.trim()
    const targetDir = downloadPath && typeof downloadPath === 'string' && downloadPath.trim()
      ? path.resolve(downloadPath.trim())
      : app.getPath('downloads')

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
    } catch (err) {
      return { success: false, error: `Failed to access target folder: ${err.message}` }
    }

    try {
      const torrentClient = await getWebTorrentClient()

      return new Promise((resolve) => {
        let settled = false

        torrentClient.add(trimmed, { path: targetDir }, (torrent) => {
          activeTorrents.set(torrent.infoHash, {
            torrent,
            paused: false,
            customPath: targetDir,
            addedAt: Date.now()
          })

          startBroadcasting(getWindow)

          if (!settled) {
            settled = true
            resolve({
              success: true,
              infoHash: torrent.infoHash,
              torrent: formatTorrentData(torrent, false)
            })
          }
        })

        torrentClient.on('error', (err) => {
          if (!settled) {
            settled = true
            resolve({ success: false, error: err.message || 'BitTorrent client error' })
          }
        })

        // Timeout fallback if metadata resolution takes a few seconds
        setTimeout(() => {
          if (!settled) {
            settled = true
            const found = torrentClient.torrents.find(t =>
              trimmed.includes(t.infoHash) || (t.magnetURI && t.magnetURI === trimmed)
            )
            if (found) {
              activeTorrents.set(found.infoHash, {
                torrent: found,
                paused: false,
                customPath: targetDir,
                addedAt: Date.now()
              })
              startBroadcasting(getWindow)
              resolve({
                success: true,
                infoHash: found.infoHash,
                torrent: formatTorrentData(found, false),
                note: 'Torrent added; connecting to peers in background.'
              })
            } else {
              resolve({
                success: true,
                note: 'Torrent queued in background; connecting to swarm trackers.'
              })
            }
          }
        }, 3500)
      })
    } catch (err) {
      return { success: false, error: err.message || String(err) }
    }
  })

  ipcMain.handle('torrent:list', async () => {
    const list = []
    for (const [, record] of activeTorrents.entries()) {
      if (record.torrent) {
        list.push(formatTorrentData(record.torrent, record.paused))
      }
    }
    return { success: true, torrents: list }
  })

  ipcMain.handle('torrent:pause', async (_e, { infoHash } = {}) => {
    if (!infoHash) return { success: false, error: 'infoHash is required' }
    const record = activeTorrents.get(infoHash)
    if (!record || !record.torrent) return { success: false, error: 'Torrent not found' }

    try {
      record.torrent.pause()
      record.paused = true
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('torrent:resume', async (_e, { infoHash } = {}) => {
    if (!infoHash) return { success: false, error: 'infoHash is required' }
    const record = activeTorrents.get(infoHash)
    if (!record || !record.torrent) return { success: false, error: 'Torrent not found' }

    try {
      record.torrent.resume()
      record.paused = false
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('torrent:remove', async (_e, { infoHash, deleteFiles = false } = {}) => {
    if (!infoHash) return { success: false, error: 'infoHash is required' }
    const record = activeTorrents.get(infoHash)
    if (!record || !record.torrent) return { success: false, error: 'Torrent not found' }

    try {
      const torrentPath = record.torrent.path
      const torrentName = record.torrent.name

      record.torrent.destroy({ destroyStore: Boolean(deleteFiles) }, () => {
        activeTorrents.delete(infoHash)
      })

      if (deleteFiles && torrentPath && torrentName) {
        const fullPath = path.join(torrentPath, torrentName)
        try {
          if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true })
          }
        } catch {
          // ignore
        }
      }

      activeTorrents.delete(infoHash)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('torrent:openFolder', async (_e, { infoHash } = {}) => {
    if (!infoHash) return { success: false, error: 'infoHash is required' }
    const record = activeTorrents.get(infoHash)
    const targetPath = record?.torrent?.path || record?.customPath || app.getPath('downloads')

    try {
      if (fs.existsSync(targetPath)) {
        shell.openPath(targetPath)
        return { success: true }
      }
      return { success: false, error: 'Directory does not exist' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

function destroyTorrentManager() {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
  if (client) {
    try {
      client.destroy()
    } catch {
      // ignore
    }
    client = null
  }
  activeTorrents.clear()
}

module.exports = {
  registerTorrentIpc,
  destroyTorrentManager
}
