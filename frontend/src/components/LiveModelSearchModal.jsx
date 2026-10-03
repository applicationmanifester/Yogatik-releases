import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, X, Check, Sparkles, Eye, Zap, Brain, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'

export function LiveModelSearchModal({
  open,
  onClose,
  allProviders = {},
  keyInfo = {},
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

  const checkProviderReady = useCallback((pId) => {
    if (!pId) return false
    const pData = allProviders[pId]
    if (pData?.available === true) return true
    if (keyInfo?.[pId]?.configured === true) return true
    if (keyInfo?.[pId]?.key && String(keyInfo[pId].key).trim().length > 0) return true
    if (pData?.isOllama && (pData?.models || []).length > 0) return true
    if (pData?.noKey) return true
    return false
  }, [allProviders, keyInfo])

  // Build flattened list of all available models across providers
  const allModelItems = useMemo(() => {
    const list = []
    for (const [provId, provData] of Object.entries(allProviders || {})) {
      const provName = provData?.name || provId
      const models = provData?.models || []
      const isAvailable = provData?.available !== false
      const isReady = checkProviderReady(provId)

      for (const m of models) {
        const rawM = typeof m === 'string' ? m : (m?.id || m?.name || String(m || ''))
        if (!rawM) continue
        const lowerM = rawM.toLowerCase()
        const isVision = lowerM.includes('vision') || lowerM.includes('vl') || lowerM.includes('flash') || lowerM.includes('omni') || lowerM.includes('4o') || lowerM.includes('gemini')
        const isReasoning = lowerM.includes('r1') || lowerM.includes('reason') || lowerM.includes('thinking') || lowerM.includes('qwq') || lowerM.includes('nemotron')
        const isFast = lowerM.includes('fast') || lowerM.includes('flash') || lowerM.includes('turbo') || lowerM.includes('mini') || lowerM.includes('instant') || provId === 'groq'

        list.push({
          provider: provId,
          providerName: provName,
          model: rawM,
          displayName: rawM.split('/').pop(),
          isAvailable,
          isReady,
          isVision,
          isReasoning,
          isFast,
        })
      }
    }
    return list
  }, [allProviders, checkProviderReady])

  // Filtered list based on search query and provider tab (multi-term matching)
  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase()
    const terms = q.split(/\s+/).filter(Boolean)
    return allModelItems.filter(item => {
      if (selectedProviderFilter === 'fast') {
        if (!item.isFast) return false
      } else if (selectedProviderFilter !== 'all' && item.provider !== selectedProviderFilter) {
        return false
      }
      if (terms.length === 0) return true
      const mLow = item.model.toLowerCase()
      const dLow = item.displayName.toLowerCase()
      const pLow = item.provider.toLowerCase()
      const pnLow = item.providerName.toLowerCase()
      return terms.every(term =>
        mLow.includes(term) ||
        dLow.includes(term) ||
        pLow.includes(term) ||
        pnLow.includes(term) ||
        (item.isVision && ('vision'.includes(term) || 'camera'.includes(term) || 'image'.includes(term))) ||
        (item.isReasoning && ('reasoning'.includes(term) || 'thinking'.includes(term) || 'r1'.includes(term) || 'deep'.includes(term))) ||
        (item.isFast && ('fast'.includes(term) || 'lightning'.includes(term) || 'quick'.includes(term) || 'speed'.includes(term) || 'flash'.includes(term)))
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
    <div className="live-model-search-modal">
      <div className="live-model-search-modal__content">
        <div className="live-model-search-header">
          <h2 className="live-model-search-title">Select Model</h2>
          <button
            className="live-model-search-close"
            onClick={onClose}
            aria-label="Close model search"
          >
            <X size={20} />
          </button>
        </div>

        <div className="live-model-search-tabs">
          <button
            className={`live-model-search-tab ${selectedProviderFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedProviderFilter('all')}
          >
            All
          </button>
          <button
            className={`live-model-search-tab ${selectedProviderFilter === 'fast' ? 'active' : ''}`}
            onClick={() => setSelectedProviderFilter('fast')}
          >
            <Zap size={12} style={{ marginRight: 4 }} /> Fast
          </button>
          {providerList.map(pId => (
            <button
              key={pId}
              className={`live-model-search-tab ${selectedProviderFilter === pId ? 'active' : ''}`}
              onClick={() => setSelectedProviderFilter(pId)}
            >
              {allProviders[pId]?.name || pId}
            </button>
          ))}
        </div>

        <div className="live-model-search-body">
          <input
            ref={inputRef}
            type="text"
            className="live-model-search-input"
            placeholder="Search models… (e.g. gemini, vision, reasoning)"
            value={query}
            onChange={e => { setQuery(e.target.value); setFocusedIdx(0) }}
            autoComplete="off"
          />

          <div className="live-model-search-provider-filters">
            {providerList.map(pId => (
              <button
                key={pId}
                className={`live-model-search-provider-btn ${selectedProviderFilter === pId ? 'active' : ''}`}
                onClick={() => setSelectedProviderFilter(pId)}
                disabled={!checkProviderReady(pId)}
              >
                {allProviders[pId]?.name || pId}
              </button>
            ))}
          </div>

          <div className="live-model-list" ref={listRef} role="listbox" aria-label="Available models">
            {filteredModels.length === 0 ? (
              <div className="live-model-empty" style={{ padding: '24px', textAlign: 'center', color: 'var(--live-text-dim)' }}>
                <Search size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p>No models match your search.</p>
              </div>
            ) : (
              filteredModels.map((item, idx) => (
                <div
                  key={`${item.provider}:${item.model}`}
                  className={`live-model-item ${item === filteredModels[focusedIdx] ? 'focused' : ''} ${item.provider === activeProvider && item.model === activeModel ? 'selected' : ''}`}
                  data-idx={idx}
                  onClick={() => { onSelectModel(item.provider, item.model); onClose() }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  role="option"
                  aria-selected={item.provider === activeProvider && item.model === activeModel}
                >
                  <div className="live-model-item-info">
                    <div className="live-model-name">
                      {item.displayName}
                      {item.isVision && <span className="live-model-badge" style={{ marginLeft: 6, fontSize: '10px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: '9999px' }}>👁 Vision</span>}
                      {item.isReasoning && <span className="live-model-badge" style={{ marginLeft: 6, fontSize: '10px', background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', padding: '1px 6px', borderRadius: '9999px' }}>🧠 Reasoning</span>}
                      {item.isFast && <span className="live-model-badge" style={{ marginLeft: 6, fontSize: '10px', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', padding: '1px 6px', borderRadius: '9999px' }}>⚡ Fast</span>}
                    </div>
                    <div className="live-model-provider">{item.providerName}</div>
                  </div>
                  <div className="live-model-meta">
                    {!item.isReady && !item.isAvailable && (
                      <span style={{ color: 'var(--live-text-accent-error)', fontSize: '10px' }}>
                        <AlertTriangle size={10} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                        API key needed
                      </span>
                    )}
                    {!item.isReady && item.isAvailable && (
                      <span style={{ color: 'var(--live-text-accent-info)', fontSize: '10px' }}>
                        <Sparkles size={10} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                        Ready
                      </span>
                    )}
                    {item.isReady && (
                      <span style={{ color: 'var(--live-text-accent-success)', fontSize: '10px' }}>
                        <CheckCircle2 size={10} style={{ verticalAlign: '-1px', marginRight: 2 }} />
                        Connected
                      </span>
                    )}
                  </div>
                  {item.provider === activeProvider && item.model === activeModel && (
                    <div className="live-model-check"><Check size={14} /></div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
