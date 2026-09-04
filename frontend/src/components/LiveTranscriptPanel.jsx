import React from 'react'
import { ChevronRight, Wrench, Copy, Check } from 'lucide-react'
import { ToolResultCard } from './ToolResultCard'

/**
 * Live Transcript Panel - Slide-out sidebar showing conversation history
 * with rich tool result rendering
 */
export function LiveTranscriptPanel({
  isOpen,
  onClose,
  transcript,
  onCopy,
  copiedIdx,
  formatTime,
  features,
}) {
  if (!isOpen) return null

  return (
    <div className={`live-transcript-panel ${isOpen ? 'open' : ''}`}>
      <div className="live-transcript-header">
        <h3>Transcript</h3>
        <button className="live-transcript-close" onClick={onClose}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="live-transcript-body">
        {transcript.length === 0 && (
          <div className="live-transcript-empty">
            <p>Conversation will appear here…</p>
            <p style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
              Ask out loud to generate images & videos, create files, run code and tests,
              search the web, or read your shared screen — results show up right here.
            </p>
          </div>
        )}
        {transcript.map((item, i) => {
          if (item.type === 'status') {
            return (
              <div key={i} className="live-transcript-tool" style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.25)', background: 'rgba(56, 189, 248, 0.06)' }}>
                <span>⚡ {item.text}</span>
                <time>{formatTime(item.time)}</time>
              </div>
            )
          }
          if (item.type === 'tool') {
            return (
              <div key={i} className="live-transcript-tool">
                <Wrench size={12} /> <span>{item.name}</span>
                <time>{formatTime(item.time)}</time>
              </div>
            )
          }
          if (item.type === 'toolResult') {
            // Rich render: generated images, videos, audio, files, code output.
            if (item.result && typeof item.result === 'object') {
              return (
                <div key={i} className="live-transcript-result">
                  <ToolResultCard tool={item.name} result={item.result} compact={true} />
                </div>
              )
            }
            const text = typeof item.result === 'string' ? item.result : ''
            return (
              <div key={i} className="live-transcript-tool result">
                <span>↳ {text.slice(0, 160)}{text.length > 160 ? '…' : ''}</span>
              </div>
            )
          }
          return (
            <div key={i} className={`live-transcript-msg ${item.role}`}>
              <div className="live-transcript-msg-header">
                <span className="live-transcript-role">{item.role === 'user' ? 'You' : 'Yogatik'}</span>
                {item.streaming && <span className="streaming-indicator" aria-label="Streaming">▊</span>}
                <time>{formatTime(item.time)}</time>
                <button
                  className="live-transcript-copy"
                  onClick={() => onCopy(item.text, i)}
                  aria-label="Copy message"
                >
                  {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              {item.reasoning && (
                <details className="reasoning-bubble" style={{ margin: '6px 0 8px 0', fontSize: '11px', background: 'rgba(30, 41, 59, 0.6)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(148, 163, 184, 0.15)' }}>
                  <summary className="reasoning-summary" style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 600, userSelect: 'none' }}>
                    🧠 Thinking & Reasoning Process
                  </summary>
                  <div className="reasoning-body" style={{ marginTop: '6px', whiteSpace: 'pre-wrap', opacity: 0.85, fontFamily: 'monospace', lineHeight: '1.4' }}>
                    {item.reasoning}
                  </div>
                </details>
              )}
              <p>{item.text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}