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
  activeTool,
  isThinking,
  liveStatusText,
  onCopy,
  copiedIdx,
  formatTime,
  features,
}) {
  if (!isOpen) return null

  return (
    <div className={`live-transcript-panel ${isOpen ? 'open' : ''}`}>
      <div className="live-transcript-header">
        <h3>Transcript & Live Activity</h3>
        <button className="live-transcript-close" onClick={onClose} aria-label="Close transcript">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="live-transcript-body">
        {transcript.length === 0 && (
          <div className="live-transcript-empty">
            <p>Conversation and live actions will appear here…</p>
            <p style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
              Ask out loud to generate images & videos, create files, run code and tests,
              search the web, or read your shared screen — AI reasoning and tool steps show up in real-time.
            </p>
          </div>
        )}
        {transcript.map((item, i) => {
          if (item.type === 'status') {
            return (
              <div key={i} className="live-transcript-tool" style={{
                color: '#38bdf8',
                borderColor: 'rgba(56, 189, 248, 0.25)',
                background: 'rgba(56, 189, 248, 0.08)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                margin: '4px 0',
              }}>
                <span>⚡ {item.text}</span>
                <time style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>{formatTime(item.time)}</time>
              </div>
            )
          }
          if (item.type === 'tool') {
            return (
              <div key={i} className="live-transcript-tool-call" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                margin: '5px 0',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.12) 100%)',
                border: '1px solid rgba(129, 140, 248, 0.4)',
                borderRadius: '8px',
                color: '#c7d2fe',
                fontSize: '12px',
                fontWeight: 500,
              }}>
                <Wrench size={13} style={{ color: '#a5b4fc', flexShrink: 0 }} />
                <span>AI Tool Invoked: <strong style={{ color: '#ffffff', letterSpacing: '0.2px' }}>{item.name}</strong></span>
                <time style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.65 }}>{formatTime(item.time)}</time>
              </div>
            )
          }
          if (item.type === 'toolResult') {
            // Rich render: generated images, videos, audio, files, code output.
            if (item.result && typeof item.result === 'object') {
              return (
                <div key={i} className="live-transcript-result" style={{ margin: '5px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#34d399', marginBottom: 4, fontWeight: 500 }}>
                    <Check size={12} /> <span>Tool complete: <strong>{item.name}</strong></span>
                  </div>
                  <ToolResultCard tool={item.name} result={item.result} compact={true} />
                </div>
              )
            }
            const text = typeof item.result === 'string' ? item.result : ''
            return (
              <div key={i} className="live-transcript-tool result" style={{
                padding: '6px 10px',
                margin: '4px 0',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#a7f3d0',
              }}>
                <span style={{ fontWeight: 600 }}>↳ {item.name}:</span> <span style={{ opacity: 0.9 }}>{text.slice(0, 180)}{text.length > 180 ? '…' : ''}</span>
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
                <details className="reasoning-bubble" open style={{
                  margin: '8px 0',
                  fontSize: '11.5px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(147, 197, 253, 0.25)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}>
                  <summary className="reasoning-summary" style={{
                    cursor: 'pointer',
                    color: '#93c5fd',
                    fontWeight: 600,
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <span>🧠 AI Reasoning & Thought Process</span>
                    {item.streaming && !item.text && (
                      <span style={{ fontSize: '10px', color: '#60a5fa', opacity: 0.85 }}>
                        (formulating response…)
                      </span>
                    )}
                  </summary>
                  <div className="reasoning-body" style={{
                    marginTop: '8px',
                    whiteSpace: 'pre-wrap',
                    color: '#cbd5e1',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    lineHeight: '1.45',
                    maxHeight: '220px',
                    overflowY: 'auto',
                  }}>
                    {item.reasoning}
                  </div>
                </details>
              )}
              {item.text ? (
                <p>{item.text}</p>
              ) : (
                item.streaming && item.role === 'assistant' && (
                  <p style={{ fontStyle: 'italic', opacity: 0.65, fontSize: '12px', margin: '4px 0' }}>
                    Formulating response…
                  </p>
                )
              )}
            </div>
          )
        })}
        {(isThinking || activeTool || liveStatusText) && (
          <div className="live-transcript-live-pill" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            margin: '8px 0',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#7dd3fc',
            fontSize: '11.5px',
            fontWeight: 500,
          }}>
            <span style={{ display: 'inline-block' }}>⚡</span>
            <span>
              {activeTool ? `Using Tool: ${activeTool}` : (liveStatusText || 'Reasoning & formulating response…')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}