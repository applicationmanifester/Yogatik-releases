import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isTorrentAvailable,
  addTorrent,
  listTorrents,
  pauseTorrent,
  resumeTorrent,
  removeTorrent,
  openTorrentFolder,
  getDefaultDownloadPath,
  formatBytes,
  formatSpeed,
  formatEta,
  subscribeTorrentUpdates
} from './torrentClient'

describe('torrentClient', () => {
  beforeEach(() => {
    delete window.__YOGATIK_TORRENT__
  })

  afterEach(() => {
    delete window.__YOGATIK_TORRENT__
  })

  it('detects when torrent bridge is absent', () => {
    expect(isTorrentAvailable()).toBe(false)
  })

  it('detects when torrent bridge is present', () => {
    window.__YOGATIK_TORRENT__ = { add: vi.fn() }
    expect(isTorrentAvailable()).toBe(true)
  })

  it('formats bytes, speed, and ETA correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1048576 * 1.5)).toBe('1.5 MB')

    expect(formatSpeed(0)).toBe('0 KB/s')
    expect(formatSpeed(2048)).toBe('2 KB/s')

    expect(formatEta(0)).toBe('∞')
    expect(formatEta(45)).toBe('45s')
    expect(formatEta(125)).toBe('2m 5s')
    expect(formatEta(3665)).toBe('1h 1m')
  })

  it('gracefully handles calls when bridge is unavailable', async () => {
    const r1 = await addTorrent({ uri: 'magnet:?xt=urn:btih:123' })
    expect(r1.success).toBe(false)
    expect(r1.error).toContain('Desktop app')

    const r2 = await listTorrents()
    expect(r2.success).toBe(false)

    const r3 = await pauseTorrent('123')
    expect(r3.success).toBe(false)

    const unsub = subscribeTorrentUpdates(() => {})
    expect(typeof unsub).toBe('function')
  })

  it('delegates calls to window.__YOGATIK_TORRENT__ when available', async () => {
    const addMock = vi.fn().mockResolvedValue({ success: true, infoHash: 'abc' })
    const listMock = vi.fn().mockResolvedValue({ success: true, torrents: [{ infoHash: 'abc' }] })
    const pauseMock = vi.fn().mockResolvedValue({ success: true })
    const resumeMock = vi.fn().mockResolvedValue({ success: true })
    const removeMock = vi.fn().mockResolvedValue({ success: true })
    const openMock = vi.fn().mockResolvedValue({ success: true })
    const getPathMock = vi.fn().mockResolvedValue('C:\\Downloads')
    const onUpdateMock = vi.fn().mockReturnValue(() => {})

    window.__YOGATIK_TORRENT__ = {
      add: addMock,
      list: listMock,
      pause: pauseMock,
      resume: resumeMock,
      remove: removeMock,
      openFolder: openMock,
      getDefaultPath: getPathMock,
      onUpdate: onUpdateMock
    }

    const res = await addTorrent({ uri: 'magnet:?xt=urn:btih:abc', downloadPath: 'C:\\Downloads' })
    expect(res.success).toBe(true)
    expect(addMock).toHaveBeenCalledWith({ uri: 'magnet:?xt=urn:btih:abc', downloadPath: 'C:\\Downloads' })

    const list = await listTorrents()
    expect(list.torrents.length).toBe(1)

    await pauseTorrent('abc')
    expect(pauseMock).toHaveBeenCalledWith({ infoHash: 'abc' })

    await resumeTorrent('abc')
    expect(resumeMock).toHaveBeenCalledWith({ infoHash: 'abc' })

    await removeTorrent('abc', true)
    expect(removeMock).toHaveBeenCalledWith({ infoHash: 'abc', deleteFiles: true })

    await openTorrentFolder('abc')
    expect(openMock).toHaveBeenCalledWith({ infoHash: 'abc' })

    const defaultPath = await getDefaultDownloadPath()
    expect(defaultPath).toBe('C:\\Downloads')

    subscribeTorrentUpdates(() => {})
    expect(onUpdateMock).toHaveBeenCalled()
  })
})
