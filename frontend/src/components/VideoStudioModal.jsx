import React from 'react'
import { VideoStudioCore } from './VideoStudioCore'

export { VideoStudioCore }

export function VideoStudioModal({ isOpen, onClose, initialVideoUrl = null }) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop studio-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ padding: 0, border: 'none', background: 'transparent', maxWidth: 'none', width: 'auto' }}>
        <VideoStudioCore
          initialVideoUrl={initialVideoUrl}
          isStandalone={false}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
