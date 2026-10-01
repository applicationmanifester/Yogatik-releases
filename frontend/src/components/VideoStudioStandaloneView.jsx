import React, { useEffect, useMemo, useState } from 'react'
import { VideoStudioCore } from './VideoStudioCore'

export default function VideoStudioStandaloneView() {
  const queryParams = useMemo(() => {
    const s = new URLSearchParams(window.location.search)
    if (s.get('video') || s.get('path')) return s
    const h = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    return new URLSearchParams(h)
  }, [])

  const initialDesktopParams = (typeof window !== 'undefined' && (window.__YOGATIK_WINDOW_PARAMS__ || window.__YOGATIK_DESKTOP__?.windowParams)) || {}

  const [videoUrl, setVideoUrl] = useState(() => initialDesktopParams.videoUrl || queryParams.get('video') || '')
  const [videoName, setVideoName] = useState(() => initialDesktopParams.videoName || queryParams.get('name') || '')
  const [filePath, setFilePath] = useState(() => initialDesktopParams.filePath || queryParams.get('path') || '')

  useEffect(() => {
    document.title = 'Yogatik Video Studio & Precision Trimmer'
    document.documentElement.setAttribute('data-video-studio', '1')
    const theme = localStorage.getItem('yogatik_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    document.body.className = theme

    if (window.__YOGATIK_DESKTOP__?.onVideoStudioLoadMedia) {
      const unsub = window.__YOGATIK_DESKTOP__.onVideoStudioLoadMedia((data) => {
        if (data?.videoUrl) setVideoUrl(data.videoUrl)
        if (data?.videoName) setVideoName(data.videoName)
        if (data?.filePath) setFilePath(data.filePath)
      })
      return () => {
        unsub?.()
        document.documentElement.removeAttribute('data-video-studio')
      }
    }

    return () => {
      document.documentElement.removeAttribute('data-video-studio')
    }
  }, [])

  const handleClose = () => {
    if (window.__YOGATIK_DESKTOP__?.closeVideoStudio) {
      window.__YOGATIK_DESKTOP__.closeVideoStudio()
    } else {
      window.close()
    }
  }

  return (
    <div className="video-studio-standalone-root">
      <VideoStudioCore
        key={videoUrl || filePath || 'empty'}
        initialVideoUrl={videoUrl}
        initialVideoName={videoName}
        initialFilePath={filePath}
        isStandalone={true}
        onClose={handleClose}
      />
    </div>
  )
}
