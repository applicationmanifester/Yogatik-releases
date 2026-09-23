import React, { useState, useRef } from 'react'
import {
  FileText, Trash2, Eye, Upload, X, Folder, Download,
  ExternalLink, HardDrive, Database, Sparkles, RefreshCw,
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Copy, Check
} from 'lucide-react'
import { Modal } from './Modal'
import { formatBytes } from '../storage'
import { isDesktop } from '../tools/localFs'

/**
 * RagDocumentsModal — Local RAG Knowledge & Indexed Documents Manager.
 * Allows users to inspect saved locations, preview extracted passages/chunks,
 * delete individual or all documents, and add new documents to the active index.
 */
export function RagDocumentsModal({
  docs = [],
  activeProject = null,
  onClose,
  onDeleteDoc,
  onClearAllDocs,
  onUploadDoc,
  onToast = () => {},
}) {
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')
  const fileInputRef = useRef(null)

  const projectName = activeProject?.name || 'Default Workspace'
  const totalChars = docs.reduce((acc, d) => acc + (d.chars || (d.chunks || []).reduce((cAcc, c) => cAcc + (c?.length || 0), 0)), 0)
  const totalChunks = docs.reduce((acc, d) => acc + (d.chunks?.length || 0), 0)

  const filteredDocs = docs.filter(d => {
    if (!filterQuery.trim()) return true
    const q = filterQuery.toLowerCase()
    return (d.name || '').toLowerCase().includes(q)
  })

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      if (onUploadDoc) {
        await onUploadDoc(file)
        onToast(`Indexed ${file.name} for RAG search`)
      }
    } catch (err) {
      onToast(`Failed to upload ${file.name}: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e, doc) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${doc.name}" from the active RAG index? This will remove its indexed passages.`)) return
    try {
      if (onDeleteDoc) {
        await onDeleteDoc(doc.id)
        if (selectedDoc?.id === doc.id) setSelectedDoc(null)
        onToast(`Deleted "${doc.name}" from RAG index`)
      }
    } catch (err) {
      onToast(`Failed to delete document: ${err.message}`)
    }
  }

  const handleClearAll = async () => {
    if (!docs.length) return
    if (!window.confirm(`Are you sure you want to delete all ${docs.length} documents from the RAG index for "${projectName}"?`)) return
    try {
      if (onClearAllDocs) {
        await onClearAllDocs()
        setSelectedDoc(null)
        onToast('Cleared all RAG documents')
      }
    } catch (err) {
      onToast(`Failed to clear RAG index: ${err.message}`)
    }
  }

  const handleExportText = (e, doc) => {
    e.stopPropagation()
    const content = (doc.chunks || []).join('\n\n--- Passage Break ---\n\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name || 'document'}-rag-passages.txt`
    a.click()
    URL.revokeObjectURL(url)
    onToast(`Exported ${doc.name} passages`)
  }

  const handleCopyPassage = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(idx)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const handleOpenStorageFolder = () => {
    try {
      if (window.__YOGATIK_DESKTOP__?.showItemInFolder) {
        window.__YOGATIK_DESKTOP__.showItemInFolder('')
      } else {
        onToast('Saved locally in browser IndexedDB (db.documents)')
      }
    } catch {
      onToast('Saved locally in browser IndexedDB (db.documents)')
    }
  }

  return (
    <Modal
      title="Local RAG Knowledge &amp; Document Index"
      icon={<FileText size={18} style={{ color: '#22c55e' }} />}
      onClose={onClose}
      className="rag-docs-modal"
    >
      <div style={{ padding: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Storage Location & Scope Card */}
        <div style={{
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                Storage Location &amp; Scope
              </span>
            </div>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              fontWeight: 600
            }}>
              Project: {projectName}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.5 }}>
            Indexed documents are stored securely in <strong>Client IndexedDB (<code style={{ color: '#38bdf8' }}>db.documents</code>)</strong> on this device.
            Passages are split with BM25 &amp; semantic embeddings for zero-cloud, high-precision retrieval during queries.
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <span>📑 <strong>{docs.length}</strong> {docs.length === 1 ? 'file' : 'files'}</span>
              <span>🧩 <strong>{totalChunks.toLocaleString()}</strong> passages</span>
              <span>🔤 <strong>{totalChars.toLocaleString()}</strong> characters</span>
            </div>

            {isDesktop && (
              <button
                type="button"
                className="small-btn"
                onClick={handleOpenStorageFolder}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  fontSize: '11.5px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <Folder size={12} /> Show Location
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: Filter, Upload & Clear */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search indexed files…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: '180px',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '8px',
              background: 'var(--bg-input, rgba(0, 0, 0, 0.2))',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              color: 'var(--text-primary, #fff)',
              outline: 'none'
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="file"
              ref={fileInputRef}
              hidden
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.txt,.md,.json,.xml,.yaml,.yml,.toml,.ini,.env,.sql,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.php,.rb,.sh,.html,.css,*/*"
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="small-btn btn-primary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                background: 'var(--accent, #ff6b35)',
                color: '#fff',
                border: 'none'
              }}
            >
              <Upload size={13} /> {uploading ? 'Indexing…' : 'Add Document'}
            </button>

            {docs.length > 0 && (
              <button
                type="button"
                className="small-btn"
                onClick={handleClearAll}
                title="Clear all documents from RAG index"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={13} /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* Selected Document Passage Inspector */}
        {selectedDoc && (
          <div style={{
            background: 'var(--bg-secondary, rgba(0, 0, 0, 0.25))',
            border: '1px solid var(--accent, #ff6b35)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Eye size={16} style={{ color: 'var(--accent, #ff6b35)', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Viewing Passages: {selectedDoc.name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', flexShrink: 0 }}>
                  ({(selectedDoc.chunks || []).length} passages)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="icon-btn"
                  title="Export passages as text file"
                  onClick={(e) => handleExportText(e, selectedDoc)}
                  style={{ padding: '4px', color: 'var(--text-secondary)' }}
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Close passage preview"
                  onClick={() => setSelectedDoc(null)}
                  style={{ padding: '4px', color: 'var(--text-secondary)' }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px'
            }}>
              {(selectedDoc.chunks || []).length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '8px' }}>
                  No passage chunks generated for this file (inline or small document).
                </div>
              ) : (
                (selectedDoc.chunks || []).map((chunk, cIdx) => (
                  <div
                    key={cIdx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '11.5px',
                      lineHeight: 1.5,
                      color: 'var(--text-primary, #e2e8f0)',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#38bdf8' }}>
                        Passage #{cIdx + 1} · {chunk.length} characters
                      </span>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Copy passage to clipboard"
                        onClick={() => handleCopyPassage(chunk, `${selectedDoc.id}-${cIdx}`)}
                        style={{ padding: '2px', color: copiedId === `${selectedDoc.id}-${cIdx}` ? '#22c55e' : 'var(--text-secondary)' }}
                      >
                        {copiedId === `${selectedDoc.id}-${cIdx}` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <pre style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'inherit',
                      maxHeight: '140px',
                      overflowY: 'auto'
                    }}>
                      {chunk}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Documents Table / List */}
        <div style={{
          maxHeight: '360px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {filteredDocs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 16px',
              background: 'var(--bg-secondary, rgba(255, 255, 255, 0.02))',
              border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))',
              borderRadius: '12px',
              color: 'var(--text-secondary, #94a3b8)'
            }}>
              <FileText size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                {filterQuery ? 'No matching documents found' : 'No documents indexed in this project yet'}
              </div>
              <div style={{ fontSize: '11.5px', marginTop: '4px', maxWidth: '380px', margin: '4px auto 14px' }}>
                Upload PDFs, markdown, code, spreadsheets, or text files. The agent searches and cites their passages automatically using the <code style={{ color: '#22c55e' }}>doc_search</code> tool.
              </div>
              <button
                type="button"
                className="small-btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: 'var(--accent, #ff6b35)',
                  color: '#fff',
                  border: 'none'
                }}
              >
                <Upload size={13} /> Select File to Index
              </button>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id
              const ext = (doc.name || '').split('.').pop()?.toUpperCase() || 'FILE'
              const dateStr = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric'
              }) : ''

              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(isSelected ? null : doc)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: isSelected
                      ? 'rgba(255, 107, 53, 0.08)'
                      : 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
                    border: `1px solid ${isSelected ? 'var(--accent, #ff6b35)' : 'var(--border-color, rgba(255, 255, 255, 0.07))'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      padding: '6px',
                      borderRadius: '8px',
                      background: 'rgba(34, 197, 94, 0.12)',
                      color: '#22c55e',
                      flexShrink: 0
                    }}>
                      <FileText size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary, #fff)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {doc.name}
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginTop: '2px',
                        flexWrap: 'wrap'
                      }}>
                        <span style={{
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          fontWeight: 700,
                          fontSize: '9.5px',
                          color: '#e2e8f0'
                        }}>
                          {ext}
                        </span>
                        {doc.size != null && <span>{formatBytes(doc.size)}</span>}
                        {doc.chars != null && <span>• {doc.chars.toLocaleString()} chars</span>}
                        <span>• {(doc.chunks?.length || 0)} passages</span>
                        {dateStr && <span>• {dateStr}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title={isSelected ? 'Hide passages' : 'View extracted passages'}
                      onClick={(e) => { e.stopPropagation(); setSelectedDoc(isSelected ? null : doc) }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: isSelected ? 'rgba(255, 107, 53, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        color: isSelected ? 'var(--accent, #ff6b35)' : 'var(--text-secondary)',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Eye size={13} /> {isSelected ? 'Close' : 'View'}
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      title="Download passages as text"
                      onClick={(e) => handleExportText(e, doc)}
                      style={{ padding: '6px', color: 'var(--text-secondary)' }}
                    >
                      <Download size={13} />
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete from RAG index"
                      onClick={(e) => handleDelete(e, doc)}
                      style={{ padding: '6px', color: '#f87171' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
