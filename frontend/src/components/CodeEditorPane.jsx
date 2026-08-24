import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Save, X, RotateCcw, AlertTriangle, Loader2, FileCode, ChevronRight, XCircle } from 'lucide-react'
import { loadCodeMirror, buildExtensions } from '../workspace/codemirror'
import { extOf } from '../workspace/treeStore'
import { wsRead, wsWrite } from '../tools/localFs'

/**
 * CodeEditorPane — tabbed editor over the granted folder.
 *
 * LOST-UPDATE HANDLING is the part that matters. fs_read returns a content hash
 * and fs_write takes `expectedHash`; if the file changed underneath — because
 * the agent edited it while the tab was open, which in this app is the NORMAL
 * case, not the exotic one — the write still proceeds but reports `stale`. That
 * is only safe because the journal snapshots the current bytes first, so the
 * overwritten version is recoverable from the Agent tab. The tab says so rather
 * than pretending the save was uneventful.
 *
 * The CodeMirror chunk is fetched on first open and may fail (offline, stale
 * deploy). The fallback is a real textarea with tab handling, not a dead pane.
 */

const MAX_EDIT_BYTES = 2000000

function Fallback({ value, onChange, readOnly }) {
  return (
    <textarea
      className="ws-plain-editor"
      spellCheck={false}
      readOnly={readOnly}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        e.preventDefault()
        const el = e.currentTarget
        const { selectionStart: s, selectionEnd: t } = el
        onChange(`${value.slice(0, s)}  ${value.slice(t)}`)
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2 })
      }}
    />
  )
}

function Editor({ doc, ext, dark, readOnly, onChange, onSave }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const [cm, setCm] = useState(undefined)   // undefined = loading, null = unavailable
  // Handlers are read through a ref so changing them never tears down the
  // editor — rebuilding it on every keystroke would lose the cursor.
  const latest = useRef({ onChange, onSave })
  latest.current = { onChange, onSave }

  useEffect(() => { let live = true; loadCodeMirror().then(m => { if (live) setCm(m) }); return () => { live = false } }, [])

  useEffect(() => {
    if (!cm || !hostRef.current) return undefined
    const view = new cm.view.EditorView({
      state: cm.state.EditorState.create({
        doc,
        extensions: buildExtensions(cm, {
          ext, dark, readOnly,
          onChange: (v) => latest.current.onChange?.(v),
          onSave: () => latest.current.onSave?.(),
        }),
      }),
      parent: hostRef.current,
    })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // `doc` is the INITIAL document for this tab only; subsequent typing lives
    // in CodeMirror's own state. Listing it would recreate the editor on every
    // keystroke. The tab key forces a fresh mount when the file changes.

  }, [cm, ext, dark, readOnly])

  // While the chunk resolves the file is shown in the plain editor rather than
  // behind a spinner. It is the same text, editable, and typing carries across
  // the swap because the document lives in the parent's state — so the visible
  // cost of the lazy import is a syntax-highlighting delay, not a blank pane.
  // "Loading editor…" over a file the app had already read was the whole reason
  // opening one FELT slow.
  if (cm == null) return <Fallback value={doc} onChange={onChange} readOnly={readOnly} />
  return <div className="ws-cm" ref={hostRef} />
}

export function CodeEditorPane({ tabs, activeId, onActivate, onClose, onCloseAll, onDirtyChange, dark = true }) {
  const [docs, setDocs] = useState({})    // id -> { text, original, hash, loading, error, stale, saving, readOnly }
  const active = tabs.find(t => t.id === activeId) || null
  const doc = active ? docs[active.id] : null

  /* Load a tab's contents the first time it is activated. */
  useEffect(() => {
    if (!active || docs[active.id]) return
    let live = true
    setDocs(d => ({ ...d, [active.id]: { loading: true } }))
    wsRead(active.path, { maxBytes: MAX_EDIT_BYTES })
      .then((res) => {
        if (!live) return
        const text = typeof res === 'string' ? res : (res?.content ?? '')
        setDocs(d => ({
          ...d,
          [active.id]: {
            text,
            original: text,
            hash: res?.hash || null,
            // A truncated read must NOT be editable: saving it would write the
            // first 500KB over the whole file. This is the exact failure the
            // fs_read contract was changed to make visible.
            readOnly: !!res?.truncated,
            truncated: !!res?.truncated,
            encoding: res?.encoding || 'utf8',
            eol: res?.eol || 'lf',
          },
        }))
      })
      .catch((e) => {
        if (!live) return
        setDocs(d => ({ ...d, [active.id]: { error: e?.message || String(e) } }))
      })
    return () => { live = false }
  }, [active, docs])

  const setText = useCallback((id, text) => {
    setDocs(d => (d[id] ? { ...d, [id]: { ...d[id], text } } : d))
  }, [])

  const save = useCallback(async () => {
    if (!active) return
    const cur = docs[active.id]
    if (!cur || cur.readOnly || cur.text === cur.original) return
    setDocs(d => ({ ...d, [active.id]: { ...d[active.id], saving: true, error: null } }))
    try {
      const res = await wsWrite(active.path, cur.text, { expectedHash: cur.hash })
      setDocs(d => ({
        ...d,
        [active.id]: { ...d[active.id], saving: false, original: cur.text, hash: res?.hash || null, stale: !!res?.stale },
      }))
    } catch (e) {
      setDocs(d => ({ ...d, [active.id]: { ...d[active.id], saving: false, error: e?.message || String(e) } }))
    }
  }, [active, docs])

  const revert = useCallback(() => {
    if (!active) return
    setDocs(d => (d[active.id] ? { ...d, [active.id]: { ...d[active.id], text: d[active.id].original } } : d))
  }, [active])

  const dirtyIds = tabs.filter(t => docs[t.id] && docs[t.id].text !== docs[t.id].original).map(t => t.id)
  const dirtyKey = dirtyIds.join('|')
  useEffect(() => { onDirtyChange?.(dirtyIds) }, [dirtyKey])

  if (!tabs.length) {
    return (
      <div className="ws-empty">
        <FileCode size={22} />
        <p>No file open</p>
        <span>Pick a file in the explorer. Ctrl+S saves; the agent&apos;s own edits to the same file are snapshotted, so a clash is recoverable.</span>
      </div>
    )
  }

  const dirty = !!doc && doc.text !== doc.original

  return (
    <div className="ws-editor">
      <div className="ws-tabstrip" role="tablist">
        {tabs.map(t => {
          const d = docs[t.id]
          const isDirty = d && d.text !== d.original
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === activeId}
              className={`ws-tab ${t.id === activeId ? 'active' : ''}`}
              onClick={() => onActivate(t.id)}
              title={t.path}
            >
              <span className="ws-tab-name">{t.name}</span>
              {isDirty && <span className="ws-dot" aria-label="Unsaved changes" />}
              <button
                className="icon-btn"
                aria-label={`Close ${t.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isDirty && !window.confirm(`${t.name} has unsaved changes. Close it anyway?`)) return
                  setDocs(d2 => { const n = { ...d2 }; delete n[t.id]; return n })
                  onClose(t.id)
                }}
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
        {tabs.length > 1 && (
          <button
            className="ws-tab-closeall icon-btn"
            title="Close all files"
            aria-label="Close all files"
            onClick={() => {
              const anyDirty = tabs.some(t => docs[t.id] && docs[t.id].text !== docs[t.id].original)
              if (anyDirty && !window.confirm('Some files have unsaved changes. Close them all?')) return
              setDocs({})
              onCloseAll?.()
            }}
          >
            <XCircle size={12} />
          </button>
        )}
      </div>

      <div className="ws-editor-bar">
        <span className="ws-crumbs" title={active?.path}>
          {String(active?.path || '').split('/').map((seg, i, all) => (
            <span key={i} className={i === all.length - 1 ? 'leaf' : ''}>
              {seg}{i < all.length - 1 ? <ChevronRight size={10} /> : null}
            </span>
          ))}
        </span>
        {doc?.truncated && (
          <span className="ws-warn-chip">
            <AlertTriangle size={11} /> Only the first part of this file is shown — read-only so a save cannot truncate it.
          </span>
        )}
        {doc?.stale && (
          <span className="ws-warn-chip">
            <AlertTriangle size={11} /> The file changed on disk before this save. The previous version is in the Agent tab.
          </span>
        )}
        {doc?.error && <span className="ws-warn-chip error">{doc.error}</span>}
        <div className="ws-spacer" />
        {dirty && <button className="ws-ghost-btn sm" onClick={revert}><RotateCcw size={11} /> Revert</button>}
        <button className="ws-primary-btn sm" onClick={save} disabled={!dirty || doc?.saving || doc?.readOnly}>
          {doc?.saving ? <Loader2 size={11} className="ws-spin" /> : <Save size={11} />} Save
        </button>
      </div>

      <div className="ws-editor-body">
        {doc?.loading && (
          // A skeleton, not a spinner in an empty box: the file is milliseconds
          // away and a centred "Opening…" makes that read as a stall.
          <div className="ws-skeleton" aria-label="Opening file">
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} style={{ width: `${28 + ((i * 37) % 58)}%` }} />
            ))}
          </div>
        )}
        {doc && !doc.loading && !doc.error && (
          <Editor
            // Remounting per file is intentional: CodeMirror keeps its own
            // undo history and cursor in EditorState, and swapping the document
            // inside one view would carry one file's undo stack into another.
            key={active.id}
            doc={doc.text}
            ext={extOf(active.name)}
            dark={dark}
            readOnly={!!doc.readOnly}
            onChange={(v) => setText(active.id, v)}
            onSave={save}
          />
        )}
        {doc?.error && !doc.loading && <div className="ws-notice error">{doc.error}</div>}
      </div>

      {/* Status bar. Encoding and line endings are here because this editor
          writes back through fs_write, which PRESERVES both — a CRLF file
          silently becoming LF rewrites every line in the next diff, and the
          only defence against being surprised by that is seeing it. */}
      {doc && !doc.loading && !doc.error && (
        <div className="ws-statusbar">
          <span>{(doc.text.match(/\n/g)?.length ?? 0) + 1} lines</span>
          <span>{extOf(active.name) || 'plain'}</span>
          <span>{String(doc.encoding || 'utf8').toUpperCase()}</span>
          <span>{String(doc.eol || 'lf').toUpperCase()}</span>
          <div className="ws-spacer" />
          {doc.readOnly && <span className="ro">Read-only</span>}
          <span>{dirty ? 'Unsaved' : 'Saved'}</span>
        </div>
      )}
    </div>
  )
}

export default CodeEditorPane
