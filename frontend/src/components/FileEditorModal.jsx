import React, { useState, useEffect } from 'react'
import { FileCode, Save, X, Eye, FileText, Check, AlertCircle, RefreshCw } from 'lucide-react'
import { fsWriteTool, fsReadTool, fsFileInfoTool, isDesktop } from '../tools/localFs'

/**
 * FileEditorModal: Interactive in-app AI file creator, editor, and patch modifier.
 * Allows users and AI agents to create new files, edit existing source code, preview diffs,
 * and save directly to the local workspace in the desktop app.
 */
export function FileEditorModal({ filePath = '', initialContent = '', isOpen, onClose, onSave }) {
  const [path, setPath] = useState(filePath)
  const [content, setContent] = useState(initialContent)
  const [originalContent, setOriginalContent] = useState(initialContent)
  const [mode, setMode] = useState('edit') // 'edit' | 'diff'
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  useEffect(() => {
    setPath(filePath)
    setContent(initialContent)
    setOriginalContent(initialContent)
  }, [filePath, initialContent])

  // Load content from disk if path exists and content is empty
  useEffect(() => {
    if (isOpen && path && !initialContent && isDesktop()) {
      setLoading(true)
      fsReadTool.execute({ path })
        .then(res => {
          if (res.success && res.content) {
            setContent(res.content)
            setOriginalContent(res.content)
          }
        })
        .finally(() => setLoading(false))
    }
  }, [isOpen, path, initialContent])

  if (!isOpen) return null

  const lineCount = content.split('\n').length
  const charCount = content.length
  const hasChanges = content !== originalContent
  const ext = path.includes('.') ? path.split('.').pop().toLowerCase() : 'txt'

  const handleSave = async () => {
    if (!path.trim()) {
      setStatusMsg({ type: 'error', text: 'Please specify a file path.' })
      return
    }
    setLoading(true)
    try {
      const res = await fsWriteTool.execute({ path: path.trim(), content })
      if (res.success) {
        setOriginalContent(content)
        setStatusMsg({ type: 'success', text: `Saved to ${path}` })
        if (onSave) onSave(path, content)
        setTimeout(() => setStatusMsg(null), 3000)
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'Failed to save file.' })
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // modal-overlay is the app's own fixed, centred backdrop. `modal-backdrop`
  // was never defined in styles.css, so the editor rendered inline in the
  // document flow instead of over the app.
  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="modal-card file-editor-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '90vw',
          maxWidth: '960px',
          height: '85vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#12151c',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#161a23',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <FileCode size={18} color="#38bdf8" />
            <input
              type="text"
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="e.g. src/components/MyComponent.jsx"
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#f1f5f9',
                fontSize: '13px',
                fontFamily: 'monospace',
                width: '60%',
                minWidth: '220px',
              }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '4px' }}>
              .{ext}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '2px' }}>
              <button
                className={`tab-btn ${mode === 'edit' ? 'active' : ''}`}
                onClick={() => setMode('edit')}
                style={{
                  background: mode === 'edit' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: mode === 'edit' ? '#38bdf8' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <FileText size={13} /> Edit
              </button>
              <button
                className={`tab-btn ${mode === 'diff' ? 'active' : ''}`}
                onClick={() => setMode('diff')}
                style={{
                  background: mode === 'diff' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  color: mode === 'diff' ? '#38bdf8' : '#94a3b8',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Eye size={13} /> Diff {hasChanges && '●'}
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: hasChanges ? '#0284c7' : 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Save size={14} /> Save (Ctrl+S)
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Alert Bar */}
        {statusMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 18px',
            fontSize: '12px',
            backgroundColor: statusMsg.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: statusMsg.type === 'error' ? '#f87171' : '#34d399',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          }}>
            {statusMsg.type === 'error' ? <AlertCircle size={14} /> : <Check size={14} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Main Editor Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>
          {loading && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
              zIndex: 10,
            }}>
              <RefreshCw className="spin" size={24} color="#38bdf8" />
            </div>
          )}

          {mode === 'edit' ? (
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              {/* Line Numbers */}
              <div style={{
                width: '45px',
                padding: '12px 6px',
                textAlign: 'right',
                color: '#475569',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.5',
                userSelect: 'none',
                background: '#0e1117',
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                overflowY: 'hidden',
              }}>
                {Array.from({ length: lineCount }).map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write or paste your code here..."
                spellCheck={false}
                style={{
                  flex: 1,
                  height: '100%',
                  padding: '12px 14px',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: '#e2e8f0',
                  backgroundColor: '#12151c',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  whiteSpace: 'pre',
                  overflowWrap: 'normal',
                  overflowX: 'auto',
                }}
              />
            </div>
          ) : (
            /* Diff View */
            <div style={{ width: '100%', height: '100%', padding: '16px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6' }}>
              <div style={{ marginBottom: '10px', color: '#94a3b8' }}>
                Comparing with original ({hasChanges ? 'Modifications detected' : 'No changes'}):
              </div>
              <div style={{ background: '#0a0d14', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                {content.split('\n').map((line, i) => {
                  const origLine = (originalContent.split('\n') || [])[i]
                  const isDiff = origLine !== line
                  return (
                    <div
                      key={i}
                      style={{
                        backgroundColor: isDiff ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                        color: isDiff ? '#7dd3fc' : '#94a3b8',
                        padding: '1px 4px',
                      }}
                    >
                      <span style={{ color: '#475569', marginRight: '10px', display: 'inline-block', width: '30px' }}>{i + 1}</span>
                      {line || ' '}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Statistics */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#161a23',
          fontSize: '11px',
          color: '#64748b',
        }}>
          <div>
            Lines: <strong style={{ color: '#cbd5e1' }}>{lineCount}</strong> · Characters: <strong style={{ color: '#cbd5e1' }}>{charCount}</strong> · Status: <span style={{ color: hasChanges ? '#fbbf24' : '#10b981' }}>{hasChanges ? 'Unsaved edits' : 'Synced'}</span>
          </div>
          <div>
            UTF-8 · Yogatik Desktop Workspace File Modifier
          </div>
        </div>
      </div>
    </div>
  )
}
