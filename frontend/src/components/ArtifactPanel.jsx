import React, { useState, useMemo } from 'react'
import {
  Eye, Code as CodeIcon, X, Download, Copy, Check, ExternalLink, Sparkles, CheckCheck,
  Monitor, Tablet, Smartphone, RefreshCw,
} from 'lucide-react'

export function ArtifactPanel({ artifact, onClose }) {
  const [activeTab, setActiveTab] = useState('preview')
  const [copied, setCopied] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
  const [verifyCopied, setVerifyCopied] = useState(false)
  const [viewportMode, setViewportMode] = useState('desktop') // 'desktop' | 'tablet' | 'mobile'
  const [reloadKey, setReloadKey] = useState(0)

  const code = artifact?.code
  const language = artifact?.language

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

  const { title } = artifact

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const extMap = { html: 'html', svg: 'svg', javascript: 'js', python: 'py', css: 'css', json: 'json' }
    const ext = extMap[(language || '').toLowerCase()] || 'txt'
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `artifact-${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenFullscreen = () => {
    const isHtml = ['html', 'svg', 'xml'].includes(language?.toLowerCase())
    const content = isHtml
      ? code
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Artifact'}</title><style>body{margin:0;padding:24px;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;}pre{background:#1e293b;padding:16px;border-radius:8px;overflow:auto;line-height:1.5;}</style></head><body><h2>${title || 'Artifact'}</h2><pre>${code.replace(/</g, '&lt;')}</pre></body></html>`
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
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

  return (
    <div className="artifact-panel">
      <div className="artifact-header">
        <div className="artifact-title-group">
          <CodeIcon size={16} className="artifact-icon" />
          <span className="artifact-title">{title || 'Code Artifact'}</span>
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
              onClick={() => {
                const report = `Artifact Layout Report for "${title || 'Code Artifact'}":\n- Status: ${verificationStats.status}\n- Elements: ${verificationStats.elementCount}\n- Lines: ${verificationStats.lineCount}\n- Viewport: ${verificationStats.estimatedViewport}`
                navigator.clipboard.writeText(report)
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
                    prompt: `Please review and enhance the layout, typography, and responsive styling of the artifact '${title || 'Code Artifact'}'.`
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
        {activeTab === 'preview' ? renderPreview() : (
          <pre className="artifact-code-view">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
