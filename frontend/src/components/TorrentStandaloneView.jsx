import React, { useEffect, useState, useCallback } from 'react'
import TorrentManagerModal from './TorrentManagerModal'

export default function TorrentStandaloneView() {
  const [toastMsg, setToastMsg] = useState(null)

  useEffect(() => {
    document.title = 'Yogatik Torrent Downloader (High-Speed P2P Client)'
    document.documentElement.setAttribute('data-torrent-downloader', '1')
    const theme = localStorage.getItem('yogatik_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    document.body.className = theme

    return () => {
      document.documentElement.removeAttribute('data-torrent-downloader')
    }
  }, [])

  const handleClose = () => {
    if (window.__YOGATIK_DESKTOP__?.closeTorrentDownloader) {
      window.__YOGATIK_DESKTOP__.closeTorrentDownloader()
    } else {
      window.close()
    }
  }

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }, [])

  return (
    <div className="torrent-standalone-root">
      <TorrentManagerModal
        isOpen={true}
        isStandalone={true}
        onClose={handleClose}
        showToast={showToast}
      />
      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          padding: '10px 18px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          zIndex: 99999,
          pointerEvents: 'none',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
