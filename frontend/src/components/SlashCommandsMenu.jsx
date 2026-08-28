import React, { useEffect, useRef } from 'react'
import { Sparkles, Terminal, Shield, RefreshCw, Trash2, Settings, MessageSquare, Download, Play, HelpCircle } from 'lucide-react'

export const SLASH_COMMANDS = [
  {
    command: '/enhance',
    label: 'Enhance Prompt',
    description: 'Transform your current prompt with role, context & output constraints',
    icon: Sparkles,
    color: '#ff6b35',
  },
  {
    command: '/clear',
    label: 'Clear Chat',
    description: 'Clear all messages in the current conversation',
    icon: Trash2,
    color: '#f87171',
  },
  {
    command: '/new',
    label: 'New Chat',
    description: 'Start a clean new conversation session',
    icon: MessageSquare,
    color: '#3b82f6',
  },
  {
    command: '/terminal',
    label: 'Open Terminal',
    description: 'Open native OS command line or agent terminal view',
    icon: Terminal,
    color: '#10b981',
  },
  {
    command: '/export',
    label: 'Export Conversation',
    description: 'Export chat transcript to Markdown / JSON',
    icon: Download,
    color: '#06b6d4',
  },
  {
    command: '/settings',
    label: 'Open Settings',
    description: 'Configure API keys, models, system prompt & preferences',
    icon: Settings,
    color: '#f59e0b',
  },
  {
    command: '/help',
    label: 'Keyboard Shortcuts & Help',
    description: 'View all keyboard shortcuts and command palette hints',
    icon: HelpCircle,
    color: '#8b5cf6',
  },
]

export function SlashCommandsMenu({
  filter = '',
  selectedIndex = 0,
  onSelect,
  onClose,
}) {
  const menuRef = useRef(null)

  const cleanFilter = filter.startsWith('/') ? filter.slice(1).toLowerCase() : filter.toLowerCase()
  const matching = SLASH_COMMANDS.filter(cmd =>
    cmd.command.slice(1).toLowerCase().includes(cleanFilter) ||
    cmd.label.toLowerCase().includes(cleanFilter) ||
    cmd.description.toLowerCase().includes(cleanFilter)
  )

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose?.()
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose])

  if (matching.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="slash-commands-menu"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '12px',
        marginBottom: '8px',
        width: 'calc(100% - 24px)',
        maxWidth: '380px',
        background: 'var(--bg-secondary, #1e1e2e)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
        zIndex: 9999,
        maxHeight: '260px',
        overflowY: 'auto',
      }}
    >
      <div style={{
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: 'var(--text-secondary, #a6adc8)',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Commands</span>
        <span>↑↓ to navigate · Enter to run</span>
      </div>
      <div style={{ padding: '4px' }}>
        {matching.map((cmd, idx) => {
          const isSelected = idx === Math.min(selectedIndex, matching.length - 1)
          const Icon = cmd.icon || Sparkles
          return (
            <div
              key={cmd.command}
              onClick={() => onSelect(cmd)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: isSelected ? 'var(--bg-tertiary, rgba(255,255,255,0.1))' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={() => {}}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: `${cmd.color}22`,
                color: cmd.color,
                flexShrink: 0,
              }}>
                <Icon size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                    {cmd.command}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary, #a6adc8)' }}>
                    {cmd.label}
                  </span>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary, #a6adc8)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: '1px'
                }}>
                  {cmd.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
