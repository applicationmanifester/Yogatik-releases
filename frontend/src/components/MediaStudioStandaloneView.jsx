import React, { useEffect } from 'react'
import { MediaStudioModal } from './MediaStudioModal'

export default function MediaStudioStandaloneView() {
  useEffect(() => {
    document.title = 'Yogatik Creative Media Studio (Kling 3, Seedance, Wan, Soul & Flux)'
    document.documentElement.setAttribute('data-media-studio', '1')
    const theme = localStorage.getItem('yogatik_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    document.body.className = theme

    return () => {
      document.documentElement.removeAttribute('data-media-studio')
    }
  }, [])

  const handleClose = () => {
    if (window.__YOGATIK_DESKTOP__?.closeMediaStudio) {
      window.__YOGATIK_DESKTOP__.closeMediaStudio()
    } else {
      window.close()
    }
  }

  const handleOpenVideoStudio = (url) => {
    if (window.__YOGATIK_DESKTOP__?.openVideoStudio) {
      window.__YOGATIK_DESKTOP__.openVideoStudio({ videoUrl: url })
    } else {
      window.open(`?video_studio=1&video=${encodeURIComponent(url || '')}`, 'YogatikVideoStudio')
    }
  }

  return (
    <div className="media-studio-standalone-root">
      <MediaStudioModal
        isOpen={true}
        isStandalone={true}
        onClose={handleClose}
        onOpenVideoStudio={handleOpenVideoStudio}
      />
    </div>
  )
}
