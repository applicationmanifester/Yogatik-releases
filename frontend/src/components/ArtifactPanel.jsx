import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Eye, Code as CodeIcon, X, Download, Copy, Check, ExternalLink, Sparkles, CheckCheck,
  Monitor, Tablet, Smartphone, RefreshCw, Pin, PinOff, RotateCcw, ArrowLeftRight, Clock3,
} from 'lucide-react'
import { lineDiff, summarizeDiff } from '../diffPreview.js'
import { downloadBlob } from '../chatExport.js'
import {
  saveArtifactVersion, getArtifactVersions, getArtifactPinned, setArtifactPinned,
} from '../db.js'

/**
 * Artifacts v2 — a versioned workspace. Every body that a same-key
 * regeneration (or a restore) replaces is archived in Dexie
 * (`artifact_versions`, see db.js) before the panel shows its replacement, so
 * iterating on an artifact can never destroy earlier work. Versions render as
 * a slim strip of chips: click to view, Compare for a side-by-side line diff
 * against the live body, Restore to write a version back as a NEW version.
 */

/** Same artifact key ⇔ same title+language: a regeneration, not a new artifact. */
export function artifactKeyOf(artifact) {
  const title = String(artifact?.title || 'artifact').trim().toLowerCase()
  const lang = String(artifact?.language || '').toLowerCase()
  return `${title}|${lang}`
}

const EXT_BY_LANGUAGE = { html: 'html', svg: 'svg', javascript: 'js', python: 'py', css: 'css', json: 'json', markdown: 'md' }
const safeArtifactName = (t) => (t || 'artifact').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48) || 'artifact'

/** Standard clipboard write with a guarded execCommand fallback (permissions, http pages, tests). */
async function copyToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

function shortTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return String(ts) }
}

export function ArtifactPanel({ artifact, onClose, conversationId = null }) {
  const [activeTab, setActiveTab] = useState('preview')
  const [copied, setCopied] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
  const [verifyCopied, setVerifyCopied] = useState(false)
  const [viewportMode, setViewportMode] = useState('desktop') // 'desktop' | 'tablet' | 'mobile'
  const [reloadKey, setReloadKey] = useState(0)

  // ─── Artifacts v2 state ───
  const [versions, setVersions] = useState([])          // archived rows, newest first
  const [selectedId, setSelectedId] = useState(null)    // null = live body
  const [overrideBody, setOverrideBody] = useState(null) // restored body, held until the next generation
  const [comparing, setComparing] = useState(false)
  const [pinned, setPinned] = useState(false)

  const title = artifact?.title
  const language = artifact?.language
  const liveCode = artifact?.code ?? ''

  const artifactKey = useMemo(() => artifactKeyOf(artifact), [artifact?.title, artifact?.language])
  const selection = versions.find(v => v.id === selectedId) || null
  // What the panel displays: a restored body → a viewed archived body → the live body.
  const displayCode = overrideBody ?? (selection ? selection.code : liveCode)
  const code = displayCode // shared naming for everything below

  // Ref mirrors for async callbacks (saves resolve after renders).
  const artifactKeyRef = useRef(artifactKey)
  artifactKeyRef.current = artifactKey
  const liveCodeRef = useRef(liveCode)
  liveCodeRef.current = liveCode
  // The body the archive effect last saw — i.e. the "previous body" when a
  // same-key regeneration arrives. Restores patch it too (see handleRestore),
  // so the NEXT regeneration diffs against whatever is actually on screen.
  const seenBodyRef = useRef(null)

  const refreshVersions = useCallback(async () => {
    try {
      const rows = await getArtifactVersions(artifactKeyRef.current)
      setVersions(rows.slice().reverse()) // newest chip first
    } catch { /* db unavailable — the strip simply stays empty */ }
  }, [])

  // (1) A different artifact key swaps the strip to that artifact's history.
  useEffect(() => {
    refreshVersions()
  }, [artifactKey, refreshVersions])

  // (2) A new generation (or a key change) always snaps the view back to live:
  // history is for looking back, the new body is the work.
  useEffect(() => {
    setSelectedId(null)
    setOverrideBody(null)
    setComparing(false)
  }, [artifactKey, liveCode])

  // (3) Archive hook: when the SAME artifact key regenerates, push the body it
  // replaces into `artifact_versions`. The first sighting of an artifact never
  // archives — a version is only created the moment one body replaces another.
  useEffect(() => {
    let alive = true
    const prev = seenBodyRef.current
    seenBodyRef.current = { key: artifactKey, body: liveCode }
    if (prev && prev.key === artifactKey && prev.body && prev.body !== liveCode) {
      saveArtifactVersion({
        artifactKey,
        title,
        language,
        code: prev.body,
        note: 'replaced by a regenerated body',
      })
        .then(() => { if (alive) refreshVersions() })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [artifactKey, liveCode, title, language, refreshVersions])

  // (4) Pin state — persisted per conversation in settings when we know it,
  // in-memory ref otherwise (arena snippets have no conversation id).
  useEffect(() => {
    let alive = true
    getArtifactPinned(conversationId, artifactKey)
      .then(p => { if (alive) setPinned(!!p) })
      .catch(() => {})
    return () => { alive = false }
  }, [conversationId, artifactKey])

  const handlePin = () => {
    const next = !pinned
    setPinned(next)
    setArtifactPinned(conversationId, next, artifactKey).catch(() => {})
  }

  // Computed layout and structure metrics for verification
  const verificationStats = useMemo(() => {
    const raw = code || ''
    const isHtmlLike = ['html', 'svg', 'xml'].includes((language || '').toLowerCase())
    const lineCount = raw.split('\n').length
    const charCount = raw.length
    const hasStyles = /<style|style=|css/i.test(raw)
    const tagMatches = raw.match(/<([a-z0-9-]+)/gi) || []
    const elementCount = tagMatches.length
    return {
      isHtmlLike,
      lineCount,
      charCount,
      hasStyles,
      elementCount,
      estimatedViewport: viewportMode === 'mobile' ? '375 x 667 px' : viewportMode === 'tablet' ? '768 x 1024 px' : '100% responsive',
      status: elementCount > 0 || lineCount > 1 ? 'Valid Structure' : 'Minimal Content',
    }
  }, [code, language, viewportMode])

  if (!artifact) return null

  const { title: artifactTitle } = artifact

  const handleCopy = async () => {
    await copyToClipboard(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const lang = (language || '').toLowerCase()
    const ext = EXT_BY_LANGUAGE[lang] || 'txt'
    const type = ext === 'md'
      ? 'text/markdown;charset=utf-8'
      : ext === 'html' || ext === 'svg' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8'
    downloadBlob(new Blob([code], { type }), `${safeArtifactName(artifactTitle)}-${Date.now()}.${ext}`)
  }

  const handleOpenFullscreen = () => {
    const isHtml = ['html', 'svg', 'xml'].includes(language?.toLowerCase())
    const content = isHtml
      ? code
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${artifactTitle || 'Artifact'}</title><style>body{margin:0;padding:24px;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;}pre{background:#1e293b;padding:16px;border-radius:8px;overflow:auto;line-height:1.5;}</style></head><body><h2>${artifactTitle || 'Artifact'}</h2><pre>${code.replace(/</g, '&lt;')}</pre></body></html>`
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const handleBackToLive = () => {
    setSelectedId(null)
    setOverrideBody(null)
    seenBodyRef.current = { key: artifactKeyRef.current, body: liveCodeRef.current }
  }

  // Restoring never destroys: the LIVE body (the most recent work — not yet in
  // history, since it is only archived when it in turn gets replaced) is
  // archived first, then the restored body is written as its OWN new version.
  // The seen-body ref is patched so the next regeneration diffs against what
  // is on screen now.
  const handleRestore = async () => {
    if (!selection) return
    const key = artifactKeyRef.current
    try {
      if (liveCode && liveCode !== selection.code) {
        await saveArtifactVersion({ artifactKey: key, title, language, code: liveCode, note: 'auto-saved before restore' })
      }
      await saveArtifactVersion({
        artifactKey: key, title, language, code: selection.code,
        note: `restored from version #${selection.id}`,
      })
      seenBodyRef.current = { key, body: selection.code }
      setOverrideBody(selection.code)
      setSelectedId(null)
      setComparing(false)
    } finally {
      refreshVersions()
    }
  }

  const selectVersion = async (v) => {
    setSelectedId(v.id)
    setOverrideBody(null)
    setComparing(false)
    // Just-made-visible safety: a save may have landed between renders.
    await refreshVersions()
  }

  const renderPreview = () => {
    const lang = (language || '').toLowerCase()
    const iframeWidth = viewportMode === 'mobile' ? '375px' : viewportMode === 'tablet' ? '768px' : '100%'

    if (lang === 'html' || lang === 'svg' || lang === 'xml') {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          background: viewportMode === 'desktop' ? 'transparent' : 'rgba(0,0,0,0.3)',
          overflow: 'auto',
          padding: viewportMode === 'desktop' ? '0' : '16px 0',
        }}>
          <iframe
            key={reloadKey}
            title="HTML Artifact Preview"
            srcDoc={code}
            sandbox="allow-scripts allow-modals allow-forms"
            className="artifact-iframe"
            style={{
              width: iframeWidth,
              maxWidth: '100%',
              height: '100%',
              border: viewportMode === 'desktop' ? 'none' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: viewportMode === 'desktop' ? '0' : '8px',
              boxShadow: viewportMode === 'desktop' ? 'none' : '0 10px 25px rgba(0,0,0,0.5)',
              background: '#ffffff',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )
    }
    return (
      <div className="artifact-fallback-preview">
        <pre>{code}</pre>
      </div>
    )
  }

  // Side-by-side compare: diffPreview.js exports a DATA function, so the +/−
  // lines are rendered here with the panel's own CSS. Left = archived rows
  // (unchanged + deletions), right = live rows (unchanged + additions).
  const renderCompare = () => {
    // liveCode, NOT code: while a version is selected `code` IS the archived
    // body, and diffing it against itself yields only 'same' rows.
    const rows = lineDiff(selection.code, liveCode)
    const { added, removed } = summarizeDiff(rows)
    const shown = rows.slice(0, 400)
    const marker = (r) => (r.type === 'add' ? '+' : r.type === 'del' ? '-' : '')
    return (
      <div className="artifact-compare" data-testid="artifact-compare">
        <div className="artifact-compare-pane" aria-label={`Version ${selection.id} (archived)`}>
          <div className="artifact-compare-head">
            <span>Version {selection.id}</span>
            <span className="artifact-compare-tag">archived</span>
            <span className="artifact-compare-summary">-{removed}</span>
          </div>
          <pre className="artifact-diff-view">
            {shown.filter(r => r.type !== 'add').map((r, i) => (
              <span key={i} className={`diff-row ${r.type}`}>{marker(r)}{r.text}</span>
            ))}
          </pre>
        </div>
        <div className="artifact-compare-pane" aria-label="Current version (live)">
          <div className="artifact-compare-head">
            <span>Live</span>
            <span className="artifact-compare-tag">current</span>
            <span className="artifact-compare-summary">+{added}</span>
          </div>
          <pre className="artifact-diff-view">
            {shown.filter(r => r.type !== 'del').map((r, i) => (
              <span key={i} className={`diff-row ${r.type}`}>{marker(r)}{r.text}</span>
            ))}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="artifact-panel">
      <div className="artifact-header">
        <div className="artifact-title-group">
          <CodeIcon size={16} className="artifact-icon" />
          <span className="artifact-title">{artifactTitle || 'Code Artifact'}</span>
          <span className="artifact-lang-tag">{language}</span>
        </div>
        <div className="artifact-actions">
          {activeTab === 'preview' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', marginRight: '6px' }}>
              <button
                className={`artifact-btn ${viewportMode === 'desktop' ? 'active' : ''}`}
                onClick={() => setViewportMode('desktop')}
                title="Desktop View (100%)"
                aria-label="Desktop viewport"
                style={viewportMode === 'desktop' ? { background: 'rgba(255,255,255,0.15)', color: '#60a5fa' } : undefined}
              >
                <Monitor size={13} />
              </button>
              <button
                className={`artifact-btn ${viewportMode === 'tablet' ? 'active' : ''}`}
                onClick={() => setViewportMode('tablet')}
                title="Tablet View (768px)"
                aria-label="Tablet viewport"
                style={viewportMode === 'tablet' ? { background: 'rgba(255,255,255,0.15)', color: '#60a5fa' } : undefined}
              >
                <Tablet size={13} />
              </button>
              <button
                className={`artifact-btn ${viewportMode === 'mobile' ? 'active' : ''}`}
                onClick={() => setViewportMode('mobile')}
                title="Mobile View (375px)"
                aria-label="Mobile viewport"
                style={viewportMode === 'mobile' ? { background: 'rgba(255,255,255,0.15)', color: '#60a5fa' } : undefined}
              >
                <Smartphone size={13} />
              </button>
              <button
                className="artifact-btn"
                onClick={() => setReloadKey(k => k + 1)}
                title="Reload Preview"
                aria-label="Reload preview"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          )}
          <button
            className={`artifact-btn ${showVerify ? 'active' : ''}`}
            onClick={() => setShowVerify(v => !v)}
            title="Inspect & Verify Visual Layout (AI)"
            aria-label="Inspect layout"
            style={showVerify ? { background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa' } : undefined}
          >
            <Sparkles size={14} />
          </button>
          <button
            className="artifact-btn"
            onClick={handleOpenFullscreen}
            title="Open in new fullscreen tab"
            aria-label="Open fullscreen"
          >
            <ExternalLink size={14} />
          </button>
          <button
            className={`artifact-btn ${pinned ? 'active' : ''}`}
            onClick={handlePin}
            title={pinned ? 'Unpin artifact' : 'Pin artifact — survives panel switches'}
            aria-label={pinned ? 'Unpin artifact' : 'Pin artifact'}
            style={pinned ? { background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa' } : undefined}
          >
            {pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button className="artifact-btn" onClick={handleCopy} title="Copy code" aria-label="Copy code">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button className="artifact-btn" onClick={handleDownload} title="Download file" aria-label="Download file">
            <Download size={14} />
          </button>
          <button className="artifact-btn close" onClick={onClose} title="Close Canvas" aria-label="Close canvas">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="artifact-tabs">
        <button
          className={`artifact-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          <Eye size={14} /> Live Preview
        </button>
        <button
          className={`artifact-tab ${activeTab === 'code' ? 'active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          <CodeIcon size={14} /> Code Source
        </button>
      </div>

      {versions.length > 0 && (
        <div className="artifact-version-strip" aria-label="Artifact version history">
          <span className="artifact-version-label">
            <Clock3 size={11} /> History
          </span>
          <button
            className={`artifact-version-chip ${selection ? '' : 'active'}`}
            onClick={handleBackToLive}
            aria-label="Live version"
            title="Current body"
            type="button"
          >
            Live
          </button>
          {versions.map(v => (
            <button
              key={v.id}
              className={`artifact-version-chip ${v.id === selectedId ? 'active' : ''}`}
              onClick={() => selectVersion(v)}
              aria-label={`Version ${v.id}`}
              title={shortTime(v.createdAt)}
              type="button"
            >
              <span className="artifact-chip-time">{shortTime(v.createdAt)}</span>
              <span className="artifact-chip-diff">+{v.added ?? 0}/-{v.removed ?? 0}</span>
            </button>
          ))}
          {selection && (
            <span className="artifact-version-actions">
              <button
                className="artifact-btn artifact-action-btn"
                onClick={handleRestore}
                aria-label={`Restore version ${selection.id}`}
                title="Write this version back as the current body (appends a new version — nothing is destroyed)"
                type="button"
              >
                <RotateCcw size={12} /> Restore
              </button>
              <button
                className={`artifact-btn artifact-action-btn ${comparing ? 'active' : ''}`}
                onClick={() => setComparing(c => !c)}
                aria-label={`Compare version ${selection.id} with current`}
                title="Side-by-side diff against the current body"
                type="button"
                style={comparing ? { color: '#60a5fa' } : undefined}
              >
                <ArrowLeftRight size={12} /> Compare
              </button>
            </span>
          )}
        </div>
      )}

      {selection && !comparing && (
        <div className="artifact-version-note" role="note">
          Viewing archived version #{selection.id} — read-only. Restore writes it back as a new version.
        </div>
      )}

      {showVerify && (
        <div className="artifact-verification-bar" style={{
          padding: '10px 16px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#e2e8f0',
          flexWrap: 'wrap',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 600 }}>
              <CheckCheck size={14} /> {verificationStats.status}
            </span>
            <span style={{ color: '#94a3b8' }}>
              {verificationStats.elementCount} tags · {verificationStats.lineCount} lines · {verificationStats.hasStyles ? 'Custom CSS' : 'Default styles'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={async () => {
                const report = `Artifact Layout Report for "${artifactTitle || 'Code Artifact'}":\n- Status: ${verificationStats.status}\n- Elements: ${verificationStats.elementCount}\n- Lines: ${verificationStats.lineCount}\n- Viewport: ${verificationStats.estimatedViewport}`
                await copyToClipboard(report)
                setVerifyCopied(true)
                setTimeout(() => setVerifyCopied(false), 2000)
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#f8fafc',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {verifyCopied ? 'Copied Report' : 'Copy Report'}
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('yogatik:submit-prompt', {
                  detail: {
                    prompt: `Please review and enhance the layout, typography, and responsive styling of the artifact '${artifactTitle || 'Code Artifact'}'.`
                  }
                }))
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60a5fa',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Ask AI to Refine Layout
            </button>
          </div>
        </div>
      )}

      <div className="artifact-body">
        {comparing && selection ? renderCompare() : activeTab === 'preview' ? renderPreview() : (
          <pre className="artifact-code-view">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
