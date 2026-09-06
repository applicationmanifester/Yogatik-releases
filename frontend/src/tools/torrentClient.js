/**
 * Yogatik Native BitTorrent Client Tooling
 * Connects the renderer UI and autonomous AI agents to the Electron P2P BitTorrent engine.
 */

export function isTorrentAvailable() {
  return typeof window !== 'undefined' && Boolean(window.__YOGATIK_TORRENT__)
}

export async function addTorrent({ uri, downloadPath }) {
  if (!isTorrentAvailable()) {
    return {
      success: false,
      error: 'BitTorrent engine is only available in Yogatik Desktop app.'
    }
  }
  return window.__YOGATIK_TORRENT__.add({ uri, downloadPath })
}

export async function listTorrents() {
  if (!isTorrentAvailable()) {
    return { success: false, torrents: [], error: 'Desktop only' }
  }
  return window.__YOGATIK_TORRENT__.list()
}

export async function pauseTorrent(infoHash) {
  if (!isTorrentAvailable()) return { success: false, error: 'Desktop only' }
  return window.__YOGATIK_TORRENT__.pause({ infoHash })
}

export async function resumeTorrent(infoHash) {
  if (!isTorrentAvailable()) return { success: false, error: 'Desktop only' }
  return window.__YOGATIK_TORRENT__.resume({ infoHash })
}

export async function removeTorrent(infoHash, deleteFiles = false) {
  if (!isTorrentAvailable()) return { success: false, error: 'Desktop only' }
  return window.__YOGATIK_TORRENT__.remove({ infoHash, deleteFiles })
}

export async function openTorrentFolder(infoHash) {
  if (!isTorrentAvailable()) return { success: false, error: 'Desktop only' }
  return window.__YOGATIK_TORRENT__.openFolder({ infoHash })
}

export async function getDefaultDownloadPath() {
  if (!isTorrentAvailable()) return ''
  return window.__YOGATIK_TORRENT__.getDefaultPath()
}

export function subscribeTorrentUpdates(callback) {
  if (!isTorrentAvailable() || typeof callback !== 'function') return () => {}
  return window.__YOGATIK_TORRENT__.onUpdate(callback)
}

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s'
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatEta(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '∞'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}
