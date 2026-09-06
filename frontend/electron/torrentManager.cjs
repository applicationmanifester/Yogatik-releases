// Background BitTorrent Engine for Yogatik Desktop
// Uses WebTorrent to manage P2P swarms, DHT, trackers, and disk piece storage.
// Runs purely inside Electron Node.js main process.

const { ipcMain, app, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { safeSend } = require('./safeWindow.cjs')

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

function stopTorrentSeeding(record) {
  if (!record || !record.torrent) return
  record.paused = true
  record.autoStoppedOnDone = true
  try {
    record.torrent.pause()
  } catch (err) {
    console.error('[Yogatik BitTorrent] Error pausing torrent:', err?.message || err)
  }
  // Disconnect all upload/download peer connections so network traffic ceases immediately
  if (Array.isArray(record.torrent.wires)) {
    for (const wire of [...record.torrent.wires]) {
      try {
        wire.destroy()
      } catch {}
    }
  }
}

// High-speed public trackers to maximize swarm peer discovery across firewalls
const HIGH_SPEED_PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'http://torrent.ubuntu.com:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz'
]

function formatTorrentData(t, isPaused = false, error = null) {
  if (!t) return null
  const isDone = Boolean(t.done || (t.progress != null && t.progress >= 1))
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
    timeRemaining: isDone ? 0 : (isPaused ? Infinity : (t.timeRemaining || 0)),
    done: isDone,
    paused: Boolean(isPaused),
    path: t.path || '',
    error: error || null,
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
    for (const [, record] of activeTorrents.entries()) {
      if (record.torrent) {
        // Auto-stop completed torrents from uploading to peers
        const isDone = Boolean(record.torrent.done || (record.torrent.progress != null && record.torrent.progress >= 1))
        if (isDone && !record.autoStoppedOnDone && !record.userManuallyResumed && !record.paused) {
          stopTorrentSeeding(record)
        }
        list.push(formatTorrentData(record.torrent, record.paused, record.error))
      }
    }
    safeSend(win, 'torrent:update', list)
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

        torrentClient.add(trimmed, { path: targetDir, announce: HIGH_SPEED_PUBLIC_TRACKERS }, (torrent) => {
          const record = {
            torrent,
            paused: false,
            autoStoppedOnDone: false,
            userManuallyResumed: false,
            customPath: targetDir,
            addedAt: Date.now(),
            error: null
          }
          activeTorrents.set(torrent.infoHash, record)

          // Catch any piece read/write or socket errors on this torrent
          torrent.on('error', (err) => {
            console.error('[Yogatik BitTorrent] Torrent error:', err?.message || err)
            record.error = err?.message || String(err)
          })

          // Auto-stop downloading and uploading peers once download is complete
          torrent.on('done', () => {
            console.log(`[Yogatik BitTorrent] Torrent ${torrent.name || torrent.infoHash} reached 100%. Auto-stopping seeding & disconnecting peers.`)
            stopTorrentSeeding(record)
          })

          if (torrent.done || (torrent.progress != null && torrent.progress >= 1)) {
            stopTorrentSeeding(record)
          }

          startBroadcasting(getWindow)

          if (!settled) {
            settled = true
            resolve({
              success: true,
              infoHash: torrent.infoHash,
              torrent: formatTorrentData(torrent, record.paused, record.error)
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
              const record = {
                torrent: found,
                paused: false,
                autoStoppedOnDone: false,
                userManuallyResumed: false,
                customPath: targetDir,
                addedAt: Date.now(),
                error: null
              }
              activeTorrents.set(found.infoHash, record)

              found.on('error', (err) => {
                console.error('[Yogatik BitTorrent] Torrent error:', err?.message || err)
                record.error = err?.message || String(err)
              })

              found.on('done', () => {
                stopTorrentSeeding(record)
              })
              if (found.done || (found.progress != null && found.progress >= 1)) {
                stopTorrentSeeding(record)
              }

              startBroadcasting(getWindow)
              resolve({
                success: true,
                infoHash: found.infoHash,
                torrent: formatTorrentData(found, record.paused, record.error),
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
        list.push(formatTorrentData(record.torrent, record.paused, record.error))
      }
    }
    return { success: true, torrents: list }
  })

  ipcMain.handle('torrent:pause', async (_e, { infoHash } = {}) => {
    if (!infoHash) return { success: false, error: 'infoHash is required' }
    const record = activeTorrents.get(infoHash)
    if (!record || !record.torrent) return { success: false, error: 'Torrent not found' }

    try {
      stopTorrentSeeding(record)
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
      record.userManuallyResumed = true
      record.paused = false
      record.torrent.resume()
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
