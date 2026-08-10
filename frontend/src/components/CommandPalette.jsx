import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, CornerDownLeft, MessageSquare } from 'lucide-react'
import { searchChats } from '../chatSearch'

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
export function CommandPalette({ commands, onClose, onOpenChat }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [hits, setHits] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // BM25 over every stored message. Debounced because it reads the whole
  // messages table on a cold index and nobody needs a search per keystroke.
  useEffect(() => {
    if (!onOpenChat || q.trim().length < 2) { setHits([]); return }
    let live = true
    const t = setTimeout(() => {
      searchChats(q, 8)
        .then(r => { if (live) setHits(r) })
        .catch(() => { if (live) setHits([]) })
    }, 140)
    return () => { live = false; clearTimeout(t) }
  }, [q, onOpenChat])

  const results = useMemo(() => {
    const matched = commands.filter(c => fuzzy(q, `${c.group} ${c.label} ${c.hint || ''}`))
    const found = hits.map(h => ({
      id: `msg-${h.conversationId}-${h.createdAt}`,
      group: 'In chats',
      label: h.title,
      hint: h.snippet,
      icon: MessageSquare,
      run: () => onOpenChat(h.conversationId),
    }))
    // Message hits first: if the user typed two words, they are searching
    // content, not hunting for the "New chat" command.
    return [...found, ...matched].slice(0, 60)
  }, [commands, q, hits, onOpenChat])

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
            placeholder="Search your chats, commands, models…" aria-label="Search commands" />
          <kbd>esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Nothing matches "{q}"</div>}
          {results.map((c, i) => (
            <button key={c.id} data-sel={i === sel}
              className={`palette-item ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => { onClose(); c.run() }}>
              <span className="palette-group">
                {c.icon ? <c.icon size={10} /> : null} {c.group}
              </span>
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
