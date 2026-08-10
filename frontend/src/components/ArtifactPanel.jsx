import React, { useState } from 'react'
import { Eye, Code as CodeIcon, X, Download, Copy, Check } from 'lucide-react'

export function ArtifactPanel({ artifact, onClose }) {
  const [activeTab, setActiveTab] = useState('preview')
  const [copied, setCopied] = useState(false)

  if (!artifact) return null

  const { title, language, code } = artifact

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const extMap = { html: 'html', svg: 'svg', javascript: 'js', python: 'py', css: 'css', json: 'json' }
    const ext = extMap[language.toLowerCase()] || 'txt'
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `artifact-${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderPreview = () => {
    const lang = language.toLowerCase()
    if (lang === 'html' || lang === 'svg' || lang === 'xml') {
      return (
        <iframe
          title="HTML Artifact Preview"
          srcDoc={code}
          sandbox="allow-scripts"
          className="artifact-iframe"
        />
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
