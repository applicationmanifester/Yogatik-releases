import React from 'react'
import { Target, Scan } from 'lucide-react'

/**
 * LiveTelestration: Augmented reality / visual focus overlay on video and screen feeds.
 * Renders high-tech laser focal brackets and target labels over points of interest.
 */
export function LiveTelestration({
  targets = [],
  activeTarget = null,
  videoWidth = 640,
  videoHeight = 480,
  onTargetClick,
}) {
  if ((!targets || targets.length === 0) && !activeTarget) return null

  const items = activeTarget ? [activeTarget, ...targets.filter(t => t.id !== activeTarget.id)] : targets

  return (
    <div
      className="live-telestration-layer"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <svg
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        viewBox={`0 0 ${videoWidth} ${videoHeight}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="telestrationGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
          </linearGradient>
          <filter id="neonBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {items.map((t, i) => {
          // Normalized or pixel coordinates
          const box = t.box || t.bbox || { x: 50, y: 50, w: 100, h: 80 }
          const x = box.x < 1 ? box.x * videoWidth : box.x
          const y = box.y < 1 ? box.y * videoHeight : box.y
          const w = box.w < 1 ? box.w * videoWidth : box.w
          const h = box.h < 1 ? box.h * videoHeight : box.h
          const corner = Math.min(16, Math.min(w, h) / 3)

          return (
            <g
              key={t.id || i}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={() => onTargetClick?.(t)}
            >
              {/* Corner brackets for sci-fi HUD look */}
              {/* Top-Left */}
              <path
                d={`M ${x} ${y + corner} L ${x} ${y} L ${x + corner} ${y}`}
                fill="none"
                stroke="url(#telestrationGlow)"
                strokeWidth="2.5"
                filter="url(#neonBlur)"
              />
              {/* Top-Right */}
              <path
                d={`M ${x + w - corner} ${y} L ${x + w} ${y} L ${x + w} ${y + corner}`}
                fill="none"
                stroke="url(#telestrationGlow)"
                strokeWidth="2.5"
                filter="url(#neonBlur)"
              />
              {/* Bottom-Right */}
              <path
                d={`M ${x + w} ${y + h - corner} L ${x + w} ${y + h} L ${x + w - corner} ${y + h}`}
                fill="none"
                stroke="url(#telestrationGlow)"
                strokeWidth="2.5"
                filter="url(#neonBlur)"
              />
              {/* Bottom-Left */}
              <path
                d={`M ${x + corner} ${y + h} L ${x} ${y + h} L ${x} ${y + h - corner}`}
                fill="none"
                stroke="url(#telestrationGlow)"
                strokeWidth="2.5"
                filter="url(#neonBlur)"
              />

              {/* Label banner */}
              {t.label && (
                <g transform={`translate(${x}, ${Math.max(16, y - 6)})`}>
                  <rect
                    x="0"
                    y="-16"
                    width={Math.max(60, t.label.length * 8 + 14)}
                    height="18"
                    rx="4"
                    fill="rgba(15, 23, 42, 0.8)"
                    stroke="rgba(56, 189, 248, 0.4)"
                    strokeWidth="1"
                  />
                  <text
                    x="7"
                    y="-3"
                    fill="#38bdf8"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {t.label}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
