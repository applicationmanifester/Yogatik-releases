import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Wrench, Copy, Zap, Brain, Activity, Search, Cpu, CheckCircle2, AlertCircle, Loader2, X, ChevronDown, Layers } from 'lucide-react'

/**
 * Live Transcript Drawer — the AI transparency surface.
 *
 * [live-redesign] Cockpit role: this is now a pure TRANSCRIPT drawer (right
 * drawer on desktop, bottom sheet on touch, lower-third on TV — the sheet /
 * lower-third variants live in 13-live-components.css). Artifacts no longer
 * live here as a tab; they dock in the `#live-artifact-rail` in LiveView.
 *
 * Shows everything the AI is doing in real-time:
 * - Reasoning / thinking with elapsed timer
 * - Tool invocations with tool name and animated spinner
 * - Tool results with rich cards
 * - Status updates with categorised icons
 * - Full conversation transcript with copy support
 * - Search/filter to find specific moments
 * - A last-N window so marathon calls don't dom-node-bomb the DOM (`Window
 *   is 200 entries — older history stays in the store and in searches; the
 *   `copiedIdx` index is offset back to absolute values so copy feedback
 *   keeps its original semantics).
 */

const TRANSCRIPT_WINDOW = 200

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
  transcript = [],
  activeTool,
  isThinking,
  thinkingStartTime,
  liveStatusText,
  onCopy,
  copiedIdx,
  formatTime,
  features, // reserved: filter availability may soon follow feature flags
  activeProvider,
  activeModel,
  artifacts = [],
}) {
  const bodyRef = useRef(null)
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

  // "Jump to live" — back to the bottom of the drawer, resume auto-scroll.
  const jumpToLive = () => {
    setUserScrolledUp(false)
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      const end = bodyRef.current.querySelector('.live-transcript-end') || bodyRef.current.lastElementChild
      if (end?.focus) end.focus({ preventScroll: false })
    }
  }

  // Filter the FULL transcript (search covers history older than the window)
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

  // [live-redesign] Last-N window: only the most recent TRANSCRIPT_WINDOW
  // entries mount. `idx` is re-offset to the ABSOLUTE transcript index so the
  // `copiedIdx` contract (and dedupe of copy feedback) is unchanged.
  const windowStart = Math.max(0, filteredTranscript.length - TRANSCRIPT_WINDOW)
  const windowItems = useMemo(
    () => filteredTranscript.slice(windowStart).map((item, offset) => ({
      item,
      idx: windowStart + offset,
      isLastEntry: offset === filteredTranscript.length - 1 - windowStart,
    })),
    [filteredTranscript, windowStart]
  )

  if (!isOpen) return null

  return (
    <div
      id="live-transcript-drawer"
      className={`live-transcript-panel ${isOpen ? 'open' : ''}`}
      role="complementary"
      aria-label="Live transcript and AI activity"
      tabIndex={-1}
    >
      <div className="live-transcript-header">
        <span className="live-transcript-title" style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', flexShrink: 0 }}>
          Transcript
        </span>
        {artifacts.length > 0 && (
          <span
            className="live-btn-badge"
            title={`${artifacts.length} artifact${artifacts.length > 1 ? 's' : ''} in the artifacts rail`}
            style={{ flexShrink: 0 }}
          >
            <Layers size={9} /> {artifacts.length}
          </span>
        )}
        <div className="live-transcript-search">
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search transcript…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="live-transcript-close"
          onClick={onClose}
          aria-label="Close transcript drawer"
          title="Close transcript drawer (opens again from More → Transcript & activity)"
        >
          <X size={16} />
        </button>
      </div>
      <div className="live-transcript-filter" role="group" aria-label="Filter transcript by type">
        <button className={`live-filter-btn ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>All</button>
        <button className={`live-filter-btn ${filterType === 'user' ? 'active' : ''}`} onClick={() => setFilterType('user')}>You</button>
        <button className={`live-filter-btn ${filterType === 'assistant' ? 'active' : ''}`} onClick={() => setFilterType('assistant')}>AI</button>
        <button className={`live-filter-btn ${filterType === 'tool' ? 'active' : ''}`} onClick={() => setFilterType('tool')}>Tools</button>
        <button className={`live-filter-btn ${filterType === 'status' ? 'active' : ''}`} onClick={() => setFilterType('status')}>Status</button>
      </div>
      <div className="live-transcript-body" ref={bodyRef} onScroll={handleScroll}>
        {windowItems.map(({ item, idx, isLastEntry }) => (
          <div
            key={idx}
            className={`live-transcript-item ${item.role || item.type || 'status'}`}
          >
            <div className="live-transcript-item-header">
              {(item.role === 'user' || item.role === 'assistant') && (
                <span className="live-transcript-role">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {item.role === 'user' ? (
                      <span style={{ color: '#22c55e' }}>•</span>
                    ) : (
                      <span style={{ color: '#38bdf8' }}>•</span>
                    )}
                    {item.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                </span>
              )}
              {item.type === 'tool' && (
                <span className="live-transcript-role">
                  <Wrench size={12} style={{ color: '#f59e0b' }} />
                  {item.name}
                </span>
              )}
              {item.type === 'toolResult' && (
                <span className="live-transcript-role">
                  <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
                  {item.name} result
                </span>
              )}
              {item.type === 'status' && (
                <span className="live-transcript-role">
                  {statusIcon(item.text)}
                  {item.text}
                </span>
              )}
              {item.time && (
                <span className="live-transcript-time" style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginLeft: 'auto' }}>{formatTime(item.time)}</span>
              )}
            </div>
            {item.type === 'status' && item.text && (
              <div className="live-transcript-status">
                {statusIcon(item.text)}
                {item.text}
              </div>
            )}
            {(item.role === 'user' || item.role === 'assistant') && item.text && (
              <div className="live-transcript-text">{item.text}</div>
            )}
            {item.reasoning && (
              <div className="live-transcript-reasoning">
                <Brain size={12} style={{ color: '#6366f1', marginRight: 4 }} />
                {item.reasoning}
                {isThinking && isLastEntry && (
                  <ThinkingTimer startTime={thinkingStartTime} />
                )}
              </div>
            )}
            {item.type === 'tool' && (
              <div className="live-transcript-tool">
                <Wrench size={14} style={{ color: '#f59e0b' }} />
                <span className="live-transcript-tool-name">{item.name}</span>
                <span className="live-transcript-tool-args">{JSON.stringify(item.args || {})}</span>
                <Loader2 size={14} className="live-transcript-tool-spinner" />
              </div>
            )}
            {item.type === 'toolResult' && (
              <div className="live-transcript-tool-result">
                <pre style={{ margin: 0, fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(item.result, null, 2)}</pre>
              </div>
            )}
            {onCopy && (
              <button
                className={`live-transcript-copy ${copiedIdx === idx ? 'copied' : ''}`}
                onClick={() => onCopy(item, idx)}
              >
                <Copy size={12} />
                {copiedIdx === idx ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        ))}
        {windowItems.length === 0 && (
          <div className="live-transcript-empty" style={{ padding: 'var(--space-5, 20px)', textAlign: 'center', color: 'var(--color-text-muted, #94a3b8)', fontSize: '12px' }}>
            Nothing here yet — your words and the AI's replies appear live in this drawer.
          </div>
        )}
        <div className="live-transcript-end" tabIndex={-1} aria-hidden="true" />
      </div>
      {/* [live-redesign] "Jump to live" — appears once the user scrolls away
          from the newest entries (existing userScrolledUp logic drives it). */}
      {userScrolledUp && (
        <button
          type="button"
          className="live-transcript-jump"
          onClick={jumpToLive}
          title="Back to the newest entries"
        >
          <ChevronDown size={13} />
          Jump to live
        </button>
      )}
    </div>
  )
}
