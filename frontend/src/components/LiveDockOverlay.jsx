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
    <div
      className="live-dock-overlay"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        pointerEvents: 'auto',
        animation: 'liveDockDrop 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Dynamic Island Capsule */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 14px 6px 10px',
          background: 'rgba(11, 17, 32, 0.85)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: isToolActive
            ? '1px solid rgba(129, 140, 248, 0.55)'
            : thinking
            ? '1px solid rgba(56, 189, 248, 0.55)'
            : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          boxShadow: isToolActive
            ? '0 8px 32px rgba(99, 102, 241, 0.25), 0 2px 8px rgba(0,0,0,0.5)'
            : thinking
            ? '0 8px 32px rgba(56, 189, 248, 0.25), 0 2px 8px rgba(0,0,0,0.5)'
            : '0 8px 24px rgba(0,0,0,0.4)',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Reactive Micro-Orb */}
        <div
          onClick={onExpandCinema}
          title="Click to expand to Cinema mode"
          style={{
            position: 'relative',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Outer glow ring */}
          <div
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              background: speaking
                ? 'radial-gradient(circle, rgba(56, 189, 248, 0.8) 0%, rgba(99, 102, 241, 0.2) 70%, transparent 100%)'
                : thinking
                ? 'radial-gradient(circle, rgba(168, 85, 247, 0.8) 0%, rgba(56, 189, 248, 0.2) 70%, transparent 100%)'
                : 'radial-gradient(circle, rgba(56, 189, 248, 0.4) 0%, transparent 70%)',
              transform: `scale(${orbScale})`,
              transition: 'transform 0.08s ease-out',
              opacity: speaking || thinking ? 0.9 : 0.4,
              filter: 'blur(3px)',
            }}
          />
          {/* Core sphere */}
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: speaking
                ? 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)'
                : thinking
                ? 'linear-gradient(135deg, #a855f7 0%, #38bdf8 100%)'
                : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              border: '1.5px solid rgba(255, 255, 255, 0.4)',
              boxShadow: speaking ? '0 0 10px #38bdf8' : thinking ? '0 0 10px #a855f7' : 'none',
              transform: `scale(${orbScale})`,
              transition: 'transform 0.08s ease-out, background 0.2s ease',
            }}
          />
        </div>

        {/* Status text & tool info */}
        <div
          onClick={() => setIsExpanded(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#f1f5f9',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {isToolActive ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#a5b4fc', fontWeight: 600 }}>
              <Wrench size={12} style={{ animation: 'spin 2s linear infinite' }} />
              <span>{tool}</span>
            </span>
          ) : thinking ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#38bdf8', fontWeight: 600 }}>
              <Sparkles size={12} style={{ animation: 'pulse 1.2s ease infinite' }} />
              <span>Thinking…</span>
            </span>
          ) : speaking ? (
            <span style={{ color: '#67e8f9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              Speaking
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '11px' }}>
              {liveStatusText || 'Yogatik Live'}
            </span>
          )}

          {/* Active Artifact Chip if available */}
          {activeArtifact && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSelectArtifact?.(activeArtifact)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '10px',
                color: '#38bdf8',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="View generated artifact"
            >
              <Layers size={10} />
              <span>Artifact</span>
            </button>
          )}
        </div>

        {/* Quick Dock Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '8px' }}>
          {/* Mic Mute Toggle */}
          <button
            onClick={onToggleMute}
            title={muted ? 'Unmute microphone' : 'Mute microphone'}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: muted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: muted ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid transparent',
              color: muted ? '#f87171' : '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {muted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          {/* Speaker Mute Toggle */}
          <button
            onClick={onToggleSpeakerMute}
            title={speakerMuted ? 'Unmute voice output' : 'Mute voice output'}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: speakerMuted ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              border: speakerMuted ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
              color: speakerMuted ? '#fbbf24' : '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {speakerMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={onToggleCam}
            title={camOn ? 'Turn off camera' : 'Turn on camera'}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: camOn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: camOn ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent',
              color: camOn ? '#4ade80' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {camOn ? <Video size={13} /> : <VideoOff size={13} />}
          </button>

          {/* Expand to Cinema Mode */}
          <button
            onClick={onExpandCinema}
            title="Expand to Fullscreen Cinema Mode"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid transparent',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Maximize2 size={13} />
          </button>

          {/* Popout Picture-in-Picture */}
          {onPopoutPip && (
            <button
              onClick={onPopoutPip}
              title="Pop out to floating desktop window (PiP)"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid transparent',
                color: '#a5b4fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <PictureInPicture2 size={13} />
            </button>
          )}

          {/* End Call */}
          <button
            onClick={onEndCall}
            title="End Live Call"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.3)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <PhoneOff size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
