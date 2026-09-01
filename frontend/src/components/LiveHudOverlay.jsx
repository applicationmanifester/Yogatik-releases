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
      justifyContent: 'flex-end',
      padding: '20px',
      zIndex: 10,
    }}>

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
