import React, { useState } from 'react'
import { Scan, Focus, Sparkles, Pill, Barcode, Check } from 'lucide-react'

/**
 * Live Camera Viewfinder HUD Overlay with target reticles and instant recognition triggers.
 */
export function LiveHudOverlay({
  onIdentifyPill,
  onScanBarcode,
  // LiveView passes `onEnhanceMacro`. This was declared as `onEnhanceContrast`,
  // and because the button is rendered behind `{onEnhance… && (…)}` the whole
  // control simply did not appear — no error, no empty button, nothing. Same
  // reader/writer name drift as is_dir/isDir and doc.text/doc.chunks; the guard
  // against it here is that the prop name must match the caller, so keep this
  // named after what LiveView sends.
  onEnhanceMacro,
  isAnalyzing = false,
  detectedTargets = [],
}) {
  const [activeMode, setActiveMode] = useState('auto') // 'auto' | 'pill' | 'barcode'

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '20px',
      zIndex: 10,
    }}>
      {/* Top HUD Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '999px',
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 600,
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isAnalyzing ? '#f59e0b' : '#10b981',
            boxShadow: `0 0 10px ${isAnalyzing ? '#f59e0b' : '#10b981'}`,
          }} />
          <span>{isAnalyzing ? 'Analyzing live frame…' : 'AI Vision HUD Active'}</span>
        </div>
      </div>

      {/* Center Reticle / Scanning Crosshairs */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(280px, 70vw)',
        height: 'min(280px, 70vw)',
        border: '2px dashed rgba(59, 130, 246, 0.5)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 30px rgba(59, 130, 246, 0.15)',
      }}>
        <div style={{
          position: 'absolute',
          top: '-10px',
          left: '-10px',
          width: '24px',
          height: '24px',
          borderTop: '3px solid #3b82f6',
          borderLeft: '3px solid #3b82f6',
          borderTopLeftRadius: '12px',
        }} />
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          width: '24px',
          height: '24px',
          borderTop: '3px solid #3b82f6',
          borderRight: '3px solid #3b82f6',
          borderTopRightRadius: '12px',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10px',
          left: '-10px',
          width: '24px',
          height: '24px',
          borderBottom: '3px solid #3b82f6',
          borderLeft: '3px solid #3b82f6',
          borderBottomLeftRadius: '12px',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10px',
          right: '-10px',
          width: '24px',
          height: '24px',
          borderBottom: '3px solid #3b82f6',
          borderRight: '3px solid #3b82f6',
          borderBottomRightRadius: '12px',
        }} />

        {/* Laser scan line animation */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
          boxShadow: '0 0 12px #3b82f6',
          animation: 'scanLaser 2.5s infinite ease-in-out',
        }} />
      </div>

      {/* Bottom Mode Toolbar.
          Positioned by CSS class, not by this flex column: the overlay is
          `inset: 0` with `space-between`, so this row landed wherever the
          column pushed it — in the shipped build that was UNDER the control
          bar, and on a phone under the home indicator, where it cannot be
          tapped at all. `.live-hud-actions` pins it directly above the
          controls with a safe-area offset. */}
      <div className="live-hud-actions" style={{
        alignItems: 'center',
        pointerEvents: 'auto',
      }}>
        {onIdentifyPill && (
          <button
            onClick={onIdentifyPill}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#f3f4f6',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            <Pill size={14} color="#60a5fa" />
            <span>Identify Pill</span>
          </button>
        )}

        {onScanBarcode && (
          <button
            onClick={onScanBarcode}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#f3f4f6',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            <Barcode size={14} color="#34d399" />
            <span>Scan Barcode</span>
          </button>
        )}

        {onEnhanceMacro && (
          <button
            onClick={onEnhanceMacro}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#f3f4f6',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            }}
          >
            <Sparkles size={14} color="#fbbf24" />
            <span>Enhance Macro</span>
          </button>
        )}
      </div>
    </div>
  )
}
