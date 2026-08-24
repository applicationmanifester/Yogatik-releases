import React, { memo, useMemo, useState } from 'react'
import { Columns2, Rows3, FileWarning } from 'lucide-react'
import { toSideBySide, hunkHeader } from '../workspace/diffModel'

/**
 * DiffView — renders the model diffModel produces. No parsing happens here:
 * the component takes hunks and paints them, which is why the alignment and the
 * word-level marks are unit-testable while this file stays a view.
 *
 * Inline and side-by-side are the same rows, arranged differently. Side-by-side
 * alignment comes from toSideBySide, NOT from a CSS grid guess — a review pane
 * that misaligns by one row will get a wrong edit approved.
 */

const Segments = memo(function Segments({ row }) {
  if (!row) return null
  if (!row.segments) return <>{row.text || ' '}</>
  return (
    <>
      {row.segments.map((s, i) => (
        s.changed
          ? <mark key={i} className="ws-word">{s.text}</mark>
          : <span key={i}>{s.text}</span>
      ))}
    </>
  )
})

function InlineRows({ rows }) {
  return rows.map((r, i) => (
    <div key={i} className={`ws-diff-line ${r.type}`}>
      <span className="ws-ln">{r.oldNo ?? ''}</span>
      <span className="ws-ln">{r.newNo ?? ''}</span>
      <span className="ws-sign">{r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '}</span>
      <code><Segments row={r} /></code>
    </div>
  ))
}

function SplitRows({ rows }) {
  const pairs = useMemo(() => toSideBySide(rows), [rows])
  return pairs.map((p, i) => (
    <div key={i} className="ws-diff-split">
      <div className={`ws-diff-line ${p.left ? p.left.type : 'gap'}`}>
        <span className="ws-ln">{p.left?.oldNo ?? ''}</span>
        <code>{p.left ? <Segments row={p.left} /> : ''}</code>
      </div>
      <div className={`ws-diff-line ${p.right ? p.right.type : 'gap'}`}>
        <span className="ws-ln">{p.right?.newNo ?? ''}</span>
        <code>{p.right ? <Segments row={p.right} /> : ''}</code>
      </div>
    </div>
  ))
}

export function DiffView({
  hunks = [],
  title = null,
  added = 0,
  removed = 0,
  note = null,
  binary = false,
  truncated = false,
  defaultMode = 'inline',
  actions = null,
}) {
  const [mode, setMode] = useState(defaultMode)

  const empty = !binary && !truncated && !hunks.length

  return (
    <div className="ws-diff">
      <div className="ws-diff-head">
        {title && <span className="ws-diff-title" title={title}>{title}</span>}
        <span className="ws-diff-stat">
          <b className="add">+{added}</b> <b className="del">−{removed}</b>
        </span>
        <div className="ws-diff-actions">
          {actions}
          <button
            className="icon-btn"
            title={mode === 'inline' ? 'Side by side' : 'Inline'}
            aria-label={mode === 'inline' ? 'Side by side' : 'Inline'}
            onClick={() => setMode(m => (m === 'inline' ? 'split' : 'inline'))}
          >
            {mode === 'inline' ? <Columns2 size={13} /> : <Rows3 size={13} />}
          </button>
        </div>
      </div>

      {note && <div className="ws-hint">{note}</div>}

      {binary && (
        <div className="ws-empty sm"><FileWarning size={18} /><p>Binary file — no text diff to show.</p></div>
      )}
      {truncated && (
        <div className="ws-empty sm">
          <FileWarning size={18} />
          <p>Too large to diff line by line.</p>
          <span>Comparing files this size would freeze the window, so it is reported instead of attempted.</span>
        </div>
      )}
      {empty && <div className="ws-empty sm"><p>No changes.</p></div>}

      {!binary && !truncated && hunks.length > 0 && (
        <div className={`ws-diff-body ${mode}`}>
          {hunks.map((h, i) => (
            <div className="ws-hunk" key={i}>
              <div className="ws-hunk-head">{hunkHeader(h)}</div>
              {mode === 'inline' ? <InlineRows rows={h.rows} /> : <SplitRows rows={h.rows} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DiffView
