import React, { useState } from 'react'
import { FileText, ListCollapse, ListPlus } from 'lucide-react'

/**
 * The inline-citations strip under an answer that cited doc_search results.
 *
 * Data-only and additive to the message: MessageBubble derives `strip` from
 * the FINISHED answer text + the per-message tool result (citations.js
 * `buildSourcesStrip`), so raw message text in the db is never touched.
 *
 * @param {null | { count: number, items: Array<{
 *   n: number, docName: string, chunk?: number, of?: number,
 *   preview: string, score?: number }>}} strip
 *   null / empty ⇒ renders nothing — the hide-when-no-citations contract.
 */
export const CitationsStrip = React.memo(function CitationsStrip({ strip }) {
  const [open, setOpen] = useState(false)

  if (!strip || !Array.isArray(strip.items) || !strip.items.length) return null

  const count = strip.count ?? strip.items.length
  const toggle = () => setOpen(v => !v)

  return (
    <div className="citations-strip" data-testid="citations-strip" style={{ marginTop: 10 }}>
      <div
        className="sources-title"
        style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #71717a)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <FileText size={12} /> Cited passages ({count})
        <button
          type="button"
          className="icon-btn citation-expand-btn"
          onClick={toggle}
          title={open ? 'Hide cited passages' : 'Show cited passages'}
          aria-expanded={open}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '0 2px' }}
        >
          {open ? <ListCollapse size={11} /> : <ListPlus size={11} />}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {strip.items.map((item) => (
          <button
            key={item.n}
            type="button"
            className="source-item source-chip citation-chip"
            data-testid="citation-chip"
            title={item.preview || ''}
            onClick={toggle}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent, #38bdf8)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontWeight: 700 }}>[{item.n}]</span> {item.docName}
          </button>
        ))}
      </div>
      {open && (
        <div className="citations-detail" data-testid="citations-detail" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {strip.items.map((item) => (
            <div
              key={item.n}
              className="citation-detail-row"
              data-testid="citation-detail-row"
              style={{ fontSize: 11.5, color: 'var(--text-secondary, #aaa)', lineHeight: 1.45, padding: '6px 8px', background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 6, border: '1px solid var(--border, rgba(255,255,255,0.08))' }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-primary, #ddd)' }}>[{item.n}] {item.docName}</span>
              {item.chunk != null && (
                <span style={{ opacity: 0.7 }}> · chunk {item.chunk}{item.of ? `/${item.of}` : ''}</span>
              )}
              {typeof item.score === 'number' && Number.isFinite(item.score) && (
                <span style={{ opacity: 0.6 }}> · score {item.score}</span>
              )}
              <div style={{ marginTop: 3 }}>{item.preview}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default CitationsStrip
