import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, Check, Sparkles, Eye, Zap, Brain, ChevronRight } from 'lucide-react'

export function LiveModelSearchModal({
  open,
  onClose,
  allProviders = {},
  activeProvider = '',
  activeModel = '',
  onSelectModel,
}) {
  const [query, setQuery] = useState('')
  const [selectedProviderFilter, setSelectedProviderFilter] = useState('all')
  const [focusedIdx, setFocusedIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Focus search input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedProviderFilter('all')
      setFocusedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  // Build flattened list of all available models across providers
  const allModelItems = useMemo(() => {
    const list = []
    for (const [provId, provData] of Object.entries(allProviders || {})) {
      const provName = provData?.name || provId
      const models = provData?.models || []
      const isAvailable = provData?.available !== false

      for (const m of models) {
        const lowerM = m.toLowerCase()
        const isVision = lowerM.includes('vision') || lowerM.includes('vl') || lowerM.includes('flash') || lowerM.includes('omni') || lowerM.includes('4o') || lowerM.includes('gemini')
        const isReasoning = lowerM.includes('r1') || lowerM.includes('reason') || lowerM.includes('thinking') || lowerM.includes('qwq') || lowerM.includes('nemotron')
        const isFast = lowerM.includes('fast') || lowerM.includes('flash') || lowerM.includes('turbo') || lowerM.includes('mini') || lowerM.includes('instant') || provId === 'groq'

        list.push({
          provider: provId,
          providerName: provName,
          model: m,
          displayName: m.split('/').pop(),
          isAvailable,
          isVision,
          isReasoning,
          isFast,
        })
      }
    }
    return list
  }, [allProviders])

  // Filtered list based on search query and provider tab
  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allModelItems.filter(item => {
      if (selectedProviderFilter !== 'all' && item.provider !== selectedProviderFilter) {
        return false
      }
      if (!q) return true
      return (
        item.model.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.providerName.toLowerCase().includes(q) ||
        item.provider.toLowerCase().includes(q) ||
        (item.isVision && 'vision camera image'.includes(q)) ||
        (item.isReasoning && 'thinking reasoning math deep'.includes(q)) ||
        (item.isFast && 'fast lightning quick speed'.includes(q))
      )
    })
  }, [allModelItems, query, selectedProviderFilter])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx(prev => Math.min(prev + 1, Math.max(0, filteredModels.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredModels[focusedIdx]) {
          const item = filteredModels[focusedIdx]
          onSelectModel(item.provider, item.model)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, filteredModels, focusedIdx, onSelectModel])

  // Keep focused item visible in scroll view
  useEffect(() => {
    if (!listRef.current) return
    const focusedEl = listRef.current.querySelector(`[data-idx="${focusedIdx}"]`)
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIdx])

  if (!open) return null

  const providerList = Object.keys(allProviders || {})

  return (
    <div
      className="live-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'liveFadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="live-search-dialog"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '82vh',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: '18px',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
          fontFamily: 'inherit',
        }}
      >
        {/* Header with Search Bar */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: '#38bdf8' }} />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em' }}>
                Search & Switch AI Model
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: '#94a3b8',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>

          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              padding: '0 12px',
            }}
          >
            <Search size={16} style={{ color: '#94a3b8', marginRight: '8px', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by model name, provider, vision, fast, r1..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setFocusedIdx(0)
              }}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '13px',
                padding: '10px 0',
                fontFamily: 'inherit',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Provider Filter Badges */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '2px',
              scrollbarWidth: 'none',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedProviderFilter('all')
                setFocusedIdx(0)
              }}
              style={{
                background: selectedProviderFilter === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                color: selectedProviderFilter === 'all' ? '#38bdf8' : '#94a3b8',
                border: selectedProviderFilter === 'all' ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              All Providers ({allModelItems.length})
            </button>
            {providerList.map(p => {
              const count = (allProviders[p]?.models || []).length
              if (!count) return null
              const isSelected = selectedProviderFilter === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setSelectedProviderFilter(p)
                    setFocusedIdx(0)
                  }}
                  style={{
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                    color: isSelected ? '#38bdf8' : '#94a3b8',
                    border: isSelected ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {allProviders[p]?.name || p} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* Model Results List */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {filteredModels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b' }}>
              <p style={{ margin: '0 0 6px', fontSize: '13px' }}>No models matching &ldquo;{query}&rdquo;</p>
              <span style={{ fontSize: '11px' }}>Try searching by provider name or clear filters</span>
            </div>
          ) : (
            filteredModels.map((item, idx) => {
              const isActive = activeProvider === item.provider && activeModel === item.model
              const isFocused = focusedIdx === idx

              return (
                <div
                  key={`${item.provider}::${item.model}`}
                  data-idx={idx}
                  onClick={() => {
                    onSelectModel(item.provider, item.model)
                    onClose()
                  }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: isActive
                      ? 'rgba(16, 185, 129, 0.15)'
                      : isFocused
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'transparent',
                    border: isActive
                      ? '1px solid rgba(16, 185, 129, 0.35)'
                      : isFocused
                      ? '1px solid rgba(255, 255, 255, 0.12)'
                      : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease, border 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: isActive ? '#34d399' : '#94a3b8',
                      }}
                    >
                      {isActive ? <Check size={14} /> : <ChevronRight size={13} />}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? '#6ee7b7' : '#f1f5f9',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.displayName}
                        </span>
                        {isActive && (
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: '#10b981',
                              color: '#022c22',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {item.providerName}
                      </span>
                    </div>
                  </div>

                  {/* Feature Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {item.isVision && (
                      <span
                        title="Supports live camera inspection"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                        }}
                      >
                        <Eye size={10} /> Vision
                      </span>
                    )}
                    {item.isReasoning && (
                      <span
                        title="Reasoning / Thinking model"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: 'rgba(168, 85, 247, 0.12)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.25)',
                        }}
                      >
                        <Brain size={10} /> Reasoning
                      </span>
                    )}
                    {item.isFast && (
                      <span
                        title="Ultra-low latency streaming"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: 'rgba(234, 179, 8, 0.12)',
                          color: '#facc15',
                          border: '1px solid rgba(234, 179, 8, 0.25)',
                        }}
                      >
                        <Zap size={10} /> Fast
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          <span>Use ↑↓ to navigate, Enter to select, Esc to close</span>
          <span>{filteredModels.length} models</span>
        </div>
      </div>
    </div>
  )
}
