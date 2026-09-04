import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight, Wrench, Copy, Check, Zap, Brain, Clock, Activity, Search, Globe, Cpu, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { ToolResultCard } from './ToolResultCard'

/**
 * Live Transcript & Activity Feed — Full AI transparency panel.
 *
 * Shows everything the AI is doing in real-time:
 * - Reasoning / thinking with elapsed timer
 * - Tool invocations with tool name and animated spinner
 * - Tool results with rich cards
 * - Status updates with categorised icons
 * - Performance metrics per turn (TTFT, total time)
 * - Full conversation transcript with copy support
 */

function statusIcon(text = '') {
  const t = text.toLowerCase()
  if (t.includes('search') || t.includes('browsing')) return <Search size={12} />
  if (t.includes('tool') || t.includes('using')) return <Wrench size={12} />
  if (t.includes('streaming')) return <Zap size={12} />
  if (t.includes('thinking') || t.includes('formulating') || t.includes('reasoning')) return <Brain size={12} />
  if (t.includes('complete') || t.includes('done') || t.includes('✅')) return <CheckCircle2 size={12} />
  if (t.includes('fast') || t.includes('⚡')) return <Zap size={12} />
  if (t.includes('switch') || t.includes('provider') || t.includes('model')) return <Cpu size={12} />
  if (t.includes('error') || t.includes('failed') || t.includes('timeout')) return <AlertCircle size={12} />
  return <Activity size={12} />
}

function statusColor(text = '') {
  const t = text.toLowerCase()
  if (t.includes('complete') || t.includes('✅')) return { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.35)', color: '#86efac' }
  if (t.includes('error') || t.includes('failed') || t.includes('timeout')) return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', color: '#fca5a5' }
  if (t.includes('fast') || t.includes('⚡') || t.includes('streaming')) return { bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)', color: '#7dd3fc' }
  return { bg: 'rgba(56, 189, 248, 0.08)', border: 'rgba(56, 189, 248, 0.25)', color: '#93c5fd' }
}

/** Elapsed timer that ticks every 100ms while thinking is active */
function ThinkingTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime) return
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(id)
  }, [startTime])
  return <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 36, display: 'inline-block' }}>{(elapsed / 1000).toFixed(1)}s</span>
}

export function LiveTranscriptPanel({
  isOpen,
  onClose,
  transcript,
  activeTool,
  isThinking,
  thinkingStartTime,
  liveStatusText,
  onCopy,
  copiedIdx,
  formatTime,
  features,
  activeProvider,
  activeModel,
}) {
  const bodyRef = useRef(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [transcript, isThinking, activeTool, liveStatusText])

  if (!isOpen) return null

  return (
    <div className={`live-transcript-panel ${isOpen ? 'open' : ''}`}>
      <div className="live-transcript-header">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} style={{ color: '#38bdf8' }} />
          Transcript & AI Activity
        </h3>
        <button className="live-transcript-close" onClick={onClose} aria-label="Close transcript">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Active model badge */}
      {(activeProvider || activeModel) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', margin: '0 12px 6px',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '6px', fontSize: '11px', color: '#a5b4fc',
        }}>
          <Cpu size={11} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{activeProvider || 'AI'}</span>
          {activeModel && <span style={{ opacity: 0.7 }}>· {String(activeModel).split('/').pop().slice(0, 30)}</span>}
        </div>
      )}

      <div className="live-transcript-body" ref={bodyRef}>
        {transcript.length === 0 && (
          <div className="live-transcript-empty">
            <p>Conversation and live AI activity will appear here…</p>
            <p style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
              You'll see AI reasoning, tool usage, search results, and performance metrics in real time.
              Ask out loud to generate images & videos, create files, run code, or search the web.
            </p>
          </div>
        )}
        {transcript.map((item, i) => {
          // ── Status event ──
          if (item.type === 'status') {
            const sc = statusColor(item.text)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', margin: '3px 0',
                background: sc.bg, border: `1px solid ${sc.border}`,
                borderRadius: '6px', fontSize: '11px', color: sc.color,
                animation: 'liveFadeIn 0.2s ease-out',
              }}>
                {statusIcon(item.text)}
                <span style={{ flex: 1 }}>{item.text}</span>
                <time style={{ fontSize: '10px', opacity: 0.6, flexShrink: 0 }}>{formatTime(item.time)}</time>
              </div>
            )
          }

          // ── Tool invocation ──
          if (item.type === 'tool') {
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', margin: '4px 0',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.12) 100%)',
                border: '1px solid rgba(129, 140, 248, 0.4)',
                borderRadius: '8px', color: '#c7d2fe', fontSize: '12px', fontWeight: 500,
                animation: 'liveFadeIn 0.25s ease-out',
              }}>
                <Wrench size={13} style={{ color: '#a5b4fc', flexShrink: 0, animation: 'spin 2s linear infinite' }} />
                <span style={{ flex: 1 }}>
                  🔧 <strong style={{ color: '#e0e7ff', letterSpacing: '0.2px' }}>{item.name}</strong>
                  <span style={{ opacity: 0.6, marginLeft: 6, fontSize: '10px' }}>executing…</span>
                </span>
                <time style={{ fontSize: '10px', opacity: 0.6, flexShrink: 0 }}>{formatTime(item.time)}</time>
              </div>
            )
          }

          // ── Tool result ──
          if (item.type === 'toolResult') {
            if (item.result && typeof item.result === 'object') {
              return (
                <div key={i} style={{ margin: '4px 0', animation: 'liveFadeIn 0.3s ease-out' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: '11px', color: '#34d399', marginBottom: 4, fontWeight: 600,
                  }}>
                    <CheckCircle2 size={12} />
                    <span>✅ Tool complete: <strong>{item.name}</strong></span>
                    <time style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}>{formatTime(item.time)}</time>
                  </div>
                  <ToolResultCard tool={item.name} result={item.result} compact={true} />
                </div>
              )
            }
            const text = typeof item.result === 'string' ? item.result : ''
            return (
              <div key={i} style={{
                padding: '6px 10px', margin: '3px 0',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '6px', fontSize: '11px', color: '#a7f3d0',
                animation: 'liveFadeIn 0.3s ease-out',
              }}>
                <span style={{ fontWeight: 600 }}>↳ {item.name}:</span>{' '}
                <span style={{ opacity: 0.9 }}>{text.slice(0, 180)}{text.length > 180 ? '…' : ''}</span>
              </div>
            )
          }

          // ── Message (user or assistant) ──
          return (
            <div key={i} className={`live-transcript-msg ${item.role}`} style={{ animation: 'liveFadeIn 0.2s ease-out' }}>
              <div className="live-transcript-msg-header">
                <span className="live-transcript-role" style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {item.role === 'user' ? '🎙️ You' : '🤖 Yogatik'}
                </span>
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

              {/* Reasoning / thinking section */}
              {item.reasoning && (
                <details className="reasoning-bubble" open style={{
                  margin: '6px 0',
                  fontSize: '11.5px',
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.82) 0%, rgba(30, 41, 59, 0.72) 100%)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(147, 197, 253, 0.25)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}>
                  <summary style={{
                    cursor: 'pointer',
                    color: '#93c5fd',
                    fontWeight: 600,
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Brain size={13} style={{ color: '#60a5fa' }} />
                    <span>AI Reasoning & Thought Process</span>
                    {item.streaming && !item.text && (
                      <span style={{ fontSize: '10px', color: '#60a5fa', opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                        formulating…
                      </span>
                    )}
                  </summary>
                  <div style={{
                    marginTop: '8px',
                    whiteSpace: 'pre-wrap',
                    color: '#cbd5e1',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    lineHeight: '1.45',
                    fontSize: '11px',
                    maxHeight: '250px',
                    overflowY: 'auto',
                  }}>
                    {item.reasoning}
                  </div>
                </details>
              )}

              {/* Message text */}
              {item.text ? (
                <p>{item.text}</p>
              ) : (
                item.streaming && item.role === 'assistant' && (
                  <p style={{
                    fontStyle: 'italic', opacity: 0.65, fontSize: '12px', margin: '4px 0',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    Formulating response…
                  </p>
                )
              )}

              {/* Turn metrics */}
              {item.turnTimeMs && item.role === 'assistant' && !item.streaming && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: '10px', color: '#64748b', marginTop: 4,
                }}>
                  <Clock size={10} />
                  <span>Turn: {(item.turnTimeMs / 1000).toFixed(1)}s</span>
                  {item.toolsUsed && <span>· Tools: {item.toolsUsed}</span>}
                </div>
              )}
            </div>
          )
        })}

        {/* Live activity indicator (at bottom) */}
        {(isThinking || activeTool || liveStatusText) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', margin: '8px 0',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.14) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            color: '#7dd3fc', fontSize: '12px', fontWeight: 500,
            animation: 'liveFadeIn 0.25s ease-out',
          }}>
            {activeTool ? (
              <>
                <Wrench size={14} style={{ animation: 'spin 2s linear infinite', color: '#a5b4fc' }} />
                <span>🔧 Using: <strong style={{ color: '#e0e7ff' }}>{activeTool}</strong></span>
              </>
            ) : isThinking ? (
              <>
                <Brain size={14} style={{ color: '#60a5fa', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span>
                  🧠 Thinking…{' '}
                  {thinkingStartTime && <ThinkingTimer startTime={thinkingStartTime} />}
                </span>
              </>
            ) : (
              <>
                {statusIcon(liveStatusText)}
                <span>{liveStatusText}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}