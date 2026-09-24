import React, { useState, useEffect, useRef } from 'react'
import {
  X, Maximize2, Minimize2, Download, Copy, Check, Smartphone,
  Tablet, Monitor, RefreshCw, Code2, Eye, Layout, SplitSquareVertical,
  Play, Sparkles, MessageSquare, Edit3, BarChart3
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DataChartSandbox } from './DataChartSandbox'

/**
 * Sandboxed Interactive Artifact Canvas & Split-View Co-Editor.
 * Modern workspace for live HTML/CSS/JS, React widgets, SVGs, documents, and diagrams.
 */
export function ArtifactCanvas({
  isOpen,
  onClose,
  title = 'Artifact Canvas',
  code = '',
  language = 'html',
  onAskAiToEdit,
}) {
  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'code'
  const [deviceMode, setDeviceMode] = useState('desktop') // 'desktop' | 'tablet' | 'mobile'
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState('drawer') // 'drawer' | 'docked' | 'fullscreen'
  const [editableCode, setEditableCode] = useState(code)
  const iframeRef = useRef(null)

  // Sync incoming code changes unless actively modified
  useEffect(() => {
    setEditableCode(code)
  }, [code])

  const isHtml = /html|svg|xml|javascript|jsx/i.test(language) ||
    editableCode.includes('<html') ||
    editableCode.includes('<!DOCTYPE') ||
    editableCode.includes('<svg')

  const isMarkdown = /markdown|md/i.test(language)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(editableCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const downloadFile = () => {
    const ext = isHtml
      ? (editableCode.includes('<svg') ? 'svg' : 'html')
      : (language || 'txt')
    const blob = new Blob([editableCode], { type: isHtml ? 'text/html' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.${ext}`
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

    let contentToRender = editableCode
    if (editableCode.includes('<svg') && !editableCode.includes('<html')) {
      contentToRender = `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1117;">${editableCode}</body></html>`
    }

    doc.open()
    doc.write(contentToRender)
    doc.close()
  }

  useEffect(() => {
    if (isOpen && activeTab === 'preview' && isHtml) {
      const timer = setTimeout(reloadIframe, 60)
      return () => clearTimeout(timer)
    }
  }, [isOpen, activeTab, editableCode, isHtml])

  if (!isOpen) return null

  const getDeviceWidth = () => {
    if (deviceMode === 'mobile') return '375px'
    if (deviceMode === 'tablet') return '768px'
    return '100%'
  }

  const handleAskEdit = () => {
    if (onAskAiToEdit) {
      onAskAiToEdit(`Regarding artifact "${title}" (${language}):\n\n`)
    }
  }

  return (
    <div
      className={`artifact-canvas-container mode-${viewMode}`}
      style={{
        position: 'fixed',
        top: viewMode === 'fullscreen' ? 0 : '20px',
        right: viewMode === 'fullscreen' ? 0 : '20px',
        bottom: viewMode === 'fullscreen' ? 0 : '20px',
        width: viewMode === 'fullscreen' ? '100vw' : viewMode === 'docked' ? '50vw' : 'min(760px, 92vw)',
        zIndex: 99999,
        background: '#0d111a',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: viewMode === 'fullscreen' ? '0' : '16px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Canvas Top Bar */}
      <div style={{
        padding: '10px 16px',
        background: 'rgba(15, 23, 42, 0.75)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'rgba(6, 182, 212, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#06b6d4',
          }}>
            <Code2 size={16} />
          </div>
          <div>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#f3f4f6' }}>{title}</span>
            <span style={{
              marginLeft: '8px',
              fontSize: '10px',
              textTransform: 'uppercase',
              padding: '2px 7px',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              fontWeight: 700,
            }}>
              {language}
            </span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '2px',
        }}>
          <button
            onClick={() => setActiveTab('preview')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: activeTab === 'preview' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              color: activeTab === 'preview' ? '#fff' : '#9ca3af',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Eye size={12} /> Preview
          </button>
          <button
            onClick={() => setActiveTab('code')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: activeTab === 'code' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              color: activeTab === 'code' ? '#fff' : '#9ca3af',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Edit3 size={12} /> Edit Code
          </button>
          <button
            onClick={() => setActiveTab('chart')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: activeTab === 'chart' ? 'rgba(6,182,212,0.2)' : 'transparent',
              border: 'none',
              color: activeTab === 'chart' ? '#22d3ee' : '#9ca3af',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <BarChart3 size={12} /> Chart
          </button>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isHtml && activeTab === 'preview' && (
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '8px',
              padding: '2px',
              marginRight: '4px',
            }}>
              <button
                onClick={() => setDeviceMode('mobile')}
                style={{
                  background: deviceMode === 'mobile' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: 'none',
                  color: deviceMode === 'mobile' ? '#fff' : '#9ca3af',
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Mobile (375px)"
              >
                <Smartphone size={13} />
              </button>
              <button
                onClick={() => setDeviceMode('tablet')}
                style={{
                  background: deviceMode === 'tablet' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: 'none',
                  color: deviceMode === 'tablet' ? '#fff' : '#9ca3af',
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Tablet (768px)"
              >
                <Tablet size={13} />
              </button>
              <button
                onClick={() => setDeviceMode('desktop')}
                style={{
                  background: deviceMode === 'desktop' ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: 'none',
                  color: deviceMode === 'desktop' ? '#fff' : '#9ca3af',
                  padding: '5px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                title="Desktop"
              >
                <Monitor size={13} />
              </button>
            </div>
          )}

          {isHtml && (
            <button
              onClick={reloadIframe}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
              title="Reload sandbox"
            >
              <RefreshCw size={14} />
            </button>
          )}

          <button
            onClick={copyCode}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title="Copy code to clipboard"
          >
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
          </button>

          <button
            onClick={downloadFile}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title="Download file"
          >
            <Download size={14} />
          </button>

          {/* Dock / Split View Toggle */}
          <button
            onClick={() => setViewMode(m => m === 'docked' ? 'drawer' : 'docked')}
            style={{
              background: viewMode === 'docked' ? 'rgba(6,182,212,0.15)' : 'transparent',
              border: 'none',
              color: viewMode === 'docked' ? '#06b6d4' : '#9ca3af',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '6px',
            }}
            title={viewMode === 'docked' ? 'Float Canvas' : 'Dock Side-by-Side'}
          >
            <SplitSquareVertical size={14} />
          </button>

          <button
            onClick={() => setViewMode(m => m === 'fullscreen' ? 'drawer' : 'fullscreen')}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title={viewMode === 'fullscreen' ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {viewMode === 'fullscreen' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '5px' }}
            title="Close Canvas"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div style={{
        flex: 1,
        background: '#090d14',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'stretch',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {activeTab === 'chart' ? (
          <div style={{ height: '100%', width: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DataChartSandbox rawData={editableCode} />
          </div>
        ) : activeTab === 'preview' ? (
          isHtml ? (
            <div style={{
              width: getDeviceWidth(),
              height: '100%',
              margin: '0 auto',
              transition: 'width 0.25s ease',
              boxShadow: deviceMode !== 'desktop' ? '0 0 32px rgba(0,0,0,0.8)' : 'none',
              background: '#ffffff',
            }}>
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                title="Live Sandbox Preview"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#ffffff',
                }}
              />
            </div>
          ) : isMarkdown ? (
            <div style={{
              padding: '24px 32px',
              height: '100%',
              overflow: 'auto',
              color: '#e2e8f0',
              lineHeight: 1.6,
            }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{editableCode}</ReactMarkdown>
            </div>
          ) : (
            <pre style={{
              margin: 0,
              padding: '16px',
              width: '100%',
              height: '100%',
              overflow: 'auto',
              color: '#e5e7eb',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}>
              <code>{editableCode}</code>
            </pre>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <textarea
              value={editableCode}
              onChange={e => setEditableCode(e.target.value)}
              style={{
                flex: 1,
                width: '100%',
                background: '#0a0e17',
                color: '#f8fafc',
                border: 'none',
                padding: '16px',
                fontFamily: "'JetBrains Mono', Consolas, monospace",
                fontSize: '12.5px',
                lineHeight: 1.6,
                outline: 'none',
                resize: 'none',
              }}
              placeholder="Edit code directly here..."
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Canvas Footer Bar */}
      <div style={{
        padding: '8px 16px',
        background: 'rgba(15, 23, 42, 0.6)',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: '#94a3b8',
      }}>
        <span>Interactive Canvas • Direct edits update preview</span>
        {onAskAiToEdit && (
          <button
            onClick={handleAskEdit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              color: '#22d3ee',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Sparkles size={11} /> Prompt AI to Edit
          </button>
        )}
      </div>
    </div>
  )
}
