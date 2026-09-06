import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  DownloadCloud,
  Play,
  Pause,
  Trash2,
  FolderOpen,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  FileText,
  Radio,
  X,
  Zap,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Minus,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  GripVertical,
  Move
} from 'lucide-react'
import {
  isTorrentAvailable,
  addTorrent,
  listTorrents,
  pauseTorrent,
  resumeTorrent,
  removeTorrent,
  openTorrentFolder,
  getDefaultDownloadPath,
  subscribeTorrentUpdates,
  formatBytes,
  formatSpeed,
  formatEta
} from '../tools/torrentClient'

export default function TorrentManagerModal({ isOpen, onClose, showToast }) {
  const [torrents, setTorrents] = useState([])
  const [magnetInput, setMagnetInput] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null) // { infoHash, name }
  const [deleteFilesDisk, setDeleteFilesDisk] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [copiedHash, setCopiedHash] = useState(null)

  // Persistent & draggable minibar position
  const [minibarPos, setMinibarPos] = useState(() => {
    try {
      const saved = localStorage.getItem('yogatik_torrent_minibar_pos')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed
        }
      }
    } catch { /* ignore */ }
    // Default position: Safely above bottom chat prompt bar
    const defaultX = typeof window !== 'undefined' ? Math.max(16, window.innerWidth - 460) : 100
    const defaultY = typeof window !== 'undefined' ? Math.max(80, window.innerHeight - 150) : 400
    return { x: defaultX, y: defaultY }
  })

  const [isDraggingMinibar, setIsDraggingMinibar] = useState(false)
  const isDraggingMinibarRef = useRef(false)
  const dragMinibarStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 })
  const hasMinibarMovedRef = useRef(false)
  const minibarRef = useRef(null)

  const isAvailableRef = useRef(false)
  const completedNotifiedRef = useRef(new Set())

  // Initialize paths and verify desktop bridge availability
  useEffect(() => {
    if (!isOpen) return
    const avail = isTorrentAvailable()
    setIsAvailable(avail)
    isAvailableRef.current = avail

    if (avail) {
      getDefaultDownloadPath().then(p => {
        if (typeof p === 'string' && p) setTargetPath(p)
      })
      fetchTorrents()
    }
  }, [isOpen])

  // Real-time status update subscription + automatic completion alerts
  useEffect(() => {
    if (!isOpen || !isAvailable) return
    const unsubscribe = subscribeTorrentUpdates((updatedList) => {
      if (Array.isArray(updatedList)) {
        setTorrents(updatedList)
        // Alert when any downloading torrent completes
        updatedList.forEach(t => {
          if ((t.done || (t.progress != null && t.progress >= 1)) && !completedNotifiedRef.current.has(t.infoHash)) {
            completedNotifiedRef.current.add(t.infoHash)
            showToast?.(`✓ Download complete: ${t.name || t.infoHash}`)
          }
        })
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [isOpen, isAvailable, showToast])

  // Window drag handlers for minimized widget (Mouse & Touch)
  const handleMinibarMouseDown = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return
    if (e.button !== undefined && e.button !== 0) return

    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null || clientY == null) return

    isDraggingMinibarRef.current = true
    setIsDraggingMinibar(true)
    hasMinibarMovedRef.current = false

    dragMinibarStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      posX: minibarPos.x,
      posY: minibarPos.y
    }
  }, [minibarPos])

  useEffect(() => {
    const handleMove = (e) => {
      if (!isDraggingMinibarRef.current) return
      const clientX = e.clientX ?? e.touches?.[0]?.clientX
      const clientY = e.clientY ?? e.touches?.[0]?.clientY
      if (clientX == null || clientY == null) return

      const dx = clientX - dragMinibarStartRef.current.mouseX
      const dy = clientY - dragMinibarStartRef.current.mouseY

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMinibarMovedRef.current = true
      }

      const barWidth = minibarRef.current?.offsetWidth || 420
      const barHeight = minibarRef.current?.offsetHeight || 64

      const minX = 12
      const maxX = Math.max(minX, window.innerWidth - barWidth - 12)
      const minY = 12
      const maxY = Math.max(minY, window.innerHeight - barHeight - 12)

      const targetX = Math.min(maxX, Math.max(minX, dragMinibarStartRef.current.posX + dx))
      const targetY = Math.min(maxY, Math.max(minY, dragMinibarStartRef.current.posY + dy))

      setMinibarPos({ x: targetX, y: targetY })
    }

    const handleEnd = () => {
      if (!isDraggingMinibarRef.current) return
      isDraggingMinibarRef.current = false
      setIsDraggingMinibar(false)

      setMinibarPos(current => {
        try {
          localStorage.setItem('yogatik_torrent_minibar_pos', JSON.stringify(current))
        } catch { /* ignore */ }
        return current
      })
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [])

  // Keep minibar within window boundaries on resize
  useEffect(() => {
    const handleResize = () => {
      setMinibarPos(prev => {
        const barWidth = minibarRef.current?.offsetWidth || 420
        const barHeight = minibarRef.current?.offsetHeight || 64
        const minX = 12
        const maxX = Math.max(minX, window.innerWidth - barWidth - 12)
        const minY = 12
        const maxY = Math.max(minY, window.innerHeight - barHeight - 12)

        const clampedX = Math.min(maxX, Math.max(minX, prev.x))
        const clampedY = Math.min(maxY, Math.max(minY, prev.y))

        if (clampedX !== prev.x || clampedY !== prev.y) {
          const updated = { x: clampedX, y: clampedY }
          try {
            localStorage.setItem('yogatik_torrent_minibar_pos', JSON.stringify(updated))
          } catch { /* ignore */ }
          return updated
        }
        return prev
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Cycle corner positions (Bottom-Right -> Top-Right -> Top-Left -> Bottom-Left)
  const cycleMinibarPosition = useCallback((e) => {
    e?.stopPropagation()
    const barWidth = minibarRef.current?.offsetWidth || 420
    const barHeight = minibarRef.current?.offsetHeight || 64
    const margin = 20

    const corners = [
      { name: 'Bottom-Right (Above chat)', x: window.innerWidth - barWidth - margin, y: window.innerHeight - barHeight - 96 },
      { name: 'Top-Right', x: window.innerWidth - barWidth - margin, y: 76 },
      { name: 'Top-Left', x: margin, y: 76 },
      { name: 'Bottom-Left', x: margin, y: window.innerHeight - barHeight - 96 }
    ]

    let closestIdx = 0
    let minDistance = Infinity
    corners.forEach((c, idx) => {
      const dist = Math.hypot(c.x - minibarPos.x, c.y - minibarPos.y)
      if (dist < minDistance) {
        minDistance = dist
        closestIdx = idx
      }
    })

    const nextCorner = corners[(closestIdx + 1) % corners.length]
    setMinibarPos({ x: nextCorner.x, y: nextCorner.y })
    try {
      localStorage.setItem('yogatik_torrent_minibar_pos', JSON.stringify({ x: nextCorner.x, y: nextCorner.y }))
    } catch { /* ignore */ }
    showToast?.(`Torrent bar moved to ${nextCorner.name}`)
  }, [minibarPos, showToast])

  const fetchTorrents = useCallback(async () => {
    if (!isAvailableRef.current) return
    setLoading(true)
    try {
      const res = await listTorrents()
      if (res.success && Array.isArray(res.torrents)) {
        setTorrents(res.torrents)
      }
    } catch (err) {
      console.error('Failed to load torrents:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePickFolder = async () => {
    if (window.__YOGATIK_DIALOG__?.pickFolder) {
      const res = await window.__YOGATIK_DIALOG__.pickFolder({ title: 'Select Torrent Download Destination' })
      if (res.success && res.path) {
        setTargetPath(res.path)
      }
    }
  }

  const handleAddTorrent = async (uriOverride) => {
    const uriToAdd = (uriOverride || magnetInput).trim()
    if (!uriToAdd) {
      showToast?.('Please enter a Magnet URI or torrent URL')
      return
    }

    setLoading(true)
    try {
      const res = await addTorrent({
        uri: uriToAdd,
        downloadPath: targetPath
      })
      if (res.success) {
        showToast?.('Torrent added to swarm engine')
        if (!uriOverride) setMagnetInput('')
        fetchTorrents()
      } else {
        showToast?.(res.error || 'Failed to add torrent')
      }
    } catch (err) {
      showToast?.(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async (infoHash) => {
    const res = await pauseTorrent(infoHash)
    if (res.success) {
      setTorrents(prev => prev.map(t => t.infoHash === infoHash ? { ...t, paused: true, downloadSpeed: 0, uploadSpeed: 0 } : t))
      showToast?.('Torrent paused')
    }
  }

  const handleResume = async (infoHash) => {
    const res = await resumeTorrent(infoHash)
    if (res.success) {
      setTorrents(prev => prev.map(t => t.infoHash === infoHash ? { ...t, paused: false } : t))
      showToast?.('Torrent resumed')
    }
  }

  const handleRemove = async (infoHash, deleteFiles) => {
    const res = await removeTorrent(infoHash, deleteFiles)
    if (res.success) {
      setTorrents(prev => prev.filter(t => t.infoHash !== infoHash))
      setConfirmDelete(null)
      showToast?.(deleteFiles ? 'Torrent and downloaded files removed' : 'Torrent removed from client')
    } else {
      showToast?.(res.error || 'Failed to remove torrent')
    }
  }

  const handleOpenFolder = async (infoHash) => {
    const res = await openTorrentFolder(infoHash)
    if (!res.success) {
      showToast?.(res.error || 'Could not open folder')
    }
  }

  const handleCopyHash = (hash) => {
    if (!hash) return
    navigator.clipboard?.writeText(hash)
    setCopiedHash(hash)
    showToast?.('Copied InfoHash to clipboard')
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const toggleFiles = (infoHash) => {
    setExpandedFiles(prev => ({
      ...prev,
      [infoHash]: !prev[infoHash]
    }))
  }

  if (!isOpen) return null

  // Calculate totals
  const totalDownSpeed = torrents.reduce((acc, t) => acc + (t.paused ? 0 : (t.downloadSpeed || 0)), 0)
  const totalUpSpeed = torrents.reduce((acc, t) => acc + (t.paused ? 0 : (t.uploadSpeed || 0)), 0)
  const activeCount = torrents.filter(t => !t.done && !t.paused).length

  // Minimized floating player widget
  if (isMinimized) {
    const activeTorrent = torrents.find(t => !t.done && !t.paused) || torrents[0]
    const activePct = activeTorrent ? Math.round((activeTorrent.progress || 0) * 100) : 0
    const hasDownloads = torrents.length > 0

    return (
      <div
        ref={minibarRef}
        className="torrent-floating-minibar"
        onMouseDown={handleMinibarMouseDown}
        onTouchStart={handleMinibarMouseDown}
        style={{
          position: 'fixed',
          left: `${minibarPos.x}px`,
          top: `${minibarPos.y}px`,
          zIndex: 99999,
          background: 'rgba(18, 20, 26, 0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: isDraggingMinibar ? '1px solid #818cf8' : '1px solid rgba(99, 102, 241, 0.35)',
          boxShadow: isDraggingMinibar
            ? '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.4)'
            : '0 16px 40px rgba(0, 0, 0, 0.65), 0 0 24px rgba(99, 102, 241, 0.2)',
          borderRadius: '16px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '520px',
          minWidth: '360px',
          cursor: isDraggingMinibar ? 'grabbing' : 'grab',
          userSelect: 'none',
          transition: isDraggingMinibar ? 'none' : 'box-shadow 0.2s ease, border-color 0.2s ease'
        }}
      >
        {/* Visual Grip Drag Handle */}
        <div
          title="Drag to reposition anywhere on screen"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDraggingMinibar ? '#a5b4fc' : '#6b7280',
            cursor: isDraggingMinibar ? 'grabbing' : 'grab',
            padding: '2px 0',
            flexShrink: 0
          }}
        >
          <GripVertical size={16} />
        </div>

        {/* Glowing Torrent Icon Badge */}
        <div
          onClick={() => { if (!hasMinibarMovedRef.current) setIsMinimized(false) }}
          style={{
            position: 'relative',
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
          }}
          title="Click to restore Torrent Downloader"
        >
          <DownloadCloud size={19} />
          {activeCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#4ade80',
                border: '2px solid #12141a',
                boxShadow: '0 0 8px #4ade80'
              }}
            />
          )}
        </div>

        {/* Info & Progress (Click to restore) */}
        <div
          onClick={() => { if (!hasMinibarMovedRef.current) setIsMinimized(false) }}
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          title="Click to restore Torrent Downloader"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#f3f4f6',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '220px'
              }}
            >
              {activeTorrent?.name || 'Torrent Downloader'}
            </div>
            {hasDownloads && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc', flexShrink: 0 }}>
                {activePct}%
              </span>
            )}
          </div>

          {/* Mini progress track */}
          {hasDownloads && (
            <div
              style={{
                width: '100%',
                height: '5px',
                borderRadius: '3px',
                background: 'rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                marginBottom: '6px'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${activePct}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          )}

          {/* Stats sub-line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '11px', color: '#9ca3af' }}>
            <span style={{ color: totalDownSpeed > 0 ? '#4ade80' : '#9ca3af', fontWeight: 500 }}>
              ↓ {formatSpeed(totalDownSpeed)}
            </span>
            {totalUpSpeed > 0 && (
              <span style={{ color: '#60a5fa' }}>
                ↑ {formatSpeed(totalUpSpeed)}
              </span>
            )}
            {activeTorrent?.error ? (
              <span style={{ color: '#f87171', fontWeight: 500 }} title={activeTorrent.error}>
                Error
              </span>
            ) : (
              <span style={{ color: (activeTorrent?.numPeers || 0) > 0 ? '#38bdf8' : '#eab308' }}>
                {(activeTorrent?.numPeers || 0) > 0
                  ? `${activeTorrent.numPeers} peers`
                  : (activeTorrent?.paused ? 'Paused' : 'Finding peers...')}
              </span>
            )}
            {activeTorrent && !activeTorrent.done && !activeTorrent.paused && activeTorrent.timeRemaining > 0 && Number.isFinite(activeTorrent.timeRemaining) && (
              <span>ETA: {formatEta(activeTorrent.timeRemaining)}</span>
            )}
            {activeCount > 1 && (
              <span style={{ color: '#c084fc' }}>({activeCount} active)</span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {activeTorrent && (
            activeTorrent.paused ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleResume(activeTorrent.infoHash) }}
                title="Resume Download"
                style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                <Play size={14} />
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); handlePause(activeTorrent.infoHash) }}
                title="Pause Download"
                style={{
                  background: 'rgba(234, 179, 8, 0.15)',
                  color: '#facc15',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '8px',
                  padding: '6px',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                <Pause size={14} />
              </button>
            )
          )}
          {activeTorrent && (
            <button
              onClick={(e) => { e.stopPropagation(); handleOpenFolder(activeTorrent.infoHash) }}
              title="Open Download Folder"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#9ca3af',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex'
              }}
            >
              <FolderOpen size={14} />
            </button>
          )}
          {/* Snap Corner Position Button */}
          <button
            onClick={cycleMinibarPosition}
            title="Snap to corner (Bottom-Right, Top-Right, Top-Left, Bottom-Left)"
            style={{
              background: 'rgba(99, 102, 241, 0.12)',
              color: '#c7d2fe',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <Move size={14} />
          </button>
          <button
            onClick={() => setIsMinimized(false)}
            title="Expand / Restore window"
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={onClose}
            title="Close Downloader"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#9ca3af',
              border: 'none',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 10000 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsMinimized(true)
      }}
    >
      <div
        className="modal-content"
        style={{
          width: isMaximized ? '96vw' : '900px',
          maxWidth: '96vw',
          height: isMaximized ? '94vh' : 'auto',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          background: 'var(--bg-secondary, #18191e)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)'
              }}
            >
              <DownloadCloud size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Yogatik P2P Torrent Downloader</h2>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: isAvailable ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isAvailable ? '#4ade80' : '#f87171',
                    border: `1px solid ${isAvailable ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    fontWeight: 500
                  }}
                >
                  {isAvailable ? 'Native Desktop Engine Active' : 'Web Version (Desktop Only)'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #9ca3af)', marginTop: '2px' }}>
                Full-featured BitTorrent swarm engine running directly on your device via Electron
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="icon-btn"
              onClick={() => setIsMinimized(true)}
              style={{ padding: '6px', borderRadius: '8px', cursor: 'pointer', color: '#9ca3af' }}
              title="Minimize to floating mini-bar"
              aria-label="Minimize"
            >
              <Minus size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setIsMaximized(m => !m)}
              style={{ padding: '6px', borderRadius: '8px', cursor: 'pointer', color: '#9ca3af' }}
              title={isMaximized ? "Restore standard size" : "Maximize window"}
              aria-label="Maximize"
            >
              {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              className="icon-btn"
              onClick={onClose}
              style={{ padding: '6px', borderRadius: '8px', cursor: 'pointer', color: '#9ca3af' }}
              title="Close"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!isAvailable ? (
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px'
              }}
            >
              <AlertCircle size={22} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#f87171' }}>
                  Desktop Application Required
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af', lineHeight: 1.5 }}>
                  The native BitTorrent protocol requires raw TCP/UDP socket connections and file system piece allocation, which web browsers sandbox. To download torrents, please use the <strong>Yogatik Desktop Application</strong>.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Add Torrent Section */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="Paste Magnet URI (magnet:?xt=urn:btih:...) or torrent link"
                    value={magnetInput}
                    onChange={(e) => setMagnetInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddTorrent() }}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                      background: 'var(--input-bg, rgba(0, 0, 0, 0.25))',
                      color: 'var(--text-primary, #fff)',
                      fontSize: '13px'
                    }}
                  />
                  <button
                    className="primary-btn"
                    onClick={() => handleAddTorrent()}
                    disabled={loading || !magnetInput.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                      cursor: loading || !magnetInput.trim() ? 'not-allowed' : 'pointer',
                      opacity: loading || !magnetInput.trim() ? 0.6 : 1
                    }}
                  >
                    <Plus size={16} />
                    Add Torrent
                  </button>
                </div>

                {/* Target folder setting */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#9ca3af' }}>
                  <HardDrive size={14} />
                  <span>Download To:</span>
                  <span
                    style={{
                      padding: '3px 8px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      color: '#e5e7eb',
                      fontFamily: 'monospace',
                      maxWidth: '450px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={typeof targetPath === 'string' ? targetPath : ''}
                  >
                    {typeof targetPath === 'string' && targetPath ? targetPath : 'Default Downloads folder'}
                  </span>
                  <button
                    onClick={handlePickFolder}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#cbd5e1',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Change...
                  </button>
                </div>
              </div>

              {/* Active Torrents Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9ca3af' }}>
                      Transfers ({torrents.length})
                    </h3>
                    {activeCount > 0 && (
                      <span style={{ fontSize: '11px', color: '#4ade80', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                        {activeCount} active
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: '#9ca3af' }}>
                    <span>↓ {formatSpeed(totalDownSpeed)}</span>
                    <span>↑ {formatSpeed(totalUpSpeed)}</span>
                    <button
                      className="icon-btn"
                      onClick={fetchTorrents}
                      title="Refresh"
                      style={{ padding: '4px', cursor: 'pointer' }}
                    >
                      <RefreshCw size={13} className={loading ? 'spinning' : ''} />
                    </button>
                  </div>
                </div>

                {torrents.length === 0 ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      borderRadius: '12px',
                      border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))',
                      color: 'var(--text-secondary, #6b7280)'
                    }}
                  >
                    <Radio size={32} style={{ marginBottom: '10px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>No Active Torrent Transfers</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                      Paste a magnet link or .torrent URL above to start downloading.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {torrents.map((t) => {
                      const isPaused = t.paused
                      const isComplete = t.done || t.progress >= 1
                      const pct = Math.round((t.progress || 0) * 100)

                      return (
                        <div
                          key={t.infoHash}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                            borderRadius: '10px',
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}
                        >
                          {/* Row 1: Title and Controls */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <button
                                onClick={() => toggleFiles(t.infoHash)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#9ca3af',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  display: 'flex'
                                }}
                                title="Toggle file list"
                              >
                                {expandedFiles[t.infoHash] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.name}>
                                  {t.name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{t.infoHash?.substring(0, 16)}...</span>
                                  <button
                                    onClick={() => handleCopyHash(t.infoHash)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: copiedHash === t.infoHash ? '#4ade80' : '#818cf8',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                    title="Copy full InfoHash"
                                  >
                                    {copiedHash === t.infoHash ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              {isComplete ? (
                                <>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: isPaused ? '#4ade80' : '#38bdf8', marginRight: '6px' }}>
                                    <CheckCircle2 size={14} /> {isPaused ? 'Complete' : 'Seeding'}
                                  </span>
                                  {isPaused ? (
                                    <button
                                      className="icon-btn"
                                      onClick={() => handleResume(t.infoHash)}
                                      title="Seed Torrent (Resume Uploading)"
                                      style={{ padding: '6px', background: 'rgba(99, 102, 241, 0.1)', color: '#a5b4fc', borderRadius: '6px', cursor: 'pointer' }}
                                    >
                                      <Play size={14} />
                                    </button>
                                  ) : (
                                    <button
                                      className="icon-btn"
                                      onClick={() => handlePause(t.infoHash)}
                                      title="Stop Seeding & Disconnect Peers"
                                      style={{ padding: '6px', background: 'rgba(234, 179, 8, 0.1)', color: '#facc15', borderRadius: '6px', cursor: 'pointer' }}
                                    >
                                      <Pause size={14} />
                                    </button>
                                  )}
                                </>
                              ) : isPaused ? (
                                <button
                                  className="icon-btn"
                                  onClick={() => handleResume(t.infoHash)}
                                  title="Resume Download"
                                  style={{ padding: '6px', background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                  <Play size={14} />
                                </button>
                              ) : (
                                <button
                                  className="icon-btn"
                                  onClick={() => handlePause(t.infoHash)}
                                  title="Pause Download"
                                  style={{ padding: '6px', background: 'rgba(234, 179, 8, 0.1)', color: '#facc15', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                  <Pause size={14} />
                                </button>
                              )}

                              <button
                                className="icon-btn"
                                onClick={() => handleOpenFolder(t.infoHash)}
                                title="Open in File Explorer"
                                style={{ padding: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                <FolderOpen size={14} />
                              </button>

                              <button
                                className="icon-btn"
                                onClick={() => setConfirmDelete({ infoHash: t.infoHash, name: t.name })}
                                title="Remove Torrent"
                                style={{ padding: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                borderRadius: '3px',
                                background: isComplete
                                  ? 'linear-gradient(90deg, #10b981, #059669)'
                                  : isPaused
                                  ? '#eab308'
                                  : 'linear-gradient(90deg, #6366f1, #a855f7)',
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>

                          {/* Stats Bar */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                              <span style={{ fontWeight: 600, color: '#e5e7eb' }}>{pct}%</span>
                              <span>{formatBytes(t.downloaded)} / {formatBytes(t.length)}</span>
                              <span>↓ {formatSpeed(t.downloadSpeed)}</span>
                              <span>↑ {formatSpeed(t.uploadSpeed)}</span>
                              <span>{t.numPeers || 0} peers</span>
                            </div>
                            <div>
                              <span>ETA: {isComplete ? 'Done' : formatEta(t.timeRemaining / 1000)}</span>
                            </div>
                          </div>

                          {/* Expandable Files List */}
                          {expandedFiles[t.infoHash] && t.files && t.files.length > 0 && (
                            <div
                              style={{
                                marginTop: '6px',
                                padding: '10px',
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                maxHeight: '160px',
                                overflowY: 'auto'
                              }}
                            >
                              <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>
                                Files ({t.files.length}):
                              </div>
                              {t.files.map((file, fIdx) => (
                                <div key={fIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#d1d5db' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <FileText size={12} style={{ opacity: 0.6 }} />
                                    <span>{file.name}</span>
                                  </div>
                                  <span style={{ color: '#9ca3af', flexShrink: 0 }}>{formatBytes(file.length)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.15)',
            fontSize: '12px',
            color: '#6b7280'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={13} style={{ color: '#a855f7' }} />
            <span>P2P Protocol: BitTorrent over TCP/uTP + DHT Kademlia + WebTorrent</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="secondary-btn"
              onClick={() => setIsMinimized(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#a5b4fc'
              }}
            >
              <Minus size={13} />
              Minimize to Background
            </button>
            <button
              className="secondary-btn"
              onClick={onClose}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {confirmDelete && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001
            }}
          >
            <div
              style={{
                width: '420px',
                background: '#1f2937',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#f3f4f6' }}>Remove Torrent?</h4>
              <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#9ca3af', lineHeight: 1.4 }}>
                Are you sure you want to remove <strong>{confirmDelete.name}</strong> from the transfers list?
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#fca5a5', marginBottom: '18px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={deleteFilesDisk}
                  onChange={(e) => setDeleteFilesDisk(e.target.checked)}
                />
                Also delete downloaded data from disk
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => { setConfirmDelete(null); setDeleteFilesDisk(false) }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRemove(confirmDelete.infoHash, deleteFilesDisk)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    background: '#dc2626',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
