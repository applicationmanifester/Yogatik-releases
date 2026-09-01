import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, Key } from 'lucide-react'

/**
 * Provider selector dropdown component positioned directly above the chat composer.
 * Allows instant switching across all configured/ready AI providers with live connection indicators.
 */
export function ProviderPicker({
  providers = {},
  activeProvider = '',
  providerStatus = {},
  onChange,
  onManageProviders,
  disabled = false,
  compact = true,
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const activeDef = providers[activeProvider] || {}
  const activeName = activeDef.name || activeProvider || 'Select Provider'
  const isReady = activeDef.available || activeProvider === 'local' || activeDef.is_ollama
  const statusState = providerStatus[activeProvider]?.state
  const dotClass = statusState === 'failed' ? 'failed' : (statusState === 'connected' || isReady ? 'connected' : 'unknown')

  const sortedList = useMemo(() => {
    return Object.entries(providers)
      .sort(([pidA, defA], [pidB, defB]) => {
        const readyA = defA.available || pidA === 'local' || defA.is_ollama
        const readyB = defB.available || pidB === 'local' || defB.is_ollama
        if (readyA !== readyB) return readyA ? -1 : 1
        return (defA.name || pidA).localeCompare(defB.name || pidB)
      })
      .filter(([pid, def]) => {
        if (!q.trim()) return true
        const query = q.trim().toLowerCase()
        return (def.name || pid).toLowerCase().includes(query) || pid.toLowerCase().includes(query)
      })
  }, [providers, q])

  useEffect(() => {
    if (!open) return
    setQ('')
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (pid) => {
    onChange?.(pid)
    setOpen(false)
  }

  return (
    <div className={`provider-picker${compact ? ' compact' : ''}`} ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="provider-trigger"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active Provider: ${activeName}. Switch provider`}
        title={`Active AI Provider: ${activeName} (click to switch)`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          background: 'var(--bg-input, rgba(255,255,255,0.06))',
          color: 'var(--text-primary, #eee)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          maxWidth: '180px',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: dotClass === 'connected' ? '#10b981' : (dotClass === 'failed' ? '#ef4444' : '#6b7280'),
            boxShadow: dotClass === 'connected' ? '0 0 6px rgba(16, 185, 129, 0.6)' : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeName}
        </span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.7, flexShrink: 0 }} />
      </button>

      {open && (
        <div
          className="provider-panel"
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 'calc(100% + 6px)',
            minWidth: '220px',
            maxHeight: 'min(46vh, 320px)',
            background: 'var(--bg-secondary, #1a1a1a)',
            border: '1px solid var(--border, #333)',
            borderRadius: '8px',
            boxShadow: '0 10px 32px rgba(0,0,0,0.5)',
            zIndex: 70,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {Object.keys(providers).length > 6 && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={12} style={{ opacity: 0.5 }} />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Filter providers…"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'inherit',
                  fontSize: '12px',
                  width: '100%',
                }}
              />
            </div>
          )}

          <div style={{ overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sortedList.map(([pid, def]) => {
              const ready = def.available || pid === 'local' || def.is_ollama
              const isSelected = pid === activeProvider
              const st = providerStatus[pid]?.state
              const itemDot = st === 'failed' ? '#ef4444' : (st === 'connected' || ready ? '#10b981' : '#6b7280')

              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => pick(pid)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '6px 10px',
                    fontSize: '12px',
                    borderRadius: '5px',
                    background: isSelected ? 'rgba(255, 107, 53, 0.15)' : 'transparent',
                    color: isSelected ? 'var(--accent, #ff6b35)' : 'var(--text-primary, #ddd)',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: itemDot,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {def.name || pid}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {ready && <span style={{ fontSize: '10px', opacity: 0.6, background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', padding: '1px 5px', borderRadius: 4 }}>ready</span>}
                    {isSelected && <Check size={12} style={{ color: 'var(--accent, #ff6b35)' }} />}
                  </div>
                </button>
              )
            })}
          </div>

          {onManageProviders && (
            <button
              type="button"
              onClick={() => { setOpen(false); onManageProviders() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent, #ff6b35)',
                borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
                background: 'rgba(255, 107, 53, 0.05)',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Key size={11} /> Manage Providers &amp; Keys
            </button>
          )}
        </div>
      )}
    </div>
  )
}
