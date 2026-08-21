import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, Zap, X, Plus } from 'lucide-react'

/**
 * Model selector.
 *
 * Replaces an <input list="…"> combobox: a datalist is filtered by the input's
 * current value, so once a model was selected, reopening the list showed only
 * models with near-identical names — the other 70 became unreachable. Here the
 * filter box is separate from the selection, so the full list is always there.
 */
export function ModelPicker({ models = [], value, measured = {}, onChange, formatLatency, disabled, compact = false, prefix = null }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Fastest measured first, then everything else alphabetically.
  const ordered = useMemo(() => {
    const withTime = []
    const rest = []
    for (const m of models) {
      const st = measured[m]
      if (st?.success) withTime.push({ m, ms: st.latencyMs ?? 9e9 })
      else rest.push(m)
    }
    withTime.sort((a, b) => a.ms - b.ms)
    rest.sort((a, b) => a.localeCompare(b))
    return [...withTime.map(x => x.m), ...rest]
  }, [models, measured])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return ordered
    return ordered.filter(m => needle.split(/\s+/).every(part => m.toLowerCase().includes(part)))
  }, [ordered, q])

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(Math.max(0, ordered.indexOf(value)))
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel, open])

  const pick = (m) => { onChange(m); setOpen(false) }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[sel]) pick(filtered[sel])
      else if (q.trim()) pick(q.trim())
    }
  }

  const label = value || 'Auto (provider default)'
  const current = measured[value]
  const cleanQ = q.trim()

  return (
    <div className={`model-picker${compact ? ' compact' : ''}`} ref={boxRef}>
      <button className="model-trigger" onClick={() => setOpen(o => !o)} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Model: ${label}. Change model`}
        title={`${prefix ? prefix + ' — ' : ''}${label}`}>
        {prefix && <span className="model-prefix">{prefix}</span>}
        <span className="model-current" title={label}>{label}</span>
        {current?.success && formatLatency && (
          <span className="model-ms">{formatLatency(current.latencyMs)}</span>
        )}
        <ChevronDown size={13} className={open ? 'chev open' : 'chev'} />
      </button>

      {open && (
        <div className="model-panel" role="listbox">
          <div className="model-search">
            <Search size={12} />
            <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0) }}
              onKeyDown={onKeyDown} placeholder={`Filter or enter custom model…`} aria-label="Filter models" />
            {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear filter"><X size={11} /></button>}
          </div>

          <div className="model-list" ref={listRef}>
            <button className={`model-option ${!value ? 'active' : ''}`} onClick={() => pick('')}>
              <span className="model-name">Auto (provider default)</span>
            </button>

            {cleanQ && !models.includes(cleanQ) && (
              <button className="model-option custom-add" onClick={() => pick(cleanQ)}
                style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <Plus size={12} className="model-tick" />
                <span className="model-name">Use custom model: <strong>"{cleanQ}"</strong></span>
              </button>
            )}

            {filtered.map((m, i) => {
              const st = measured[m]
              return (
                <button key={m} data-sel={i === sel}
                  className={`model-option ${m === value ? 'active' : ''} ${i === sel ? 'hover' : ''}`}
                  onMouseEnter={() => setSel(i)} onClick={() => pick(m)}
                  role="option" aria-selected={m === value}>
                  {m === value ? <Check size={11} className="model-tick" /> : <span className="model-tick" />}
                  <span className="model-name" title={m}>{m}</span>
                  {st?.success && (
                    <span className={`model-ms ${st.latencyMs < 2000 ? 'fast' : st.latencyMs > 15000 ? 'slow' : ''}`}>
                      {st.latencyMs < 2000 && <Zap size={9} />}
                      {formatLatency ? formatLatency(st.latencyMs) : `${st.latencyMs}ms`}
                    </span>
                  )}
                  {st && !st.success && <span className="model-ms failed">failed</span>}
                </button>
              )
            })}

            {!filtered.length && !cleanQ && (
              <div className="model-empty">
                No models available.
              </div>
            )}
          </div>

          <div className="model-foot">
            {filtered.length} of {ordered.length} · measured models first
          </div>
        </div>
      )}
    </div>
  )
}
