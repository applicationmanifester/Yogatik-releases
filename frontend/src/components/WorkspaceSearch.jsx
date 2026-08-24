import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Search, Regex, Loader2, AlertTriangle, FileCode, ChevronDown, ChevronRight } from 'lucide-react'
import { wsSearch, wsFindFiles } from '../tools/localFs'
import { normPath } from '../workspace/treeStore'

/**
 * WorkspaceSearch — content search across the granted folder, plus filename
 * search.
 *
 * It runs the SAME indexed, worker-isolated search the agent's fs_search tool
 * uses: .gitignore-pruned candidates, a 15s kill, and a regex the user typed
 * assessed before it is compiled. A search box that hands `(a+)+$` straight to
 * `new RegExp` freezes the whole desktop app with no way out but Task Manager —
 * which is exactly why that guard exists in main rather than here.
 *
 * When the pattern is refused, the literal results ARE shown, but labelled.
 * Showing them silently would read as "your regex matched nothing".
 */

export function WorkspaceSearch({ onOpenFile }) {
  const [query, setQuery] = useState('')
  const [glob, setGlob] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [mode, setMode] = useState('content')   // 'content' | 'files'
  const [state, setState] = useState({ status: 'idle', results: [], note: null, rejected: false })
  const [collapsed, setCollapsed] = useState({})
  const seq = useRef(0)

  const run = useCallback(async () => {
    const q = query.trim()
    if (!q) { setState({ status: 'idle', results: [], note: null, rejected: false }); return }
    const my = ++seq.current
    setState(s => ({ ...s, status: 'running' }))
    try {
      if (mode === 'files') {
        const files = await wsFindFiles(q)
        if (my !== seq.current) return
        setState({
          status: 'done',
          results: (files || []).map(p => ({ path: typeof p === 'string' ? p : p.path, line: null, text: '' })),
          note: null,
          rejected: false,
        })
        return
      }
      const res = await wsSearch(q, { glob, regex: useRegex })
      if (my !== seq.current) return
      const rows = Array.isArray(res) ? res : (res?.results || [])
      setState({
        status: 'done',
        results: rows,
        note: Array.isArray(res) ? null : res?.note || null,
        rejected: !Array.isArray(res) && !!res?.pattern_rejected,
      })
    } catch (e) {
      if (my !== seq.current) return
      setState({ status: 'error', results: [], note: e?.message || String(e), rejected: false })
    }
  }, [query, glob, useRegex, mode])

  // Group by file. A flat list of 200 hits across 8 files is unreadable, and
  // grouping is the difference between "search results" and "a wall of text".
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of state.results) {
      const p = normPath(r.path)
      if (!map.has(p)) map.set(p, [])
      map.get(p).push(r)
    }
    return [...map.entries()]
  }, [state.results])

  return (
    <div className="ws-search-view">
      <div className="ws-toolbar column">
        <div className="ws-search">
          <Search size={12} />
          <input
            value={query}
            autoFocus
            placeholder={mode === 'files' ? 'Filename or glob, e.g. **/*.test.js' : 'Search in files'}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            aria-label="Search query"
          />
          {mode === 'content' && (
            <button
              className={`icon-btn ${useRegex ? 'on' : ''}`}
              title="Use regular expression"
              aria-pressed={useRegex}
              onClick={() => setUseRegex(v => !v)}
            >
              <Regex size={12} />
            </button>
          )}
        </div>
        {mode === 'content' && (
          <div className="ws-search">
            <input
              value={glob}
              placeholder="Files to include, e.g. *.jsx"
              onChange={e => setGlob(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()}
              aria-label="Include glob"
            />
          </div>
        )}
        <div className="ws-seg">
          <button className={mode === 'content' ? 'active' : ''} onClick={() => setMode('content')}>Contents</button>
          <button className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')}>Filenames</button>
          <div className="ws-spacer" />
          <button className="ws-primary-btn sm" onClick={run} disabled={state.status === 'running'}>
            {state.status === 'running' ? <Loader2 size={11} className="ws-spin" /> : <Search size={11} />} Search
          </button>
        </div>
      </div>

      {state.rejected && (
        <div className="ws-notice warn">
          <AlertTriangle size={12} /> That pattern can backtrack catastrophically and was not run — these are literal-text matches instead.
          {state.note ? ` (${state.note})` : ''}
        </div>
      )}
      {!state.rejected && state.note && <div className="ws-notice error">{state.note}</div>}

      <div className="ws-results">
        {state.status === 'done' && !groups.length && <div className="ws-empty sm"><p>No matches.</p></div>}
        {groups.map(([path, hits]) => {
          const open = !collapsed[path]
          const name = path.split('/').pop()
          const dir = path.split('/').slice(0, -1).join('/')
          return (
            <div className="ws-result-group" key={path}>
              <div
                className="ws-result-head"
                role="button"
                tabIndex={0}
                onClick={() => setCollapsed(c => ({ ...c, [path]: open }))}
                onKeyDown={e => e.key === 'Enter' && setCollapsed(c => ({ ...c, [path]: open }))}
              >
                {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <FileCode size={12} />
                <span className="ws-change-name">{name}</span>
                <span className="ws-change-dir" title={dir}>{dir}</span>
                <span className="ws-count">{hits.length}</span>
              </div>
              {open && hits.map((h, i) => (
                <div
                  className="ws-result-row"
                  key={`${h.line}:${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenFile?.(path, name, h.line)}
                  onKeyDown={e => e.key === 'Enter' && onOpenFile?.(path, name, h.line)}
                >
                  {h.line != null && <span className="ws-ln">{h.line}</span>}
                  <code>{h.text}</code>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WorkspaceSearch
