import React, { useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-async'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Play, Eye, Download } from 'lucide-react'

export function CodeBlock({ children, className, onOpenArtifact }) {
  const [copied, setCopied] = useState(false)
  const lang = className?.replace('language-', '') || 'text'
  const code = String(children).replace(/\n$/, '')

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isPreviewable = ['html', 'svg', 'xml', 'javascript', 'jsx', 'css'].includes(lang.toLowerCase())

  const handleOpenArtifact = () => {
    if (onOpenArtifact) {
      onOpenArtifact({ title: `${lang.toUpperCase()} Snippet`, language: lang, code })
    }
  }

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-lang-badge">{lang}</span>
        <div className="code-block-actions">
          {isPreviewable && onOpenArtifact && (
            <button className="code-block-btn" onClick={handleOpenArtifact} title="Open in Canvas Sandbox">
              <Eye size={12} /> Canvas Preview
            </button>
          )}
          <button className="code-block-btn" onClick={copy} title="Copy code">
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>
      <SyntaxHighlighter style={oneDark} language={lang} PreTag="div" customStyle={{ margin: 0, borderRadius: '0 0 8px 8px' }}>
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
