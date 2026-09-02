import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  ExternalLink, X, ArrowLeft, ArrowRight, RotateCw, Plus,
  ZoomIn, ZoomOut, Search, Download, FolderOpen,
} from 'lucide-react'

const sessionKeyFor = (conversationId) => conversationId || '__default__'

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Chrome around a hole. A WebContentsView is an OS-level layer composited above
// the renderer's DOM — it cannot be occluded by React markup and z-index does not
// apply to it. So this panel renders the frame and reports where the native view
// should sit; main positions it to match.
export function BrowserPanel({ conversationId, url, onPopOut, onClose, occluded }) {
  const holeRef = useRef(null)
  const addrRef = useRef(null)
  const findRef = useRef(null)
  const downloadsWrapRef = useRef(null)
  const [addrValue, setAddrValue] = useState(url || '')
  const [nav, setNav] = useState({ tabs: [], activeTabId: null, url: url || '', canGoBack: false, canGoForward: false, loading: false, zoomPercent: 100 })
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findResult, setFindResult] = useState({ matches: 0, activeMatchOrdinal: 0 })
  const [downloads, setDownloads] = useState([])
  const [downloadsOpen, setDownloadsOpen] = useState(false)

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

  // Toolbar state: seeded once via a real pull (getNavState — window mode has
  // its own chrome document main can push into directly with executeJavaScript;
  // this panel IS the main renderer, so it gets one IPC event channel instead
  // of polling), then kept live by subscribing to every push after.
  useEffect(() => {
    const b = br()
    if (!b) return
    let cancelled = false
    b.getNavState?.({ conversationId }).then((res) => {
      if (cancelled || !res) return
      setNav(res)
      if (document.activeElement !== addrRef.current) setAddrValue(res.url || '')
    }).catch(() => {})
    const unsub = b.onNavState?.((payload) => {
      if (!payload || payload.conversationId !== conversationId) return
      setNav(payload)
      if (document.activeElement !== addrRef.current) setAddrValue(payload.url || '')
    })
    return () => { cancelled = true; unsub?.() }
  }, [conversationId])

  // Ctrl/Cmd+F inside the PAGE never reaches this component — the page is a
  // separate top-level browsing context — so main intercepts it there and
  // pushes this event to open OUR find bar.
  useEffect(() => {
    const b = br()
    if (!b) return
    const unsub = b.onOpenFind?.((payload) => {
      if (!payload || payload.conversationId !== conversationId) return
      setFindOpen(true)
    })
    return () => unsub?.()
  }, [conversationId])

  useEffect(() => {
    if (findOpen) { setTimeout(() => findRef.current?.focus(), 0); return }
    br()?.findStop({ conversationId })
    setFindText('')
    setFindResult({ matches: 0, activeMatchOrdinal: 0 })
  }, [findOpen])

  // Downloads: seeded via a pull, then kept live via push — same shape as nav
  // state. Scoped by session key, since the record on the main-process side
  // carries the RAW key ('__default__' for no conversation) rather than the
  // null this component uses for the same case.
  useEffect(() => {
    const b = br()
    if (!b) return
    let cancelled = false
    const key = sessionKeyFor(conversationId)
    b.downloads?.({ conversationId }).then((res) => {
      if (cancelled || !res?.success) return
      setDownloads(res.downloads || [])
    }).catch(() => {})
    const unsub = b.onDownload?.((rec) => {
      if (!rec || rec.sessionKey !== key) return
      setDownloads((prev) => [rec, ...prev.filter((d) => d.id !== rec.id)].slice(0, 50))
    })
    return () => { cancelled = true; unsub?.() }
  }, [conversationId])

  const goBack = () => br()?.history({ conversationId, direction: 'back' })
  const goForward = () => br()?.history({ conversationId, direction: 'forward' })
  const doReload = () => br()?.reload({ conversationId })
  const newTab = () => br()?.newTab({ conversationId })
  const selectTab = (tabId) => br()?.selectTab({ conversationId, tabId })
  const closeTab = (e, tabId) => { e.stopPropagation(); br()?.closeTab({ conversationId, tabId }) }
  const zoom = (direction) => br()?.zoom({ conversationId, direction })

  const submitAddr = (e) => {
    e.preventDefault()
    const val = addrValue.trim()
    if (!val) return
    br()?.navigate({ conversationId, url: val })
    addrRef.current?.blur()
  }

  const runFind = async (opts = {}) => {
    if (!findText.trim()) { setFindResult({ matches: 0, activeMatchOrdinal: 0 }); return }
    const res = await br()?.find({ conversationId, text: findText, forward: true, findNext: false, ...opts })
    if (res?.success) setFindResult({ matches: res.matches || 0, activeMatchOrdinal: res.activeMatchOrdinal || 0 })
  }
  const findKeyDown = (e) => {
    if (e.key === 'Escape') { setFindOpen(false); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    runFind({ findNext: true, forward: !e.shiftKey })
  }

  useEffect(() => {
    if (!downloadsOpen) return
    const onDocClick = (e) => {
      if (downloadsWrapRef.current && !downloadsWrapRef.current.contains(e.target)) setDownloadsOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [downloadsOpen])

  const inProgressCount = downloads.filter((d) => d.state === 'progressing').length

  const showTabStrip = nav.tabs && nav.tabs.length > 1

  return (
    <div className="browser-panel">
      <div className="browser-panel-header">
        <div className="browser-panel-toolbar">
          <button className="artifact-btn" onClick={goBack} disabled={!nav.canGoBack} title="Back" aria-label="Back">
            <ArrowLeft size={14} />
          </button>
          <button className="artifact-btn" onClick={goForward} disabled={!nav.canGoForward} title="Forward" aria-label="Forward">
            <ArrowRight size={14} />
          </button>
          <button className={`artifact-btn${nav.loading ? ' loading' : ''}`} onClick={doReload} title="Reload" aria-label="Reload">
            <RotateCw size={14} />
          </button>
          <form className="browser-panel-addr-form" onSubmit={submitAddr}>
            <input
              ref={addrRef}
              className="browser-panel-addr"
              value={addrValue}
              onChange={(e) => setAddrValue(e.target.value)}
              placeholder="Search or enter address"
              spellCheck={false}
              autoComplete="off"
              title={url}
            />
          </form>
          <button className="artifact-btn" onClick={() => zoom('out')} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button className="browser-panel-zoom-pct" onClick={() => zoom('reset')} title="Reset zoom">
            {nav.zoomPercent ?? 100}%
          </button>
          <button className="artifact-btn" onClick={() => zoom('in')} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button className="artifact-btn" onClick={() => setFindOpen((v) => !v)} title="Find in page" aria-label="Find in page">
            <Search size={14} />
          </button>
          <div className="browser-panel-downloads-wrap" ref={downloadsWrapRef}>
            <button
              className={`artifact-btn${inProgressCount ? ' loading' : ''}`}
              onClick={() => setDownloadsOpen((v) => !v)}
              title="Downloads"
              aria-label="Downloads"
            >
              <Download size={14} />
              {downloads.length > 0 && <span className="browser-panel-badge">{inProgressCount || downloads.length}</span>}
            </button>
            {downloadsOpen && (
              <div className="browser-panel-downloads-menu">
                {downloads.length === 0 && <div className="browser-panel-downloads-empty">No downloads yet</div>}
                {downloads.map((d) => {
                  const pct = d.totalBytes > 0 ? Math.round((d.receivedBytes / d.totalBytes) * 100) : null
                  return (
                    <div key={d.id} className="browser-panel-download-row">
                      <div className="browser-panel-download-info">
                        <span className="browser-panel-download-name" title={d.filename}>{d.filename}</span>
                        <span className="browser-panel-download-meta">
                          {d.state === 'progressing' ? `${pct != null ? pct + '% · ' : ''}${formatBytes(d.receivedBytes)}` : d.state}
                        </span>
                      </div>
                      <div className="browser-panel-download-actions">
                        {d.state === 'progressing' && (
                          <button onClick={() => br()?.cancelDownload({ id: d.id })} title="Cancel">×</button>
                        )}
                        {d.state === 'completed' && (
                          <>
                            <button onClick={() => br()?.openDownload({ id: d.id })} title="Open"><ExternalLink size={12} /></button>
                            <button onClick={() => br()?.showDownload({ id: d.id })} title="Show in folder"><FolderOpen size={12} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <button className="artifact-btn" onClick={newTab} title="New tab" aria-label="New tab">
            <Plus size={14} />
          </button>
        </div>
        <button className="artifact-btn" onClick={onPopOut} title="Open in a separate window" aria-label="Open in a separate window">
          <ExternalLink size={16} />
        </button>
        <button className="artifact-btn close" onClick={onClose} title="Close browser" aria-label="Close browser">
          <X size={16} />
        </button>
      </div>
      {showTabStrip && (
        <div className="browser-panel-tabs">
          {nav.tabs.map((t) => (
            <div
              key={t.tabId}
              className={`browser-panel-tab${t.tabId === nav.activeTabId ? ' active' : ''}`}
              onClick={() => selectTab(t.tabId)}
              title={t.url}
            >
              <span>{t.title || t.url || 'New tab'}</span>
              <button onClick={(e) => closeTab(e, t.tabId)} title="Close tab" aria-label="Close tab">×</button>
            </div>
          ))}
        </div>
      )}
      {findOpen && (
        <div className="browser-panel-find">
          <input
            ref={findRef}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={findKeyDown}
            placeholder="Find in page"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="browser-panel-find-count">
            {findText.trim() ? `${findResult.activeMatchOrdinal}/${findResult.matches}` : ''}
          </span>
          <button onClick={() => runFind({ findNext: true, forward: false })} title="Previous match" aria-label="Previous match">&#8593;</button>
          <button onClick={() => runFind({ findNext: true, forward: true })} title="Next match" aria-label="Next match">&#8595;</button>
          <button onClick={() => setFindOpen(false)} title="Close find" aria-label="Close find">×</button>
        </div>
      )}
      <div className="browser-panel-hole" ref={holeRef} />
    </div>
  )
}
