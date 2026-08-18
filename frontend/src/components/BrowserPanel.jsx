import React, { useEffect, useRef, useCallback } from 'react'
import { ExternalLink, X } from 'lucide-react'

// Chrome around a hole. A WebContentsView is an OS-level layer composited above
// the renderer's DOM — it cannot be occluded by React markup and z-index does not
// apply to it. So this panel renders the frame and reports where the native view
// should sit; main positions it to match.
export function BrowserPanel({ conversationId, url, onPopOut, onClose, occluded }) {
  const holeRef = useRef(null)

  const br = () => (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null

  const report = useCallback(() => {
    const b = br()
    const el = holeRef.current
    if (!b || !el) return
    const r = el.getBoundingClientRect()
    // setBounds takes DIPs and getBoundingClientRect is already in CSS px, which
    // equal DIPs — so no scaling, only rounding.
    b.setBounds({
      conversationId,
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
  }, [conversationId])

  useEffect(() => {
    report()
    const ro = new ResizeObserver(report)
    if (holeRef.current) ro.observe(holeRef.current)
    window.addEventListener('resize', report)
    return () => { ro.disconnect(); window.removeEventListener('resize', report) }
  }, [report])

  // Any overlay that should cover this panel would be painted UNDER the native
  // view, so detach it while one is open.
  useEffect(() => {
    const b = br()
    if (!b) return
    b.setDetached({ conversationId, detached: !!occluded })
  }, [occluded, conversationId])

  // Unmounting leaves the session alive (the model may still be working), but the
  // view must stop painting over an app that no longer shows a panel.
  useEffect(() => {
    return () => {
      const b = br()
      if (b) b.setDetached({ conversationId, detached: true })
    }
  }, [conversationId])

  return (
    <div className="browser-panel">
      <div className="browser-panel-header">
        <span className="browser-panel-url" title={url}>{url || 'Browser'}</span>
        <button className="artifact-btn" onClick={onPopOut} title="Open in a separate window" aria-label="Open in a separate window">
          <ExternalLink size={16} />
        </button>
        <button className="artifact-btn close" onClick={onClose} title="Close browser" aria-label="Close browser">
          <X size={16} />
        </button>
      </div>
      <div className="browser-panel-hole" ref={holeRef} />
    </div>
  )
}
