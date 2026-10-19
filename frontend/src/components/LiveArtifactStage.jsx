import React from 'react'
import { Sparkles, X, ChevronLeft, ChevronRight, Copy, Check, ExternalLink, Layers } from 'lucide-react'
import { ToolResultCard } from './ToolResultCard'

/**
 * LiveArtifactStage: The visual spatial stage in Yogatik Live.
 * Renders interactive artifacts (charts, diffs, web cards, code outputs)
 * side-by-side with the voice orb without interrupting speech flow.
 */
export function LiveArtifactStage({
  artifacts = [],
  activeIndex = 0,
  onSelectIndex,
  onClose,
}) {
  if (!artifacts || artifacts.length === 0) return null

  const current = artifacts[activeIndex] || artifacts[artifacts.length - 1]
  if (!current) return null

  return (
    <div className="live-artifact-stage">
      {/* Header bar */}
      <div className="live-artifact-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
            }}
          >
            <Layers size={13} />
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
            Live Spatial Canvas
          </span>
          {artifacts.length > 1 && (
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              ({activeIndex + 1}/{artifacts.length})
            </span>
          )}
        </div>

        {/* Carousel pagination & close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {artifacts.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 6 }}>
              <button
                disabled={activeIndex <= 0}
                onClick={() => onSelectIndex?.(Math.max(0, activeIndex - 1))}
                title="Previous artifact"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={activeIndex >= artifacts.length - 1}
                onClick={() => onSelectIndex?.(Math.min(artifacts.length - 1, activeIndex + 1))}
                title="Next artifact"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            title="Close canvas"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main card content */}
      <div className="live-artifact-content">
        {(current.type === 'toolResult' || current.type === 'tool' || (current.name && current.result !== undefined)) ? (
          <ToolResultCard
            tool={current.name}
            result={current.result}
            args={current.args || {}}
          />
        ) : (
          <div className="live-artifact-fallback">
            {current.text || JSON.stringify(current, null, 2)}
          </div>
        )}
      </div>
    </div>
  )
}
