import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Globe, FileText, Wrench, Bot, Film, Terminal,
  TrendingUp, DownloadCloud, Sparkles, X, ChevronRight, Hash
} from 'lucide-react'

/**
 * Universal Context Mention Menu (@mentions) for the composer input.
 * Allows instant injection of web search, indexed documents, tools, and specialist agents.
 */
export function ContextMentionMenu({
  query = '',
  docs = [],
  onSelect,
  onClose,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef(null)

  // Clean query text after the '@'
  const filterText = useMemo(() => {
    const atIdx = query.lastIndexOf('@')
    if (atIdx === -1) return ''
    return query.slice(atIdx + 1).toLowerCase().trim()
  }, [query])

  // Built-in mention items
  const staticItems = useMemo(() => [
    {
      id: 'web',
      category: 'Sources',
      label: '@web',
      name: 'Live Web Search',
      desc: 'Retrieve real-time web search results & citations',
      icon: <Globe size={14} color="#3b82f6" />,
      insertText: '@web ',
    },
    {
      id: 'tool-video',
      category: 'Tools',
      label: '@video',
      name: 'Video Studio & Trimmer',
      desc: 'Launch video trimmer, audio extraction, or VLC player',
      icon: <Film size={14} color="#06b6d4" />,
      insertText: '@tool:video ',
    },
    {
      id: 'tool-terminal',
      category: 'Tools',
      label: '@terminal',
      name: 'Desktop Terminal',
      desc: 'Execute bash/powershell command on desktop',
      icon: <Terminal size={14} color="#10b981" />,
      insertText: '@tool:terminal ',
    },
    {
      id: 'tool-trading',
      category: 'Tools',
      label: '@trading',
      name: 'Zerodha Stock Terminal',
      desc: 'NSE/BSE Indian equities live & paper trade execution',
      icon: <TrendingUp size={14} color="#f59e0b" />,
      insertText: '@tool:trading ',
    },
    {
      id: 'tool-torrent',
      category: 'Tools',
      label: '@torrent',
      name: 'Torrent Downloader',
      desc: 'P2P magnet/torrent client sidecar',
      icon: <DownloadCloud size={14} color="#8b5cf6" />,
      insertText: '@tool:torrent ',
    },
    {
      id: 'agent-coder',
      category: 'Agents',
      label: '@coder',
      name: 'Senior Fullstack Coder',
      desc: 'Specialized code generation & refactoring persona',
      icon: <Bot size={14} color="#ec4899" />,
      insertText: '@agent:coder ',
    },
    {
      id: 'agent-researcher',
      category: 'Agents',
      label: '@researcher',
      name: 'Deep Research Agent',
      desc: 'Multi-step verification & comprehensive report engine',
      icon: <Sparkles size={14} color="#a855f7" />,
      insertText: '@agent:researcher ',
    },
  ], [])

  // Dynamic document items from RAG docs
  const docItems = useMemo(() => {
    return (docs || []).slice(0, 8).map(d => ({
      id: `doc-${d.id || d.name}`,
      category: 'Documents',
      label: `@doc:${d.name}`,
      name: d.name,
      desc: `${d.charCount ? Math.round(d.charCount / 4) + ' tokens • ' : ''}Indexed RAG document`,
      icon: <FileText size={14} color="#10b981" />,
      insertText: `@doc:"${d.name}" `,
    }))
  }, [docs])

  // Combined & filtered items
  const filteredItems = useMemo(() => {
    const all = [...staticItems, ...docItems]
    if (!filterText) return all
    return all.filter(item =>
      item.label.toLowerCase().includes(filterText) ||
      item.name.toLowerCase().includes(filterText) ||
      item.desc.toLowerCase().includes(filterText) ||
      item.category.toLowerCase().includes(filterText)
    )
  }, [staticItems, docItems, filterText])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredItems.length])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (filteredItems.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => (i + 1) % filteredItems.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + filteredItems.length) % filteredItems.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          onSelect(filteredItems[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems, selectedIndex, onSelect, onClose])

  if (filteredItems.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="context-mention-popover"
      role="listbox"
      aria-label="Context Mention Menu"
    >
      <div className="mention-popover-header">
        <span className="mention-popover-title">Attach Context or Tool</span>
        <span className="mention-popover-hint">↑↓ navigate • Enter to select</span>
      </div>

      <div className="mention-items-scroll">
        {filteredItems.map((item, idx) => {
          const isSelected = idx === selectedIndex
          return (
            <div
              key={item.id}
              className={`mention-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(item)}
              role="option"
              aria-selected={isSelected}
            >
              <div className="mention-item-icon">
                {item.icon}
              </div>
              <div className="mention-item-content">
                <div className="mention-item-header">
                  <span className="mention-item-label">{item.label}</span>
                  <span className="mention-item-category">{item.category}</span>
                </div>
                <div className="mention-item-name">{item.name}</div>
                <div className="mention-item-desc">{item.desc}</div>
              </div>
              <ChevronRight size={13} className="mention-item-arrow" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
