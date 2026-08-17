import React, { useState } from 'react'
import { Copy, Check, X, ExternalLink } from 'lucide-react'
import { buildShareText, shareTargets } from '../share'

/**
 * Our own share sheet, shown when the platform has none.
 *
 * Electron does not expose navigator.share, and Windows offers no Electron API
 * for the native Share charm — so on desktop "Share Yogatik" quietly degraded
 * to a clipboard copy and looked like it had done nothing at all.
 *
 * Targets are plain https/mailto links, which main.cjs already routes to the
 * system browser, so the same component works on desktop and on any browser
 * without a native sheet.
 */
function ShareSheet({ onClose }) {
  const payload = buildShareText()
  const targets = shareTargets(payload)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload.clipboard)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked; the link is visible below to select by hand */ }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Share Yogatik">
        <div className="share-sheet-head">
          <h3>Share Yogatik</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="share-targets">
          {targets.map(t => (
            <a
              key={t.id}
              className="share-target"
              href={t.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setTimeout(onClose, 150)}
            >
              <span className="share-target-name">{t.label}</span>
              <ExternalLink size={12} />
            </a>
          ))}
        </div>

        {/* The link stays visible and selectable: if the clipboard is blocked
            (and it is, in some embedded webviews) the user still has a way out. */}
        <div className="share-link-row">
          <input className="share-link" readOnly value={payload.url} onFocus={e => e.target.select()} aria-label="Share link" />
          <button className="small-btn" onClick={copy}>
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export { ShareSheet }
