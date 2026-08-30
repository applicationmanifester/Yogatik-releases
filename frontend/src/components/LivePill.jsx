import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Sparkles, Activity } from 'lucide-react'

/**
 * Floating glassmorphic Live Pill overlay.
 * Provides ambient status, audio-reactive visualizer orb, live subtitles,
 * and quick controls for microphone, camera, and screen sharing.
 */
export default function LivePill({
  active = false,
  status = 'ready',
  audioLevel = 0,
  isMuted = false,
  cameraOn = false,
  screenOn = false,
  currentTranscript = '',
  role = 'model',
  onToggleMute,
  onToggleCamera,
  onToggleScreen,
  onEndSession,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const orbScale = Math.min(1.5, Math.max(1, 1 + audioLevel * 1.2))

  if (!active) return null

  return (
    <aside className={`live-pill-container ${collapsed ? 'collapsed' : ''}`} aria-label="Live Voice Session Controls">
      <div className="live-pill-glass">
        {/* Pulsing Audio Reactive Orb */}
        <div
          className={`live-pill-orb status-${status}`}
          style={{ transform: `scale(${orbScale})` }}
          title={`Status: ${status}`}
          onClick={() => setCollapsed(!collapsed)}
          role="button"
          tabIndex={0}
        >
          <div className="live-orb-core" />
          <div className="live-orb-glow" />
        </div>

        {/* Status and Transcript Ticker */}
        {!collapsed && (
          <div className="live-pill-content">
            <div className="live-pill-header">
              <span className="live-pill-badge">
                <Activity size={12} className="live-pulse-icon" />
                {status === 'thinking' ? 'Thinking…' : status === 'speaking' ? 'Speaking…' : isMuted ? 'Muted' : 'Listening…'}
              </span>
              {currentTranscript && (
                <span className="live-pill-role-tag">{role === 'user' ? 'You' : 'Assistant'}</span>
              )}
            </div>

            {currentTranscript ? (
              <div className="live-pill-subtitle" title={currentTranscript}>
                {currentTranscript}
              </div>
            ) : (
              <div className="live-pill-hint">Speak naturally or ask to run tools…</div>
            )}
          </div>
        )}

        {/* Quick Action Controls */}
        <div className="live-pill-actions">
          <button
            type="button"
            className={`live-btn ${isMuted ? 'btn-danger' : 'btn-ghost'}`}
            onClick={onToggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          {onToggleCamera && (
            <button
              type="button"
              className={`live-btn ${cameraOn ? 'btn-active' : 'btn-ghost'}`}
              onClick={onToggleCamera}
              title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
            </button>
          )}

          {onToggleScreen && (
            <button
              type="button"
              className={`live-btn ${screenOn ? 'btn-active' : 'btn-ghost'}`}
              onClick={onToggleScreen}
              title={screenOn ? 'Stop screen share' : 'Share screen'}
            >
              {screenOn ? <Monitor size={16} /> : <MonitorOff size={16} />}
            </button>
          )}

          <button
            type="button"
            className="live-btn btn-end-call"
            onClick={onEndSession}
            title="End live voice session & generate recap"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
