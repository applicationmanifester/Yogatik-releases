import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Loader2, Aperture, X, Copy, Check, MessageSquare, Braces, FileJson2 } from 'lucide-react'
import { announce } from './A11yAnnouncer'
import { JsonViewer, AIResponse, useFocusTrap, useInert, tokens } from '../design-system/components'
import '../styles/12-vision-modal-json.css'

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
  const modalRef = useRef(null)
  
  // Use shared focus trap hook
  useFocusTrap(modalRef, {
    active: isOpen,
    onEscape: onClose,
    initialFocus: 'first',
    returnFocus: true,
  })

  // Use shared inert hook for accessibility — excludeRef is read at effect
  // time (after the ref attaches); exclude:[modalRef.current] would capture
  // null during render and inert nothing.
  useInert(isOpen, {
    excludeRef: modalRef,
  })

  // Announce state changes for screen readers
  useEffect(() => {
    if (!isOpen) return
    if (visionLoading && !visionText) {
      announce('Analyzing image...')
    } else if (visionText && !visionLoading) {
      announce('Analysis complete')
    }
  }, [isOpen, visionLoading, visionText])

  // JSON detection and formatting
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
    <div className="vision-modal-overlay" ref={modalRef}>
      <div className="vision-modal">
        <div className="vision-modal-header">
          <h3>What am I looking at?</h3>
          {visionVia && <span className="vision-modal-via">via {visionVia}</span>}
          <button className="vision-modal-close" onClick={onClose} aria-label="Close vision modal">
            <X size={20} />
          </button>
        </div>
        <div className="vision-modal-body">
          {visionImage && (
            <div className="vision-modal-image">
              <img
                src={`data:image/jpeg;base64,${visionImage}`}
                alt={visionText
                  ? `Analysis: ${visionText.slice(0, 120)}${visionText.length > 120 ? '...' : ''}`
                  : 'Captured scene awaiting analysis'
                }
              />
              <button
                className={`vision-modal-retake ${retakeFlash ? 'flash' : ''}`}
                onClick={onRetake}
                disabled={visionLoading}
                aria-label="Retake photo"
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
              placeholder="Ask about this frame -- or leave blank to describe it"
              aria-label="Question about the current frame"
            />
            <button type="submit" className="btn" disabled={visionLoading} aria-label="Ask about this frame">
              {visionLoading ? <Loader2 size={14} className="spin" /> : 'Ask'}
            </button>
          </form>

          <div className="vision-modal-chips" role="group" aria-label="Quick actions">
            {[
              { label: 'Summarize Scene', q: 'Describe exactly what you see: setting, objects, people, and main details.' },
              { label: 'Extract Text (OCR)', q: 'Read all legible text visible in this frame word for word.' },
              { label: 'Explain Code', q: 'Analyze and explain any code or technical content visible on screen.' },
              { label: 'Identify Objects', q: 'List all major objects visible in this image with high accuracy.' },
              { label: 'Spot Issues', q: 'Identify any obvious errors, issues, or unusual elements in this image.' },
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
                <Loader2 size={16} className="spin" /> Looking...
              </div>
            )}
            {!visionLoading && visionText && isJson && parsedJson && (
              <JsonViewer
                data={parsedJson}
                title="JSON Response"
                collapsible={true}
                defaultExpanded={2}
              />
            )}
            {!visionLoading && visionText && !isJson && (
              <AIResponse content={visionText} />
            )}
            {visionLoading && visionText && <span className="vision-modal-cursor" />}
          </div>

          {visionText && !visionLoading && (
            <div className="vision-modal-actions">
              <button className="btn ghost" onClick={() => onCopyText(visionText)} aria-label={copiedIdx === -2 ? 'Copied' : 'Copy response'}>
                {copiedIdx === -2 ? <Check size={14} /> : <Copy size={14} />} Copy
              </button>
              <button className="btn ghost" onClick={onAskInCall} disabled={!visionQ.trim()} aria-label="Ask out loud">
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