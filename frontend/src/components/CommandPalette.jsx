import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'

/** Subsequence match, so "gpt4" finds "openai/gpt-4o". */
function fuzzy(needle, haystack) {
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (!n) return true
  let i = 0
  for (const ch of h) if (ch === n[i]) i++
  return i === n.length
}

/**
 * Ctrl/Cmd+K palette. With 79 models and a settings drawer that keeps growing,
 * keyboard access scales where a sidebar does not.
 */
export function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const results = useMemo(() => {
    const matched = commands.filter(c => fuzzy(q, `${c.group} ${c.label} ${c.hint || ''}`))
    return matched.slice(0, 60)
  }, [commands, q])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSel(0) }, [q])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = results[sel]
        if (cmd) { onClose(); cmd.run() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [results, sel, onClose])

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={14} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search commands, models, chats…" aria-label="Search commands" />
          <kbd>esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Nothing matches "{q}"</div>}
          {results.map((c, i) => (
            <button key={c.id} data-sel={i === sel}
              className={`palette-item ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => { onClose(); c.run() }}>
              <span className="palette-group">{c.group}</span>
              <span className="palette-label">{c.label}</span>
              {c.hint && <span className="palette-hint">{c.hint}</span>}
              {i === sel && <CornerDownLeft size={11} className="palette-enter" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
