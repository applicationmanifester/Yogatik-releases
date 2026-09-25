import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, Zap, X, Plus } from 'lucide-react'

// Provider catalogs persisted by older desktop builds may contain model objects
// ({ id, name }) rather than the string IDs used by the picker.  Normalize at
// the component boundary so a stale local cache cannot crash the renderer.
function modelId(model) {
  if (typeof model === 'string') return model
  if (model && typeof model === 'object') {
    if (typeof model.id === 'string') return model.id
    if (typeof model.name === 'string') return model.name
  }
  return ''
}

/**
 * Model selector.
 *
 * Replaces an <input list="…"> combobox: a datalist is filtered by the input's
 * current value, so once a model was selected, reopening the list showed only
 * models with near-identical names — the other 70 became unreachable. Here the
 * filter box is separate from the selection, so the full list is always there.
 */
const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'fast', label: '⚡ Ultra Fast', test: (m) => /(flash|instant|mini|8b|haiku|groq|turbo|small|nano)/i.test(m) },
  { id: 'code', label: '💻 Coding', test: (m) => /(code|coder|codestral|sonnet|qwen|deepseek|claude)/i.test(m) },
  { id: 'reason', label: '🧠 Reasoning', test: (m) => /(r1|reason|o1|o3|o4|nemotron.*ultra)/i.test(m) },
  { id: 'grounded', label: '🌐 Web Search', test: (m) => /(sonar|perplexity|search|browse)/i.test(m) },
  { id: 'local', label: '🔒 Local / Free', test: (m) => /(local|free|ollama|gemma)/i.test(m) },
]

export function ModelPicker({ models = [], value, measured = {}, onChange, formatLatency, disabled, compact = false, prefix = null }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [sel, setSel] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const modelIds = useMemo(
    () => [...new Set((Array.isArray(models) ? models : []).map(modelId).filter(Boolean))],
    [models],
  )
  const selectedValue = modelId(value)

  // Fastest measured first, then everything else alphabetically.
  const ordered = useMemo(() => {
    const withTime = []
    const rest = []
    for (const m of modelIds) {
      const st = measured[m]
      if (st?.success) withTime.push({ m, ms: st.latencyMs ?? 9e9 })
      else rest.push(m)
    }
    withTime.sort((a, b) => a.ms - b.ms)
    rest.sort((a, b) => a.localeCompare(b))
    return [...withTime.map(x => x.m), ...rest]
  }, [modelIds, measured])

  const filtered = useMemo(() => {
    let list = ordered
    if (category !== 'all') {
      const catObj = CATEGORIES.find(c => c.id === category)
      if (catObj?.test) {
        list = list.filter(m => catObj.test(m))
      }
    }
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(m => needle.split(/\s+/).every(part => m.toLowerCase().includes(part)))
  }, [ordered, q, category])

  useEffect(() => {
    if (!open) return
    setQ('')
    setCategory('all')
    setSel(Math.max(0, ordered.indexOf(selectedValue)))
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

  const label = selectedValue || 'Auto (provider default)'
  const current = measured[selectedValue]
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
        <div className="model-panel" role="listbox" style={{ minWidth: '320px' }}>
          <div className="model-search">
            <Search size={12} />
            <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0) }}
              onKeyDown={onKeyDown} placeholder={`Filter or enter custom model…`} aria-label="Filter models" />
            {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear filter"><X size={11} /></button>}
          </div>

          <div
            className="model-categories"
            style={{
              display: 'flex',
              gap: '4px',
              padding: '6px 8px',
              overflowX: 'auto',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              scrollbarWidth: 'none',
            }}
          >
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`category-pill ${category === cat.id ? 'active' : ''}`}
                onClick={() => { setCategory(cat.id); setSel(0) }}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  border: category === cat.id ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: category === cat.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  color: category === cat.id ? '#60a5fa' : 'inherit',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontWeight: category === cat.id ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="model-list" ref={listRef}>
            <button className={`model-option ${!value ? 'active' : ''}`} onClick={() => pick('')}>
              <span className="model-name">Auto (provider default)</span>
            </button>

            {cleanQ && !modelIds.includes(cleanQ) && (
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
                  className={`model-option ${m === selectedValue ? 'active' : ''} ${i === sel ? 'hover' : ''}`}
                  onMouseEnter={() => setSel(i)} onClick={() => pick(m)}
                  role="option" aria-selected={m === selectedValue}>
                  {m === selectedValue ? <Check size={11} className="model-tick" /> : <span className="model-tick" />}
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
