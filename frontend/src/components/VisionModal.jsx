import React, { useEffect } from 'react'
import { Loader2, Aperture, X, Copy, Check, MessageSquare } from 'lucide-react'

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
              <img src={`data:image/jpeg;base64,${visionImage}`} alt="Captured scene" />
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

          <div className="vision-modal-text">
            {visionLoading && !visionText && (
              <div className="vision-modal-loading">
                <Loader2 size={16} className="spin" /> Looking…
              </div>
            )}
            {visionText && <p>{visionText}</p>}
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