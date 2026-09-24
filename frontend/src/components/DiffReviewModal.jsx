import React, { useState, useMemo } from 'react'
import {
  GitCommit, Check, X, Copy, FileText, ArrowRight, CheckCheck,
  SplitSquareVertical, Layers
} from 'lucide-react'
import { Modal } from './Modal'
import { lineDiff, summarizeDiff } from '../diffPreview'

/**
 * Cursor-style Visual Diff Review Modal.
 * Displays line-by-line additions and deletions with 1-click Accept / Reject.
 */
export function DiffReviewModal({
  isOpen,
  onClose,
  filePath = 'Proposed Changes',
  originalCode = '',
  modifiedCode = '',
  onAccept,
}) {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState('unified') // 'unified' | 'split'
  const [applying, setApplying] = useState(false)

  // Compute diff rows
  const diffRows = useMemo(() => {
    return lineDiff(originalCode, modifiedCode)
  }, [originalCode, modifiedCode])

  const stats = useMemo(() => {
    return summarizeDiff(diffRows)
  }, [diffRows])

  if (!isOpen) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(modifiedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAccept = async () => {
    setApplying(true)
    try {
      if (onAccept) {
        await onAccept(modifiedCode, filePath)
      }
      onClose?.()
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitCommit size={18} style={{ color: '#38bdf8' }} />
          <span>Review Diff — {filePath}</span>
        </div>
      }
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="diff-stat-badge add">+{stats.added}</span>
            <span className="diff-stat-badge del">-{stats.removed}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginLeft: 4 }}>
              {diffRows.length} lines compared
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="small-btn"
              onClick={handleCopy}
              title="Copy modified code to clipboard"
            >
              {copied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
            <button
              type="button"
              className="small-btn"
              onClick={onClose}
            >
              Reject
            </button>
            <button
              type="button"
              className="small-btn btn-primary"
              onClick={handleAccept}
              disabled={applying}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
              }}
            >
              <CheckCheck size={14} />
              <span>{applying ? 'Applying…' : 'Accept & Apply'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="diff-viewer-container">
        <div className="diff-rows-scroll">
          {diffRows.map((row, idx) => (
            <div
              key={idx}
              className={`diff-row-line ${row.type}`}
            >
              <span className="diff-line-num">{idx + 1}</span>
              <span className="diff-line-prefix">
                {row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}
              </span>
              <span className="diff-line-text">{row.text || '\u00A0'}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
