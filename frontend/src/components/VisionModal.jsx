import React, { useEffect, useState, useMemo } from 'react'
import { Loader2, Aperture, X, Copy, Check, MessageSquare, Braces, FileJson2, ChevronRight, ChevronDown } from 'lucide-react'
import { announce } from './A11yAnnouncer'
import '../styles/12-vision-modal-json.css'

/**
 * JSON Tree Viewer Component - Renders JSON as an interactive collapsible tree
 */
function JsonTree({ data, level = 0, keyName = '' }) {
  const isObject = data !== null && typeof data === 'object' && !Array.isArray(data)
  const isArray = Array.isArray(data)
  const isPrimitive = data === null || (typeof data !== 'object' && typeof data !== 'function')
  
  const [expanded, setExpanded] = useState(level < 2) // Auto-expand first 2 levels

  const toggleExpanded = () => setExpanded(!expanded)

  if (isPrimitive) {
    let displayValue = data
    if (data === null) displayValue = 'null'
    else if (typeof data === 'string') displayValue = `"${data}"`
    else if (typeof data === 'boolean') displayValue = data.toString()
    else if (typeof data === 'number') displayValue = data.toString()
    
    return (
      <span className="json-primitive" style={{ color: typeof data === 'string' ? '#10b981' : typeof data === 'number' ? '#f59e0b' : typeof data === 'boolean' ? '#8b5cf6' : '#6b7280' }}>
        {displayValue}
      </span>
    )
  }

  const entries = isObject ? Object.entries(data) : data.map((v, i) => [i, v])
  
  return (
    <div className="json-node" style={{ marginLeft: `${level * 16}px` }}>
      {(isObject || isArray) && level > 0 && (
        <span className="json-toggle" onClick={toggleExpanded} style={{ cursor: 'pointer', marginRight: '8px', userSelect: 'none' }}>
          <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }} />
        </span>
      )}
      <span className="json-bracket" style={{ color: '#94a3b8' }}>
        {isObject ? '{' : '['}
      </span>
      {expanded && entries.length > 0 && (
        <div className="json-children">
          {entries.map(([key, value], index) => (
            <div key={`${level}-${key}-${index}`} className="json-entry">
              <span className="json-key" style={{ color: '#8b5cf6', marginRight: '8px' }}>
                {isObject ? `"${key}":` : ''}
              </span>
              <JsonTree data={value} level={level + 1} keyName={key} />
              {index < entries.length - 1 && <span className="json-comma" style={{ color: '#94a3b8' }}> ,</span>}
            </div>
          ))}
        </div>
      )}
      {expanded && entries.length === 0 && (
        <span style={{ color: '#94a3b8', padding: '0 8px' }}>{isObject ? '}' : ']'}</span>
      )}
      {!expanded && (
        <>
          <span className="json-preview" style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '12px' }}>
            {isObject ? `... {${entries.length} keys}` : `... [${entries.length} items]`}
          </span>
          <span className="json-bracket" style={{ color: '#94a3b8', marginLeft: '4px' }}>
            {isObject ? '}' : ']'}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * Vision Modal - Analyze camera/screen frames with AI vision
 * Can be used both in Live mode and regular chat
 */
export function VisionModal({
  isOpen,
  onClose,
  visionImage,
  visionText,
  visionLoading,
  visionQ,
  visionVia,
  retakeFlash,
  modelCanSee,
  provider,
  model,
  captureFrame,
  onRetake,
  onAskVision,
  onSetVisionQ,
  onAskInCall,
  onCopyText,
  copiedIdx,
  features,
}) {
  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAskVision(visionQ) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, visionQ, onClose, onAskVision])

  // Announce state changes for screen readers
  useEffect(() => {
    if (!isOpen) return
    if (visionLoading && !visionText) {
      announce('Analyzing image…')
    } else if (visionText && !visionLoading) {
      announce('Analysis complete')
    }
  }, [isOpen, visionLoading, visionText])

  // JSON detection and formatting
  const [viewMode, setViewMode] = useState('formatted') // 'formatted' | 'raw'
  
  const isJson = useMemo(() => {
    if (!visionText || typeof visionText !== 'string') return false
    try {
      JSON.parse(visionText)
      return true
    } catch {
      return false
    }
  }, [visionText])

  const parsedJson = useMemo(() => {
    if (!isJson) return null
    try {
      return JSON.parse(visionText)
    } catch {
      return null
    }
  }, [visionText])

  if (!isOpen) return null

  return (
    <div className="vision-modal-overlay">
      <div className="vision-modal">
        <div className="vision-modal-header">
          <h3>What am I looking at?</h3>
          {visionVia && <span className="vision-modal-via">via {visionVia}</span>}
          <button className="vision-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="vision-modal-body">
          {visionImage && (
            <div className="vision-modal-image">
              <img
                src={`data:image/jpeg;base64,${visionImage}`}
                alt={visionText
                  ? `Analysis: ${visionText.slice(0, 120)}${visionText.length > 120 ? '…' : ''}`
                  : 'Captured scene awaiting analysis'
                }
              />
              <button
                className={`vision-modal-retake ${retakeFlash ? 'flash' : ''}`}
                onClick={onRetake}
                disabled={visionLoading}
              >
                <Aperture size={14} /> Retake
              </button>
            </div>
          )}

          <form
            className="vision-modal-ask"
            onSubmit={(e) => { e.preventDefault(); onAskVision(visionQ) }}
          >
            <input
              autoFocus
              value={visionQ}
              onChange={(e) => onSetVisionQ(e.target.value)}
              placeholder="Ask about this frame — or leave blank to describe it"
              aria-label="Question about the current frame"
            />
            <button type="submit" className="btn" disabled={visionLoading} aria-label="Ask about this frame">
              {visionLoading ? <Loader2 size={14} className="spin" /> : 'Ask'}
            </button>
          </form>

          <div className="vision-modal-chips">
            {[
              { label: '🔍 Summarize Scene', q: 'Describe exactly what you see: setting, objects, people, and main details.' },
              { label: '📝 Extract Text (OCR)', q: 'Read all legible text visible in this frame word for word.' },
              { label: '💻 Explain Code', q: 'Analyze and explain any code or technical content visible on screen.' },
              { label: '🎯 Identify Objects', q: 'List all major objects visible in this image with high accuracy.' },
              { label: '⚡ Spot Issues', q: 'Identify any obvious errors, issues, or unusual elements in this image.' },
            ].map(chip => (
              <button
                key={chip.label}
                className="vision-chip"
                disabled={visionLoading}
                onClick={() => onAskVision(chip.q)}
              >{chip.label}</button>
            ))}
          </div>

          <div className="vision-modal-text" aria-live="polite" aria-atomic="false">
            {visionLoading && !visionText && (
              <div className="vision-modal-loading">
                <Loader2 size={16} className="spin" /> Looking…
              </div>
            )}
            {!visionLoading && visionText && isJson && parsedJson && (
              <div className="vision-modal-json-viewer">
                <div className="json-viewer-header">
                  <span className="json-viewer-title">
                    <FileJson2 size={14} /> JSON Response
                  </span>
                  <button
                    className={`json-view-toggle ${viewMode === 'raw' ? 'active' : ''}`}
                    onClick={() => setViewMode(viewMode === 'formatted' ? 'raw' : 'formatted')}
                    title={viewMode === 'formatted' ? 'View raw JSON' : 'View formatted'}
                  >
                    {viewMode === 'formatted' ? <Braces size={14} /> : <FileJson2 size={14} />}
                    <span>{viewMode === 'formatted' ? 'Formatted' : 'Raw'}</span>
                  </button>
                </div>
                {viewMode === 'formatted' ? (
                  <JsonTree data={parsedJson} />
                ) : (
                  <pre className="json-raw-view"><code>{visionText}</code></pre>
                )}
              </div>
            )}
            {!visionLoading && visionText && !isJson && <p>{visionText}</p>}
            {visionLoading && visionText && <span className="vision-modal-cursor" />}
          </div>

          {visionText && !visionLoading && (
            <div className="vision-modal-actions">
              <button className="btn ghost" onClick={() => onCopyText(visionText)}>
                {copiedIdx === -2 ? <Check size={14} /> : <Copy size={14} />} Copy
              </button>
              <button className="btn ghost" onClick={onAskInCall} disabled={!visionQ.trim()}>
                <MessageSquare size={14} /> Ask out loud
              </button>
            </div>
          )}

          <p className="vision-modal-hint">Press <kbd>Enter</kbd> to ask, <kbd>Esc</kbd> to close</p>
        </div>
      </div>
    </div>
  )
}

export default VisionModal