import React, { useState, useEffect, useRef } from 'react'
import { X, Maximize2, Minimize2, Download, Copy, Check, Smartphone, Tablet, Monitor, RefreshCw } from 'lucide-react'

/**
 * Sandboxed Artifact Canvas for live HTML/CSS/JS, React widgets, SVG, and diagrams.
 */
export function ArtifactCanvas({
  isOpen,
  onClose,
  title = 'Artifact Preview',
  code = '',
  language = 'html',
}) {
  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'code'
  const [deviceMode, setDeviceMode] = useState('desktop') // 'desktop' | 'tablet' | 'mobile'
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef(null)

  const isHtml = /html|svg|xml/i.test(language) || code.includes('<html') || code.includes('<!DOCTYPE') || code.includes('<svg')

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const downloadFile = () => {
    const ext = isHtml ? (code.includes('<svg') ? 'svg' : 'html') : (language || 'txt')
    const blob = new Blob([code], { type: isHtml ? 'text/html' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `artifact_${Date.now()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const reloadIframe = () => {
    if (!iframeRef.current) return
    const iframe = iframeRef.current
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    let contentToRender = code
    if (code.includes('<svg') && !code.includes('<html')) {
      contentToRender = `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;">${code}</body></html>`
    }

    doc.open()
    doc.write(contentToRender)
    doc.close()
  }

  useEffect(() => {
    if (isOpen && activeTab === 'preview' && isHtml) {
      setTimeout(reloadIframe, 50)
    }
  }, [isOpen, activeTab, code, isHtml])

  if (!isOpen) return null

  const getDeviceWidth = () => {
    if (deviceMode === 'mobile') return '375px'
    if (deviceMode === 'tablet') return '768px'
    return '100%'
  }

  return (
    <div
      className={`artifact-canvas-container ${isFullscreen ? 'fullscreen' : ''}`}
      style={{
        position: 'fixed',
        top: isFullscreen ? 0 : '40px',
        right: isFullscreen ? 0 : '20px',
        bottom: isFullscreen ? 0 : '40px',
        width: isFullscreen ? '100vw' : 'min(720px, 90vw)',
        zIndex: 99999,
        background: '#12161f',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: isFullscreen ? '0' : '16px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 18px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#f3f4f6' }}>{title}</span>
          <span style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            padding: '2px 8px',
            borderRadius: '6px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            fontWeight: 700,
          }}>
            {language}
          </span>
        </div>

        {/* Action controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isHtml && (
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '8px',
              padding: '2px',
              marginRight: '8px',
            }}>
              <button
                onClick={() => setDeviceMode('mobile')}
                style={{
                  background: deviceMode === 'mobile' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  color: deviceMode === 'mobile' ? '#fff' : '#9ca3af',
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Mobile View"
              >
                <Smartphone size={13} />
              </button>
              <button
                onClick={() => setDeviceMode('tablet')}
                style={{
                  background: deviceMode === 'tablet' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  color: deviceMode === 'tablet' ? '#fff' : '#9ca3af',
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Tablet View"
              >
                <Tablet size={13} />
              </button>
              <button
                onClick={() => setDeviceMode('desktop')}
                style={{
                  background: deviceMode === 'desktop' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  color: deviceMode === 'desktop' ? '#fff' : '#9ca3af',
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Desktop View"
              >
                <Monitor size={13} />
              </button>
            </div>
          )}

          {isHtml && (
            <button
              onClick={reloadIframe}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
              title="Reload Preview"
            >
              <RefreshCw size={14} />
            </button>
          )}

          <button
            onClick={copyCode}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title="Copy Code"
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
          </button>

          <button
            onClick={downloadFile}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title="Download Artifact"
          >
            <Download size={14} />
          </button>

          <button
            onClick={() => setIsFullscreen(v => !v)}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div style={{
        flex: 1,
        background: '#090d14',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        overflow: 'hidden',
      }}>
        {isHtml ? (
          <div style={{
            width: getDeviceWidth(),
            height: '100%',
            transition: 'width 0.25s ease',
            boxShadow: deviceMode !== 'desktop' ? '0 0 32px rgba(0,0,0,0.8)' : 'none',
            background: '#ffffff',
          }}>
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              title="Live Preview"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#ffffff',
              }}
            />
          </div>
        ) : (
          <pre style={{
            margin: 0,
            padding: '16px',
            width: '100%',
            overflow: 'auto',
            color: '#e5e7eb',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}>
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
