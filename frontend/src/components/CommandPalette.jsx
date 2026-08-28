import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search, CornerDownLeft, MessageSquare, Sparkles, Cpu, Zap, Sliders,
  Wrench, Download, Sun, Moon, Clock, ArrowRight, X, Layers, Check,
  Bot, Shield, Key, FileText, Smartphone, ChevronRight
} from 'lucide-react'
import { searchChats } from '../chatSearch'

/** Subsequence match with word-boundary prioritization */
function fuzzy(needle, haystack) {
  const n = needle.toLowerCase().trim()
  const h = haystack.toLowerCase().trim()
  if (!n) return true
  if (h.includes(n)) return true
  let i = 0
  for (const ch of h) {
    if (ch === n[i]) i++
    if (i === n.length) return true
  }
  return false
}

function formatRelativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function HighlightMatch({ text, query }) {
  const str = String(text ?? '')
  if (!query || !query.trim() || !str) return <span>{str}</span>
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return <span>{str}</span>
  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = str.split(regex)
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? <mark key={i} className="palette-highlight">{part}</mark> : part
      )}
    </span>
  )
}

const FILTER_TABS = [
  { id: 'all', label: 'All', prefix: '' },
  { id: 'skills', label: 'Skills', icon: Sparkles, prefix: '@' },
  { id: 'workflows', label: 'Workflows', icon: Zap, prefix: '~' },
  { id: 'chats', label: 'Chats', icon: MessageSquare, prefix: '#' },
  { id: 'models', label: 'Models', icon: Cpu, prefix: '$' },
  { id: 'commands', label: 'Commands', icon: Layers, prefix: '>' },
  { id: 'tools', label: 'Tools', icon: Wrench, prefix: '!' },
  { id: 'personas', label: 'Personas', icon: Bot, prefix: '/' },
]

const GROUP_CONFIG = {
  'In chats': { icon: MessageSquare, color: 'var(--accent, #ff6b35)' },
  'Skills': { icon: Sparkles, color: '#06b6d4' },
  'Workflows': { icon: Zap, color: '#f59e0b' },
  'Chat': { icon: MessageSquare, color: '#3b82f6' },
  'Model': { icon: Cpu, color: '#10b981' },
  'Models': { icon: Cpu, color: '#10b981' },
  'Provider': { icon: Zap, color: '#8b5cf6' },
  'Settings': { icon: Sliders, color: '#f59e0b' },
  'View': { icon: Sun, color: '#ec4899' },
  'Data': { icon: Download, color: '#06b6d4' },
  'Tools': { icon: Wrench, color: '#14b8a6' },
  'Personas': { icon: Sparkles, color: '#f43f5e' },
}

export function CommandPalette({ commands = [], onClose, onOpenChat }) {
  const [rawQuery, setRawQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [sel, setSel] = useState(0)
  const [hits, setHits] = useState([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Parse prefixes in search input like >, @, #, !, /, $
  const { filterTab, cleanQuery } = useMemo(() => {
    const trimmed = rawQuery.trimStart()
    if (trimmed.startsWith('#')) return { filterTab: 'chats', cleanQuery: trimmed.slice(1).trimStart() }
    if (trimmed.startsWith('@')) return { filterTab: 'models', cleanQuery: trimmed.slice(1).trimStart() }
    if (trimmed.startsWith('>')) return { filterTab: 'commands', cleanQuery: trimmed.slice(1).trimStart() }
    if (trimmed.startsWith('$')) return { filterTab: 'settings', cleanQuery: trimmed.slice(1).trimStart() }
    if (trimmed.startsWith('!')) return { filterTab: 'tools', cleanQuery: trimmed.slice(1).trimStart() }
    if (trimmed.startsWith('/')) return { filterTab: 'personas', cleanQuery: trimmed.slice(1).trimStart() }
    return { filterTab: activeTab, cleanQuery: rawQuery }
  }, [rawQuery, activeTab])

  // Full-text indexed search across all conversation messages
  useEffect(() => {
    if (!onOpenChat || cleanQuery.trim().length < 2 || (filterTab !== 'all' && filterTab !== 'chats')) {
      setHits([])
      setSearching(false)
      return
    }
    let live = true
    setSearching(true)
    const t = setTimeout(() => {
      searchChats(cleanQuery, 16)
        .then(r => { if (live) { setHits(r); setSearching(false) } })
        .catch(() => { if (live) { setHits([]); setSearching(false) } })
    }, 120)
    return () => { live = false; clearTimeout(t) }
  }, [cleanQuery, onOpenChat, filterTab])

  // Aggregate and filter commands by category
  const results = useMemo(() => {
    const q = cleanQuery.toLowerCase().trim()

    // 1. Process matching chats from full-text BM25 index
    const chatHits = (filterTab === 'all' || filterTab === 'chats')
      ? hits.map(h => ({
          id: `msg-${h.conversationId}-${h.createdAt}`,
          group: 'In chats',
          label: h.title,
          hint: formatRelativeTime(h.createdAt),
          snippet: h.snippet,
          role: h.role,
          icon: MessageSquare,
          run: () => onOpenChat(h.conversationId),
        }))
      : []

    // 2. Process standard commands matching query
    const matchedCommands = commands.filter(c => {
      const grp = (c.group || '').toLowerCase()
      // Filter by category tab if selected
      if (filterTab === 'chats' && grp !== 'chat' && grp !== 'in chats') return false
      if (filterTab === 'models' && grp !== 'model' && grp !== 'models' && grp !== 'provider') return false
      if (filterTab === 'commands' && grp !== 'chat' && grp !== 'view' && grp !== 'data') return false
      if (filterTab === 'settings' && grp !== 'settings' && grp !== 'view') return false
      if (filterTab === 'tools' && grp !== 'tools' && grp !== 'settings') return false
      if (filterTab === 'personas' && grp !== 'personas' && grp !== 'persona') return false
      if (filterTab === 'skills' && grp !== 'skills') return false
      if (filterTab === 'workflows' && grp !== 'workflows') return false

      if (!q) return true
      return (
        fuzzy(q, c.label || '') ||
        fuzzy(q, c.group || '') ||
        fuzzy(q, c.hint || '') ||
        fuzzy(q, (c.keywords || []).join(' '))
      )
    })

    return [...chatHits, ...matchedCommands]
  }, [commands, cleanQuery, filterTab, hits, onOpenChat])

  // Calculate live count per category for tabs
  const categoryCounts = useMemo(() => {
    const q = cleanQuery.toLowerCase().trim()
    const counts = { all: commands.length + hits.length, chats: hits.length, models: 0, commands: 0, settings: 0, tools: 0, personas: 0 }

    for (const c of commands) {
      const grp = (c.group || '').toLowerCase()
      const matches = !q || fuzzy(q, c.label || '') || fuzzy(q, c.group || '') || fuzzy(q, c.hint || '')
      if (matches) {
        if (grp === 'chat') counts.chats++
        if (grp === 'model' || grp === 'models' || grp === 'provider') counts.models++
        if (grp === 'view' || grp === 'data') counts.commands++
        if (grp === 'settings') counts.settings++
        if (grp === 'tools') counts.tools++
        if (grp === 'personas' || grp === 'persona') counts.personas++
      }
    }
    return counts
  }, [commands, hits, cleanQuery])

  // Clamp selection on list changes
  useEffect(() => {
    setSel(0)
  }, [results.length, filterTab])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector('[data-sel="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [sel])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel(s => (s + 1) % (results.length || 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel(s => (s - 1 + (results.length || 1)) % (results.length || 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = results[sel]
        if (target) {
          onClose()
          target.run()
        }
      } else if (e.key === 'Tab') {
        e.preventDefault()
        // Cycle through category tabs
        const currentIndex = FILTER_TABS.findIndex(t => t.id === activeTab)
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + FILTER_TABS.length) % FILTER_TABS.length
          : (currentIndex + 1) % FILTER_TABS.length
        setActiveTab(FILTER_TABS[nextIndex].id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [results, sel, onClose, activeTab])

  const handleTabClick = (tabId) => {
    setActiveTab(tabId)
    inputRef.current?.focus()
  }

  const clearQuery = () => {
    setRawQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Universal Search & Command Palette"
      >
        {/* Search Input Bar */}
        <div className="palette-input-bar">
          <Search size={18} className="palette-search-icon" />
          <input
            ref={inputRef}
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="Search chats, models, commands, tools (or type >, @, #, !, /)..."
            aria-label="Search queries and commands"
            autoComplete="off"
            spellCheck="false"
            autoFocus
          />
          {searching && <span className="palette-spinner" title="Searching messages..."></span>}
          {rawQuery ? (
            <button
              type="button"
              className="palette-clear-btn"
              onClick={clearQuery}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="palette-kbd">ESC</kbd>
          )}
        </div>

        {/* Filter Categories Row */}
        <div
          className="palette-tabs"
          role="tablist"
          aria-label="Filter categories"
          onWheel={(e) => {
            if (e.deltaY) {
              e.currentTarget.scrollLeft += e.deltaY * 0.8
            }
          }}
        >
          {FILTER_TABS.map(tab => {
            const TabIcon = tab.icon
            const isActive = filterTab === tab.id
            const count = categoryCounts[tab.id]
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={`palette-tab-pill ${isActive ? 'active' : ''}`}
                onClick={() => handleTabClick(tab.id)}
              >
                {TabIcon && <TabIcon size={12} className="palette-tab-icon" />}
                <span>{tab.label}</span>
                {tab.prefix && <span className="palette-tab-prefix">{tab.prefix}</span>}
                {count > 0 && tab.id !== 'all' && (
                  <span className="palette-tab-count">{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Results List */}
        <div className="palette-list" ref={listRef} role="listbox">
          {results.length === 0 && (
            <div className="palette-empty">
              <div className="palette-empty-icon">
                <Search size={26} />
              </div>
              <div className="palette-empty-title">
                {rawQuery ? `No results for "${cleanQuery}"` : 'Universal Search & Actions'}
              </div>
              <p className="palette-empty-desc">
                {rawQuery
                  ? 'Try checking for typos or searching across other categories with the tabs above.'
                  : 'Instantly find messages in your conversations, switch AI models, toggle tools, or run system actions.'}
              </p>
              {!rawQuery && (
                <div className="palette-shortcuts-hint">
                  <span className="shortcut-tag" onClick={() => setRawQuery('> ')}><code>&gt;</code> Commands</span>
                  <span className="shortcut-tag" onClick={() => setRawQuery('@ ')}><code>@</code> Models</span>
                  <span className="shortcut-tag" onClick={() => setRawQuery('# ')}><code>#</code> Chats</span>
                  <span className="shortcut-tag" onClick={() => setRawQuery('! ')}><code>!</code> Tools</span>
                  <span className="shortcut-tag" onClick={() => setRawQuery('/ ')}><code>/</code> Personas</span>
                </div>
              )}
            </div>
          )}

          {results.map((c, i) => {
            const isSelected = i === sel
            const groupInfo = GROUP_CONFIG[c.group] || { icon: Sparkles, color: 'var(--text-muted)' }
            const Icon = c.icon || groupInfo.icon

            return (
              <button
                key={c.id}
                data-sel={isSelected}
                role="option"
                aria-selected={isSelected}
                className={`palette-item ${isSelected ? 'active' : ''} ${c.snippet ? 'has-snippet' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => { onClose(); c.run() }}
              >
                <div
                  className="palette-item-icon"
                  style={{
                    color: groupInfo.color,
                    backgroundColor: `${groupInfo.color}15`,
                    borderColor: `${groupInfo.color}30`
                  }}
                >
                  <Icon size={14} />
                </div>

                <div className="palette-item-body">
                  <div className="palette-item-main">
                    <span
                      className="palette-group-badge"
                      style={{
                        backgroundColor: `${groupInfo.color}15`,
                        color: groupInfo.color,
                        borderColor: `${groupInfo.color}35`
                      }}
                    >
                      {c.group}
                    </span>
                    <span className="palette-label">
                      <HighlightMatch text={c.label} query={cleanQuery} />
                    </span>
                    {c.hint && (
                      <span className="palette-hint">
                        {c.hint}
                      </span>
                    )}
                  </div>

                  {/* Message snippet preview for full-text search hits */}
                  {c.snippet && (
                    <div className="palette-snippet">
                      <span className="snippet-role">{c.role === 'user' ? 'You: ' : 'AI: '}</span>
                      <HighlightMatch text={c.snippet} query={cleanQuery} />
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div className="palette-select-indicator">
                    <kbd className="palette-enter-kbd"><CornerDownLeft size={11} /> Enter</kbd>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer info bar */}
        <div className="palette-footer">
          <div className="palette-footer-left">
            <span className="palette-footer-tip">
              <kbd>↑</kbd><kbd>↓</kbd> Navigate
            </span>
            <span className="palette-footer-tip">
              <kbd>↵</kbd> Select
            </span>
            <span className="palette-footer-tip">
              <kbd>Tab</kbd> Switch Tab
            </span>
            <span className="palette-footer-tip">
              <kbd>Esc</kbd> Close
            </span>
          </div>
          <div className="palette-footer-right">
            <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
