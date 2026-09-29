/**
 * CommandPalette — Unified command interface (Cmd+K)
 * Searches conversations, runs slash commands, jumps to settings, etc.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react'
import { Search, X, Zap, Bot, Settings, FileText, Terminal, Keyboard, ChevronRight, MessageSquare, Folder, Tag, Sparkles, Plug, Shield, Download, Upload, Share2, HelpCircle } from 'lucide-react'
import { tokens } from '../design-system/tokens'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Built-in commands
const BUILTIN_COMMANDS = [
  { id: 'new-chat', label: 'New Chat', description: 'Start a fresh conversation', icon: MessageSquare, keywords: ['new', 'chat', 'fresh', 'start'] },
  { id: 'search-chats', label: 'Search Conversations', description: 'Find previous conversations', icon: Search, keywords: ['search', 'find', 'history', 'conversations'] },
  { id: 'settings', label: 'Open Settings', description: 'Preferences, providers, appearance', icon: Settings, keywords: ['settings', 'preferences', 'config', 'options'] },
  { id: 'providers', label: 'Manage Providers & Keys', description: 'API keys and model configuration', icon: Plug, keywords: ['provider', 'api', 'key', 'model'] },
  { id: 'agents', label: 'Agents', description: 'Specialist AI agents & delegation', icon: Bot, keywords: ['agent', 'specialist', 'delegate'] },
  { id: 'skills', label: 'Skills & Workflows', description: 'Reusable prompts & automations', icon: Sparkles, keywords: ['skill', 'workflow', 'automation', 'prompt'] },
  { id: 'mcp', label: 'MCP Servers', description: 'Connect external tools & data', icon: Plug, keywords: ['mcp', 'server', 'tool', 'external'] },
  { id: 'terminal', label: 'Open Terminal', description: 'System terminal access', icon: Terminal, keywords: ['terminal', 'shell', 'command', 'cli'] },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', description: 'View all keyboard shortcuts', icon: Keyboard, keywords: ['shortcut', 'key', 'hotkey', 'help'] },
  { id: 'export', label: 'Export Conversation', description: 'Download chat as file', icon: Download, keywords: ['export', 'download', 'save', 'file'] },
  { id: 'import', label: 'Import Conversation', description: 'Load chat from file', icon: Upload, keywords: ['import', 'load', 'restore', 'backup'] },
  { id: 'share', label: 'Share Conversation', description: 'Generate shareable link', icon: Share2, keywords: ['share', 'link', 'send'] },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Errors, traces & performance', icon: Shield, keywords: ['diagnostics', 'error', 'trace', 'debug'] },
  { id: 'help', label: 'Help & Documentation', description: 'Open help center', icon: HelpCircle, keywords: ['help', 'docs', 'guide', 'tutorial'] },
]

export function CommandPalette({
  isOpen,
  onClose,
  conversations = [],
  activeConversationId,
  onNewChat,
  onNavigate,
  onRunCommand,
  recentCommands = [],
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const restoreFocusRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current = document.activeElement
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      restoreFocusRef.current?.focus?.()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filteredResults.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') { e.preventDefault(); if (filteredResults[selectedIndex]) handleSelect(filteredResults[selectedIndex]) }
      if (e.key === 'Tab') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filteredResults.length - 1)) }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen, selectedIndex, filteredResults, onClose])

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // Show recent commands + recent conversations
      const recentConv = conversations
        .filter(c => c.clientId !== activeConversationId)
        .slice(0, 5)
        .map(c => ({
          type: 'conversation',
          id: c.clientId,
          label: c.title || 'Untitled',
          description: c.messages?.length ? `${c.messages.length} messages` : 'Empty',
          icon: MessageSquare,
          matchScore: 0,
        }))
      
      const recentCmd = recentCommands.slice(0, 5).map(cmdId => {
        const cmd = BUILTIN_COMMANDS.find(c => c.id === cmdId)
        return cmd ? { ...cmd, type: 'command', matchScore: 0 } : null
      }).filter(Boolean)
      
      return [...recentCmd, ...recentConv]
    }

    // Score and filter
    const score = (item) => {
      const searchText = `${item.label} ${item.description} ${item.keywords?.join(' ') || ''}`.toLowerCase()
      if (searchText === q) return 100
      if (searchText.startsWith(q)) return 90
      if (searchText.includes(q)) return 80
      // Fuzzy match
      let score = 0
      let searchIdx = 0
      for (const char of q) {
        const found = searchText.indexOf(char, searchIdx)
        if (found === -1) return 0
        score += found === searchIdx ? 10 : 5
        searchIdx = found + 1
      }
      return score
    }

    const cmdResults = BUILTIN_COMMANDS
      .map(cmd => ({ ...cmd, type: 'command', matchScore: score(cmd) }))
      .filter(r => r.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)

    const convResults = conversations
      .map(c => ({
        type: 'conversation',
        id: c.clientId,
        label: c.title || 'Untitled',
        description: c.messages?.length ? `${c.messages.length} messages` : 'Empty',
        icon: MessageSquare,
        matchScore: score({ label: c.title || '', description: '', keywords: [] }),
      }))
      .filter(r => r.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 8)

    return [...cmdResults, ...convResults].slice(0, 10)
  }, [query, conversations, activeConversationId, recentCommands])

  const handleSelect = (item) => {
    if (item.type === 'command') {
      onRunCommand?.(item.id)
      switch (item.id) {
        case 'new-chat': onNewChat?.(); break
        case 'settings': onNavigate?.('settings'); break
        case 'providers': onNavigate?.('providers'); break
        case 'agents': onNavigate?.('agents'); break
        case 'skills': onNavigate?.('skills'); break
        case 'mcp': onNavigate?.('mcp'); break
        case 'shortcuts': onRunCommand?.('shortcuts'); break
        case 'terminal': onRunCommand?.('terminal'); break
        case 'diagnostics': onNavigate?.('diagnostics'); break
        default: onNavigate?.(item.id); break
      }
    } else if (item.type === 'conversation') {
      onRunCommand?.(`switch-chat:${item.id}`)
    }
    onClose()
  }

  if (!isOpen) return null

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: tokens.colors.overlay,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '12vh',
    zIndex: tokens.zIndex.modal,
    animation: `fadeIn ${tokens.motion.fast} ease-out`,
  }

  const paletteStyle = {
    background: tokens.colors.panel,
    border: `1px solid ${tokens.colors.border}`,
    borderRadius: tokens.radius.xl,
    boxShadow: tokens.shadow.xl,
    width: 'min(720px, 90vw)',
    maxHeight: '70vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    animation: `slideDown ${tokens.motion.spring}`,
  }

  const inputStyle = {
    width: '100%',
    padding: `${tokens.spacing[3]} ${tokens.spacing[4]} ${tokens.spacing[3]} ${tokens.spacing[10]}`,
    fontSize: tokens.typography.size.base,
    fontFamily: tokens.typography.fontFamily,
    color: tokens.colors.text,
    background: tokens.colors.bgElevated,
    border: 'none',
    borderBottom: `1px solid ${tokens.colors.border}`,
    outline: 'none',
  }

  const searchIconStyle = {
    position: 'absolute',
    left: tokens.spacing[4],
    top: '50%',
    transform: 'translateY(-50%)',
    color: tokens.colors.textMuted,
    pointerEvents: 'none',
  }

  const clearButtonStyle = {
    position: 'absolute',
    right: tokens.spacing[3],
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: tokens.colors.textMuted,
    cursor: 'pointer',
    padding: tokens.spacing[1],
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const sectionStyle = {
    padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
    fontSize: tokens.typography.size.xs,
    fontWeight: tokens.typography.weight.semibold,
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: tokens.typography.tracking.wide,
    background: tokens.colors.bgElevated,
    borderBottom: `1px solid ${tokens.colors.border}`,
  }

  const itemStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[3],
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    cursor: 'pointer',
    background: selected ? tokens.colors.brandLight : 'transparent',
    borderLeft: selected ? `3px solid ${tokens.colors.brand}` : '3px solid transparent',
    transition: `background-color ${tokens.motion.fast}, border-color ${tokens.motion.fast}`,
  })

  const iconWrapperStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    background: tokens.colors.bgElevated,
    color: tokens.colors.textSecondary,
    flexShrink: 0,
  }

  const textStyle = {
    flex: 1,
    minWidth: 0,
  }

  const labelStyle = (selected) => ({
    fontSize: tokens.typography.size.sm,
    fontWeight: tokens.typography.weight.medium,
    color: selected ? tokens.colors.text : tokens.colors.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  })

  const descStyle = {
    fontSize: tokens.typography.size.xs,
    color: tokens.colors.textMuted,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: 2,
  }

  const kbdStyle = {
    fontSize: tokens.typography.size.xs,
    fontFamily: tokens.typography.fontFamilyMono,
    background: tokens.colors.bgElevated,
    border: `1px solid ${tokens.colors.border}`,
    borderRadius: tokens.radius.sm,
    padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
    color: tokens.colors.textMuted,
    marginLeft: 'auto',
  }

  // Group results by type
  const commands = filteredResults.filter(r => r.type === 'command')
  const conversationsList = filteredResults.filter(r => r.type === 'conversation')

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div style={paletteStyle} onClick={e => e.stopPropagation()}>        <div style={{ position: 'relative' }}>
          <Search size={20} style={searchIconStyle} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            placeholder="Type a command or search conversations… (Esc to close)"
            style={inputStyle}
            autoComplete="off"
            spellCheck={false}
            aria-label="Command palette search"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-activedescendant={filteredResults[selectedIndex] ? `cmd-${filteredResults[selectedIndex].id}` : undefined}
          />
          {query && (
            <button
              style={clearButtonStyle}
              onClick={() => { setQuery(''); setSelectedIndex(0); inputRef.current?.focus() }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div id="command-results" ref={listRef} role="listbox" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {commands.length > 0 && (
            <>
              <div style={sectionStyle} role="presentation">Commands</div>
              {commands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  role="option"
                  data-selected={i === selectedIndex}
                  style={itemStyle(i === selectedIndex)}
                  onClick={() => handleSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span style={iconWrapperStyle}>
                    <cmd.icon size={16} style={{ color: i === selectedIndex ? tokens.colors.brand : tokens.colors.textSecondary }} />
                  </span>
                  <div style={textStyle}>
                    <div style={labelStyle(i === selectedIndex)}>{cmd.label}</div>
                    <div style={descStyle}>{cmd.description}</div>
                  </div>
                  <kbd style={kbdStyle}>Cmd+K</kbd>
                </button>
              ))}
            </>
          )}

          {conversationsList.length > 0 && (
            <>
              <div style={sectionStyle} role="presentation">Conversations</div>
              {conversationsList.map((conv, i) => (
                <button
                  key={conv.id}
                  id={`cmd-${conv.id}`}
                  role="option"
                  data-selected={commands.length + i === selectedIndex}
                  style={itemStyle(commands.length + i === selectedIndex)}
                  onClick={() => handleSelect(conv)}
                  onMouseEnter={() => setSelectedIndex(commands.length + i)}
                >
                  <span style={iconWrapperStyle}>
                    <conv.icon size={16} style={{ color: commands.length + i === selectedIndex ? tokens.colors.brand : tokens.colors.textSecondary }} />
                  </span>
                  <div style={textStyle}>
                    <div style={labelStyle(commands.length + i === selectedIndex)}>{conv.label}</div>
                    <div style={descStyle}>{conv.description}</div>
                  </div>
                </button>
              ))}
            </>
          )}

          {filteredResults.length === 0 && query && (
            <div style={{ padding: tokens.spacing[6], textAlign: 'center', color: tokens.colors.textMuted }}>
              No matches for "{query}"
            </div>
          )}
        </div>

        <div style={{ padding: tokens.spacing[3], borderTop: `1px solid ${tokens.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: tokens.typography.size.xs, color: tokens.colors.textMuted }}>
          <kbd style={kbdStyle}>↑↓</kbd> Navigate
          <kbd style={kbdStyle}>Enter</kbd> Select
          <kbd style={kbdStyle}>Esc</kbd> Close
        </div>
        <style jsx>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideDown { from { opacity: 0; transform: translateY(-20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        `}</style>
      </div>
    </div>
  )
}

export default CommandPalette
