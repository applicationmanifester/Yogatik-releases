import React, { useEffect, useRef, useState, useMemo } from 'react'
import { ChevronRight, Wrench, Copy, Check, Zap, Brain, Clock, Activity, Search, Cpu, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
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
 * - Search/filter to find specific moments
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
  if (t.includes('complete') || t.includes('✅')) return { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.35)', color: 'var(--live-text-accent-success, #16a34a)' }
  if (t.includes('error') || t.includes('failed') || t.includes('timeout')) return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', color: 'var(--live-text-accent-error, #dc2626)' }
  if (t.includes('fast') || t.includes('⚡') || t.includes('streaming')) return { bg: 'rgba(56, 189, 248, 0.1)', border: 'rgba(56, 189, 248, 0.3)', color: 'var(--live-text-accent-info, #0284c7)' }
  return { bg: 'var(--live-surface, rgba(0,0,0,0.04))', border: 'var(--live-border, rgba(0,0,0,0.08))', color: 'var(--live-text-dim, #64748b)' }
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
  const transcriptEndRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'user' | 'assistant' | 'tool' | 'status'

  // Auto-scroll to bottom on new entries (unless user scrolled up)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  
  useEffect(() => {
    if (bodyRef.current && !userScrolledUp) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [transcript, isThinking, activeTool, liveStatusText, userScrolledUp])

  const handleScroll = () => {
    if (bodyRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = bodyRef.current
      setUserScrolledUp(scrollHeight - scrollTop - clientHeight > 50)
    }
  }

  // Filter transcript based on search query and filter type
  const filteredTranscript = useMemo(() => {
    return transcript.filter(item => {
      // Type filter
      if (filterType !== 'all') {
        if (filterType === 'user' && item.role !== 'user') return false
        if (filterType === 'assistant' && item.role !== 'assistant') return false
        if (filterType === 'tool' && item.type !== 'tool' && item.type !== 'toolResult') return false
        if (filterType === 'status' && item.type !== 'status') return false
      }
      
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const searchableText = [
          item.text,
          item.name,
          item.reasoning,
          item.type,
          item.role,
        ].filter(Boolean).join(' ').toLowerCase()
        
        if (!searchableText.includes(q)) return false
      }
      
      return true
    })
  }, [transcript, searchQuery, filterType])

  if (!isOpen) return null

  return (
    <div className={`live-transcript-panel ${isOpen ? 'open' : ''}`}>
      <div className="live-transcript-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Activity size={16} style={{ color: '#38bdf8' }} />
            Transcript & AI Activity
          </h3>
          {/* Search box */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search transcript…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 32px',
                background: 'var(--live-surface, rgba(0, 0, 0, 0.04))',
                border: '1px solid var(--live-border, rgba(0, 0, 0, 0.1))',
                borderRadius: '6px',
                color: 'var(--live-text, #0f172a)',
                fontSize: '12px',
                outline: 'none',
              }}
              onFocus={() => {}}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 2,
                }}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {/* Filter dropdown */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{
              padding: '6px 10px',
              background: 'var(--live-surface, rgba(0, 0, 0, 0.04))',
              border: '1px solid var(--live-border, rgba(0, 0, 0, 0.1))',
              borderRadius: '6px',
              color: 'var(--live-text, #0f172a)',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer',
            }}
            aria-label="Filter by type"
          >
            <option value="all">All</option>
            <option value="user">🎙️ You</option>
            <option value="assistant">🤖 Assistant</option>
            <option value="tool">🔧 Tools</option>
            <option value="status">📋 Status</option>
          </select>
        </div>
        <button className="live-transcript-close" onClick={onClose} aria-label="Close transcript">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Active model badge */}
      {(activeProvider || activeModel) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', margin: '0 12px 6px',
          background: 'var(--live-surface, rgba(0, 0, 0, 0.04))',
          border: '1px solid var(--live-border, rgba(0, 0, 0, 0.08))',
          borderRadius: '6px', fontSize: '11px', color: 'var(--live-text, #0f172a)',
        }}>
          <Cpu size={11} style={{ flexShrink: 0, color: 'var(--accent, #ff6b35)' }} />
          <span style={{ fontWeight: 600 }}>{activeProvider || 'AI'}</span>
          {activeModel && <span style={{ opacity: 0.7 }}>· {String(activeModel).split('/').pop().slice(0, 30)}</span>}
        </div>
      )}

      {/* Results count */}
      {searchQuery && (
        <div style={{
          padding: '4px 14px', margin: '0 12px',
          fontSize: '11px', color: '#64748b',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{filteredTranscript.length} of {transcript.length} entries match</span>
          <button
            onClick={() => { setSearchQuery(''); setFilterType('all'); }}
            style={{
              background: 'none', border: 'none', color: '#38bdf8',
              fontSize: '11px', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="live-transcript-body" ref={bodyRef} onScroll={handleScroll}>
        {filteredTranscript.length === 0 && transcript.length > 0 && (
          <div className="live-transcript-empty" style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
            <Search size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
            <p>No entries match your search/filter.</p>
            <p style={{ marginTop: 8, fontSize: 11 }}>Try clearing filters or adjusting your search.</p>
          </div>
        )}
        {filteredTranscript.length === 0 && transcript.length === 0 && (
          <div className="live-transcript-empty">
            <p>Conversation and live AI activity will appear here…</p>
            <p style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
              You'll see AI reasoning, tool usage, search results, and performance metrics in real time.
              Ask out loud to generate images & videos, create files, run code, or search the web.
            </p>
          </div>
        )}
        {filteredTranscript.map((item, originalIndex) => {
          // ── Status event ──
          if (item.type === 'status') {
            const sc = statusColor(item.text)
            return (
              <div key={originalIndex} style={{
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
              <div key={originalIndex} style={{
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
                <div key={originalIndex} style={{ margin: '4px 0', animation: 'liveFadeIn 0.3s ease-out' }}>
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
              <div key={originalIndex} style={{
                padding: '6px 10px', margin: '3px 0',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '6px', fontSize: '11px', color: 'var(--live-text-accent-success, #16a34a)',
                animation: 'liveFadeIn 0.3s ease-out',
              }}>
                <span style={{ fontWeight: 600 }}>↳ {item.name}:</span>{' '}
                <span style={{ opacity: 0.9 }}>{text.slice(0, 180)}{text.length > 180 ? '…' : ''}</span>
              </div>
            )
          }

          // ── Message (user or assistant) ──
          return (
            <div key={originalIndex} className={`live-transcript-msg ${item.role}`} style={{ animation: 'liveFadeIn 0.2s ease-out' }}>
              <div className="live-transcript-msg-header">
                <span className="live-transcript-role" style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {item.role === 'user' ? '🎙️ You' : '🤖 Yogatik'}
                </span>
                {item.streaming && item.role === 'assistant' && <span className="streaming-indicator" aria-label="Streaming" />}
                <time>{formatTime(item.time)}</time>
                <button
                  className="live-transcript-copy"
                  onClick={() => onCopy(item.text, originalIndex)}
                  aria-label="Copy message"
                >
                  {copiedIdx === originalIndex ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              {item.reasoning && (
                <details className="live-transcript-reasoning" open>
                  <summary style={{ cursor: 'pointer', fontSize: '11px', color: '#a5b4fc', marginBottom: 4 }}>
                    <Brain size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} /> Reasoning
                    {item.reasoningTime && <span style={{ marginLeft: 8 }}><Clock size={10} /> {(item.reasoningTime / 1000).toFixed(1)}s</span>}
                  </summary>
                  <pre style={{
                    marginTop: 4, padding: '8px', background: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: '6px', fontSize: '11px', lineHeight: 1.5,
                    overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    color: '#c7d2fe',
                  }}>{item.reasoning}</pre>
                </details>
              )}
              {item.ttftMs != null && (
                <div style={{ fontSize: '10px', color: '#38bdf8', marginTop: -4, marginBottom: 4 }}>
                  ⚡ TTFT:{' '}
                  {item.ttftMs < 1000 ? `<${item.ttftMs}ms` : `${(item.ttftMs / 1000).toFixed(2)}s`}
                  {item.totalMs && ` · Total:${' '}${item.totalMs < 1000 ? `${item.totalMs}ms` : `${(item.totalMs / 1000).toFixed(2)}s`}`}
                </div>
              )}
              <div className="live-transcript-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {item.text}
              </div>
            </div>
          )
        })}
        {/* Active tool indicator */}
        {activeTool && (
          <div key="active-tool" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', margin: '4px 0',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.12) 100%)',
            border: '1px solid rgba(129, 140, 248, 0.4)',
            borderRadius: '8px', color: '#c7d2fe', fontSize: '12px', fontWeight: 500,
            animation: 'liveFadeIn 0.25s ease-out',
          }}>
            <Wrench size={13} style={{ color: '#a5b4fc', flexShrink: 0, animation: 'spin 2s linear infinite' }} />
            <span>🔧 <strong style={{ color: '#e0e7ff' }}>{activeTool}</strong> executing…</span>
          </div>
        )}
        {/* Live status text */}
        {liveStatusText && !activeTool && (
          <div key="live-status" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', margin: '3px 0',
            background: statusColor(liveStatusText).bg,
            border: `1px solid ${statusColor(liveStatusText).border}`,
            borderRadius: '6px', fontSize: '11px', color: statusColor(liveStatusText).color,
            animation: 'liveFadeIn 0.2s ease-out',
          }}>
            {statusIcon(liveStatusText)}
            <span style={{ flex: 1 }}>{liveStatusText}</span>
            {isThinking && thinkingStartTime && (
              <>
                <span> · </span>
                <ThinkingTimer startTime={thinkingStartTime} />
              </>
            )}
          </div>
        )}
        {/* Scroll anchor */}
        <div ref={transcriptEndRef} />
      </div>

      {/* Scroll-to-bottom button when user scrolled up */}
      {userScrolledUp && (
        <button
          onClick={() => {
            if (bodyRef.current) {
              bodyRef.current.scrollTop = bodyRef.current.scrollHeight
              setUserScrolledUp(false)
            }
          }}
          className="live-transcript-scroll-btn"
          aria-label="Scroll to bottom"
          style={{
            position: 'absolute',
            bottom: '80px',
            right: '16px',
            zIndex: 10,
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#3b82f6',
            border: 'none',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
            animation: 'liveFadeIn 0.2s ease-out',
          }}
        >
          <ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} />
        </button>
      )}
    </div>
    )
}