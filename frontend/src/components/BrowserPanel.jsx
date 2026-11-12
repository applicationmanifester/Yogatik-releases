import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  ExternalLink, X, ArrowLeft, ArrowRight, RotateCw, Plus,
  ZoomIn, ZoomOut, Search, Download, FolderOpen, Eye, Layers, Check, Sparkles, Compass, RefreshCw,
} from 'lucide-react'

const sessionKeyFor = (conversationId) => conversationId || '__default__'

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeBrowserAddress(input) {
  const value = String(input || '').trim()
  if (!value) return ''
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value

  const shortcuts = {
    youtube: 'https://www.youtube.com',
    google: 'https://www.google.com',
    github: 'https://github.com',
    reddit: 'https://www.reddit.com',
    wikipedia: 'https://www.wikipedia.org',
    chatgpt: 'https://chatgpt.com',
  }
  const shortcut = shortcuts[value.toLowerCase()]
  if (shortcut) return shortcut

  const isHost = !/\s/.test(value) && (
    /^localhost(?::\d+)?(?:\/.*)?$/i.test(value)
    || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/.*)?$/.test(value)
    || /^[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+(?:[/:?#].*)?$/i.test(value)
  )
  return isHost
    ? `https://${value}`
    : `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
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
  const initialUrl = url || 'https://yogatik.web.app/browser'
  const [addrValue, setAddrValue] = useState(initialUrl)
  const [nav, setNav] = useState({
    tabs: [{ tabId: 'tab-1', url: initialUrl, title: 'Yogatik Browser' }],
    activeTabId: 'tab-1',
    url: initialUrl,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    zoomPercent: 100
  })
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findResult, setFindResult] = useState({ matches: 0, activeMatchOrdinal: 0 })
  const [downloads, setDownloads] = useState([])
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [indexState, setIndexState] = useState(null) // null | 'indexing' | 'indexed' | 'error'

  const handleIndexCurrentPage = async () => {
    const targetUrl = nav.url || url
    if (!targetUrl || targetUrl.startsWith('about:')) return
    setIndexState('indexing')
    try {
      const { indexUrlDirect } = await import('../tools/localIndexEngine.js')
      await indexUrlDirect(targetUrl)
      setIndexState('indexed')
      setTimeout(() => setIndexState(null), 3000)
    } catch {
      setIndexState('error')
      setTimeout(() => setIndexState(null), 3000)
    }
  }

  // ── Agent Eye / DOM Inspector State ──
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState('tree')
  const [domNodes, setDomNodes] = useState([])
  const [inspectionLoading, setInspectionLoading] = useState(false)
  const [inspectionError, setInspectionError] = useState('')
  const inspectorRequestRef = useRef(0)

  const br = () => (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null

  const inspectCurrentPage = useCallback(async () => {
    const b = br()
    const requestId = ++inspectorRequestRef.current
    if (!b?.inspect) {
      setDomNodes([])
      setInspectionError('Live page inspection is available in the Yogatik desktop browser.')
      return
    }
    setInspectionLoading(true)
    setInspectionError('')
    try {
      const result = await b.inspect({ conversationId, tabId: nav.activeTabId })
      if (requestId !== inspectorRequestRef.current) return
      if (!result?.success) throw new Error(result?.error || 'Could not inspect this page.')
      setDomNodes(result.nodes || [])
      setInspectionError(result.truncated ? 'Showing the first 160 visible page elements.' : '')
    } catch (error) {
      if (requestId !== inspectorRequestRef.current) return
      setDomNodes([])
      setInspectionError(error?.message || 'Could not inspect this page.')
    } finally {
      if (requestId === inspectorRequestRef.current) setInspectionLoading(false)
    }
  }, [conversationId, nav.activeTabId])

  useEffect(() => {
    if (!inspectorOpen || inspectorTab !== 'tree' || nav.loading) return
    inspectCurrentPage()
    return () => { inspectorRequestRef.current++ }
  }, [inspectorOpen, inspectorTab, nav.activeTabId, nav.url, nav.loading, inspectCurrentPage])

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

  const newTab = () => {
    if (br()) {
      br()?.newTab({ conversationId })
    } else {
      const newId = `tab-${Date.now()}`
      const newTabObj = { tabId: newId, url: '', title: 'New Tab' }
      setNav((prev) => {
        const existingTabs = prev.tabs && prev.tabs.length > 0
          ? prev.tabs
          : [{ tabId: 'tab-1', url: prev.url || '', title: 'Tab 1' }]
        return {
          ...prev,
          tabs: [...existingTabs, newTabObj],
          activeTabId: newId,
          url: '',
        }
      })
      setAddrValue('')
      setTimeout(() => addrRef.current?.focus(), 50)
    }
  }

  const selectTab = (tabId) => {
    if (br()) {
      br()?.selectTab({ conversationId, tabId })
    } else {
      setNav((prev) => {
        const t = prev.tabs?.find((tab) => tab.tabId === tabId)
        if (t) setAddrValue(t.url || '')
        return {
          ...prev,
          activeTabId: tabId,
          url: t ? t.url : prev.url,
        }
      })
    }
  }

  const closeTab = (e, tabId) => {
    e.stopPropagation()
    if (br()) {
      br()?.closeTab({ conversationId, tabId })
    } else {
      setNav((prev) => {
        const remaining = (prev.tabs || []).filter((t) => t.tabId !== tabId)
        const nextTabs = remaining.length > 0 ? remaining : [{ tabId: `tab-${Date.now()}`, url: '', title: 'New Tab' }]
        const nextActive = prev.activeTabId === tabId ? nextTabs[0].tabId : prev.activeTabId
        const activeTab = nextTabs.find((t) => t.tabId === nextActive)
        if (activeTab) setAddrValue(activeTab.url || '')
        return {
          ...prev,
          tabs: nextTabs,
          activeTabId: nextActive,
          url: activeTab ? activeTab.url : '',
        }
      })
    }
  }

  const zoom = (direction) => br()?.zoom({ conversationId, direction })

  const submitAddr = (e) => {
    e.preventDefault()
    const targetUrl = normalizeBrowserAddress(addrValue)
    if (!targetUrl) return
    setAddrValue(targetUrl)
    if (br()) {
      br()?.navigate({ conversationId, url: targetUrl })
    } else {
      setNav((prev) => {
        let title = targetUrl
        try { title = new URL(targetUrl).hostname.replace(/^www\./, '') } catch {}
        const updatedTabs = (prev.tabs || []).map((t) =>
          t.tabId === prev.activeTabId ? { ...t, url: targetUrl, title } : t
        )
        return {
          ...prev,
          url: targetUrl,
          tabs: updatedTabs.length > 0 ? updatedTabs : [{ tabId: 'tab-1', url: targetUrl, title }],
          activeTabId: prev.activeTabId || 'tab-1',
        }
      })
    }
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

  const showTabStrip = Boolean(nav.tabs && nav.tabs.length > 0)

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
          <button
            className={`artifact-btn${inspectorOpen ? ' active' : ''}`}
            onClick={() => setInspectorOpen((v) => !v)}
            title="Agent Eye / Live DOM Accessibility Inspector"
            aria-label="Agent Eye Inspector"
            style={{
              background: inspectorOpen ? 'rgba(99, 102, 241, 0.25)' : undefined,
              color: inspectorOpen ? '#a5b4fc' : undefined,
            }}
          >
            <Eye size={14} />
          </button>
          <button
            className={`artifact-btn${indexState === 'indexed' ? ' active' : ''}`}
            onClick={handleIndexCurrentPage}
            disabled={indexState === 'indexing' || !nav.url || nav.url.startsWith('about:')}
            title={indexState === 'indexed' ? 'Indexed into Yogatik Search Engine!' : 'Index page into Yogatik Search Engine'}
            aria-label="Index page into Yogatik Search Engine"
            style={{
              color: indexState === 'indexed' ? '#4ade80' : indexState === 'error' ? '#f87171' : undefined,
              background: indexState === 'indexed' ? 'rgba(34, 197, 94, 0.2)' : undefined,
            }}
          >
            {indexState === 'indexed' ? <Check size={14} /> : <Compass size={14} />}
          </button>
          {/* Take the Wheel / Human-in-the-loop (OpenBot pattern) */}
          {(nav.helpRequested || nav.humanControl) && (
            <button
              className="artifact-btn"
              onClick={async () => {
                if (nav.humanControl) {
                  await br()?.releaseWheel?.({ conversationId, tabId: nav.activeTabId })
                } else {
                  await br()?.takeWheel?.({ conversationId, tabId: nav.activeTabId })
                }
              }}
              title={nav.humanControl ? 'Human is driving. Click to hand back to AI agent.' : 'CAPTCHA / Challenge detected! Click to take the wheel.'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 8px',
                height: '24px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '6px',
                background: nav.humanControl ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.25)',
                color: nav.humanControl ? '#34d399' : '#f87171',
                border: `1px solid ${nav.humanControl ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.5)'}`,
                cursor: 'pointer',
              }}
            >
              {nav.humanControl ? '🚗 Hand Back' : '⚠️ Take Wheel'}
            </button>
          )}
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
          <button
            className="browser-panel-tab-plus"
            onClick={newTab}
            title="New tab"
            aria-label="New tab"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            <Plus size={14} />
          </button>
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
      {inspectorOpen && (
        <div style={{
          position: 'relative',
          background: 'rgba(15, 23, 42, 0.96)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          maxHeight: '260px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '11px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Eye size={12} /> Agent Eye Page Inspector
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setInspectorTab('tree')}
                  style={{
                    background: inspectorTab === 'tree' ? 'rgba(99, 102, 241, 0.2)' : 'none',
                    border: 'none',
                    color: inspectorTab === 'tree' ? '#a5b4fc' : '#94a3b8',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  DOM Tree ({domNodes.length})
                </button>
                <button
                  onClick={() => setInspectorTab('actions')}
                  style={{
                    background: inspectorTab === 'actions' ? 'rgba(99, 102, 241, 0.2)' : 'none',
                    border: 'none',
                    color: inspectorTab === 'actions' ? '#a5b4fc' : '#94a3b8',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  AI activity
                </button>
                {inspectorTab === 'tree' && (
                  <button
                    type="button"
                    onClick={inspectCurrentPage}
                    disabled={inspectionLoading || nav.loading}
                    aria-label="Refresh page inspection"
                    title="Refresh page inspection"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 22,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 5,
                      background: 'rgba(255,255,255,0.04)',
                      color: '#cbd5e1',
                      cursor: inspectionLoading || nav.loading ? 'wait' : 'pointer',
                      opacity: inspectionLoading || nav.loading ? 0.55 : 1,
                    }}
                  >
                    <RefreshCw size={12} className={inspectionLoading ? 'spin' : ''} />
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => setInspectorOpen(false)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              title="Close Inspector"
            >
              <X size={12} />
            </button>
          </div>

          <div style={{ padding: '8px 12px', fontSize: '11px', flex: 1, overflowY: 'auto' }}>
            {inspectorTab === 'tree' ? (
              domNodes.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {domNodes.map((n, i) => (
                    <div
                      key={`${i}:${n.role}`}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '3px 6px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: 4,
                        marginLeft: `${Math.min(n.depth || 0, 10) * 8}px`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{
                          fontSize: '9.5px',
                          fontWeight: 700,
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          padding: '1px 5px',
                          borderRadius: 3,
                          textTransform: 'uppercase',
                        }}>
                          {n.role}
                        </span>
                        <span style={{ color: '#f1f5f9', overflowWrap: 'anywhere' }}>{n.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div role="status" style={{ color: '#94a3b8', lineHeight: 1.5 }}>
                  {inspectionLoading ? 'Inspecting visible page elements…' : inspectionError || 'No visible page elements were found.'}
                </div>
              )
            ) : (
              <div role="status" style={{ color: '#94a3b8', lineHeight: 1.5 }}>
                Browser actions are shown in Yogatik AI&apos;s chat activity. This panel does not invent a separate action history.
              </div>
            )}
          </div>
        </div>
      )}
      {!br() ? (
        <div className="browser-panel-web-wrap">
          <div className="browser-panel-web-banner">
            <div className="browser-panel-web-banner-info">
              <span className="browser-panel-web-pill">Web Preview Mode</span>
              <span>Running in web companion. For hardware AdShield &amp; YouTube ad skipper, use Yogatik Standalone.</span>
            </div>
            <a href="/browser" target="_blank" rel="noopener noreferrer" className="browser-panel-web-btn">
              Download Browser →
            </a>
          </div>
          {nav.url && !nav.url.startsWith('about:') ? (
            <iframe
              title="Yogatik Browser Web View"
              src={nav.url}
              className="browser-panel-iframe"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="browser-panel-web-empty">
              <Compass size={44} color="var(--accent, #ff6b35)" />
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-primary)' }}>Yogatik Browser Web Companion</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '340px', margin: '0 auto 16px', lineHeight: 1.5 }}>
                Enter any address above to preview pages, or download the standalone desktop browser for full hardware AdShield and zero surveillance.
              </p>
              <div className="browser-panel-web-shortcuts">
                <button type="button" onClick={() => {
                  const target = 'https://news.ycombinator.com'
                  setAddrValue(target)
                  setNav((prev) => ({
                    ...prev,
                    url: target,
                    tabs: (prev.tabs || []).map(t => t.tabId === prev.activeTabId ? { ...t, url: target, title: 'Hacker News' } : t)
                  }))
                }}>Hacker News</button>
                <button type="button" onClick={() => {
                  const target = 'https://en.wikipedia.org'
                  setAddrValue(target)
                  setNav((prev) => ({
                    ...prev,
                    url: target,
                    tabs: (prev.tabs || []).map(t => t.tabId === prev.activeTabId ? { ...t, url: target, title: 'Wikipedia' } : t)
                  }))
                }}>Wikipedia</button>
                <button type="button" onClick={() => {
                  const target = 'https://github.com'
                  setAddrValue(target)
                  setNav((prev) => ({
                    ...prev,
                    url: target,
                    tabs: (prev.tabs || []).map(t => t.tabId === prev.activeTabId ? { ...t, url: target, title: 'GitHub' } : t)
                  }))
                }}>GitHub</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="browser-panel-hole" ref={holeRef} />
      )}
    </div>
  )
}
