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
    <div
      className="live-artifact-stage"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
        animation: 'liveArtifactSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.4)',
        }}
      >
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
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: activeIndex <= 0 ? '#475569' : '#94a3b8',
                  cursor: activeIndex <= 0 ? 'default' : 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Previous artifact"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={activeIndex >= artifacts.length - 1}
                onClick={() => onSelectIndex?.(Math.min(artifacts.length - 1, activeIndex + 1))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: activeIndex >= artifacts.length - 1 ? '#475569' : '#94a3b8',
                  cursor: activeIndex >= artifacts.length - 1 ? 'default' : 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Next artifact"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Close canvas"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main card content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
        }}
      >
        {current.type === 'toolResult' || current.type === 'tool' ? (
          <ToolResultCard
            tool={current.name}
            result={current.result}
            args={current.args}
          />
        ) : (
          <div
            style={{
              padding: '16px',
              background: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              fontSize: '13px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {current.text || JSON.stringify(current, null, 2)}
          </div>
        )}
      </div>
    </div>
  )
}
