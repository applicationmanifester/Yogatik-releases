import React, { useState } from 'react'
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, PictureInPicture2,
  Volume2, VolumeX, Sparkles, Wrench, Layers
} from 'lucide-react'

/**
 * LiveDockOverlay: Floating "Dynamic Island" Companion Dock for Yogatik Live.
 * Allows users to work in their code editor, browser, or terminal while maintaining
 * continuous live face-to-face audio/video awareness.
 */
export function LiveDockOverlay({
  state = 'live',
  speaking = false,
  thinking = false,
  tool = null,
  liveStatusText = '',
  muted = false,
  speakerMuted = false,
  camOn = false,
  userLevel = 0,
  assistantLevel = 0,
  activeArtifact = null,
  onToggleMute,
  onToggleSpeakerMute,
  onToggleCam,
  onExpandCinema,
  onPopoutPip,
  onEndCall,
  onSelectArtifact,
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const activeLevel = speaking ? assistantLevel : userLevel
  const orbScale = Math.min(1.4, 0.9 + (activeLevel || 0) * 0.7)
  const isToolActive = Boolean(tool)

  return (
    <div className="live-dock-overlay">
      {/* Dynamic Island Capsule */}
      <div className={`live-dock-capsule ${isToolActive ? 'tool-active' : thinking ? 'thinking' : ''}`}>
        {/* Reactive Micro-Orb */}
        <div
          onClick={onExpandCinema}
          title="Click to expand to Cinema mode"
          className="live-dock-orb"
          style={{ transform: `scale(${orbScale})` }}
        >
          {/* Outer glow ring */}
          <div className={`live-dock-orb-glow ${speaking ? 'speaking' : thinking ? 'thinking' : ''}`} />
          {/* Core sphere */}
          <div className={`live-dock-orb-core ${speaking ? 'speaking' : thinking ? 'thinking' : ''}`} />
        </div>

        {/* Status text & tool info */}
        <div
          onClick={() => setIsExpanded(v => !v)}
          className="live-dock-status"
        >
          {isToolActive ? (
            <span className="live-dock-tool">
              <Wrench size={12} className="spin" />
              <span>{tool}</span>
            </span>
          ) : thinking ? (
            <span className="live-dock-thinking">
              <Sparkles size={12} className="pulse" />
              <span>Thinking…</span>
            </span>
          ) : speaking ? (
            <span className="live-dock-speaking">
              <span className="live-dock-speak-dot" />
              Speaking
            </span>
          ) : (
            <span className="live-dock-listening">Listening…</span>
          )}
        </div>

        {/* Expanded controls */}
        {isExpanded && (
          <div className="live-dock-expanded">
            <div className="live-dock-divider" />
            <div className="live-dock-controls">
              <button
                type="button"
                className={`live-dock-btn ${muted ? 'muted' : ''}`}
                onClick={onToggleMute}
                title={muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {muted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button
                type="button"
                className={`live-dock-btn ${speakerMuted ? 'muted' : ''}`}
                onClick={onToggleSpeakerMute}
                title={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
              >
                {speakerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                type="button"
                className={`live-dock-btn ${camOn ? 'active' : ''}`}
                onClick={onToggleCam}
                title={camOn ? 'Turn camera off' : 'Turn camera on'}
              >
                {camOn ? <Video size={14} /> : <VideoOff size={14} />}
              </button>
              <button
                type="button"
                className="live-dock-btn"
                onClick={onPopoutPip}
                title="Pop out Picture-in-Picture"
              >
                <PictureInPicture2 size={14} />
              </button>
              <button
                type="button"
                className="live-dock-btn"
                onClick={onExpandCinema}
                title="Expand to Cinema mode"
              >
                <Maximize2 size={14} />
              </button>
              {activeArtifact && (
                <button
                  type="button"
                  className="live-dock-btn artifact"
                  onClick={onSelectArtifact}
                  title="View artifact"
                >
                  <Layers size={14} />
                </button>
              )}
              <button
                type="button"
                className="live-dock-btn end-call"
                onClick={onEndCall}
                title="End call"
              >
                <PhoneOff size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom status badge */}
      {liveStatusText && (
        <div className="live-dock-badge">{liveStatusText}</div>
      )}
    </div>
  )
}

// Add keyframes for animations
const style = document.createElement('style')
style.textContent = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
`
if (typeof document !== 'undefined') document.head.appendChild(style)
