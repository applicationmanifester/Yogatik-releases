import React, { useEffect, useMemo } from 'react'
import { VideoStudioCore } from './VideoStudioCore'

export default function VideoStudioStandaloneView() {
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const initialVideoUrl = queryParams.get('video') || ''
  const initialVideoName = queryParams.get('name') || ''
  const initialFilePath = queryParams.get('path') || ''

  useEffect(() => {
    document.title = 'Yogatik Video Studio & Precision Trimmer'
    document.documentElement.setAttribute('data-video-studio', '1')
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
        initialVideoUrl={initialVideoUrl}
        initialVideoName={initialVideoName}
        initialFilePath={initialFilePath}
        isStandalone={true}
        onClose={handleClose}
      />
    </div>
  )
}
