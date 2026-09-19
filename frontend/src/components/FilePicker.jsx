import React, { useCallback, useRef, useState } from 'react'
import { Upload, X, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { wsWrite, wsRead } from '../tools/localFs'

/** Allowed MIME types for upload */
const ALLOWED_MIME_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
  'application/json', 'application/javascript', 'application/typescript',
  'application/xml', 'application/yaml',
  'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
  'application/pdf'
]

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Magic bytes for additional file type verification */
const MAGIC_BYTES = {
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/gif': [0x47, 0x49, 0x46],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'application/zip': [0x50, 0x4B, 0x03, 0x04], // also catches .docx, .xlsx, etc.
}

function verifyMagicBytes(buffer, mimeType) {
  const expected = MAGIC_BYTES[mimeType]
  if (!expected) return true // No magic bytes check for this type
  return expected.every((byte, i) => buffer[i] === byte)
}

function sanitizeFilename(name) {
  // Remove path traversal attempts and dangerous characters
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .slice(0, 255)
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FilePicker({
  onFilesAdded,
  accept = '*/*',
  multiple = true,
  maxFiles = 10,
  dropZoneRef,
  className = '',
}) {
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState([])
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const validateFile = useCallback((file) => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds maximum size of ${formatSize(MAX_FILE_SIZE)}`
    }

    // Check MIME type against allowed list
    if (accept !== '*/*' && !accept.split(',').some(a => {
      const trimmed = a.trim()
      if (trimmed.endsWith('/*')) {
        return file.type.startsWith(trimmed.slice(0, -1))
      }
      return file.type === trimmed || file.name.endsWith(trimmed)
    })) {
      return `File type "${file.type || 'unknown'}" is not allowed`
    }

    // Check against our allowed list for extra security
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith('text/')) {
      return `File type "${file.type}" is not supported for security reasons`
    }

    return null
  }, [accept])

  const processFile = useCallback(async (file, rootPath) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return null
    }

    // Read file to verify magic bytes
    const buffer = await file.arrayBuffer()
    const uint8 = new Uint8Array(buffer)
    if (!verifyMagicBytes(uint8, file.type)) {
      setError(`File "${file.name}" appears to be corrupted or mislabeled`)
      return null
    }

    const sanitizedName = sanitizeFilename(file.name)
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    
    const uploadEntry = {
      id: uploadId,
      file,
      name: sanitizedName,
      originalName: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      error: null,
    }

    setUploads(prev => [...prev, uploadEntry])

    try {
      // Update status to uploading
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'uploading' } : u))

      // Convert to base64 for transport (in production, use multipart/form-data)
      const base64 = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(file)
      })

      // Write file through the workspace tools
      const destPath = rootPath ? `${rootPath}/${sanitizedName}` : sanitizedName
      const result = await wsWrite(destPath, base64, { encoding: 'base64' })

      if (!result.success) {
        throw new Error(result.error || 'Write failed')
      }

      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: 'complete', 
        progress: 100,
        path: destPath 
      } : u))

      return { path: destPath, name: sanitizedName, size: file.size, type: file.type }
    } catch (err) {
      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: 'error', 
        error: err.message 
      } : u))
      return null
    }
  }, [validateFile])

  const handleFiles = useCallback(async (files, rootPath) => {
    const fileArray = Array.from(files).slice(0, maxFiles)
    const results = []
    
    for (const file of fileArray) {
      const result = await processFile(file, rootPath)
      if (result) results.push(result)
    }

    if (results.length > 0 && onFilesAdded) {
      onFilesAdded(results)
    }

    // Clear completed uploads after a delay
    setTimeout(() => {
      setUploads(prev => prev.filter(u => u.status !== 'complete'))
    }, 3000)
  }, [maxFiles, onFilesAdded, processFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }, [])

  const handleFileSelect = useCallback((e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = '' // Allow re-selecting same file
    }
  }, [handleFiles])

  const removeUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id))
  }, [])

  const retryUpload = useCallback((upload) => {
    setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'pending', error: null } : u))
    processFile(upload.file)
  }, [processFile])

  // Attach to external drop zone ref
  useEffect(() => {
    if (!dropZoneRef?.current) return
    const el = dropZoneRef.current
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)
    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop)
    }
  }, [dropZoneRef, handleDragOver, handleDragLeave, handleDrop])

  return (
    <div className={`file-picker ${dragging ? 'dragging' : ''} ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        aria-label="File upload"
      />

      <button
        type="button"
        className="file-picker-trigger"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploads.some(u => u.status === 'uploading')}
      >
        <Upload size={20} />
        <span>Choose Files</span>
        {uploads.some(u => u.status === 'uploading') && <Loader2 size={16} className="spinning" />}
      </button>

      {error && (
        <div className="file-picker-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="file-picker-uploads" role="list" aria-label="File uploads">
          {uploads.map(upload => (
            <div key={upload.id} className={`upload-item ${upload.status}`} role="listitem">
              <div className="upload-info">
                <div className="upload-icon">
                  {upload.type.startsWith('image/') ? (
                    <img src={URL.createObjectURL(upload.file)} alt="" width={24} height={24} />
                  ) : upload.type === 'application/pdf' ? (
                    <span className="pdf-icon">PDF</span>
                  ) : (
                    <span className="text-icon">TXT</span>
                  )}
                </div>
                <div className="upload-details">
                  <div className="upload-name" title={upload.originalName}>
                    {upload.name}
                  </div>
                  <div className="upload-meta">
                    {formatSize(upload.size)}
                    {upload.status === 'uploading' && (
                      <>
                        <span> • </span>
                        <div className="upload-progress" role="progressbar" 
                             aria-valuenow={upload.progress} aria-valuemin={0} aria-valuemax={100}>
                          <div className="progress-bar" style={{ width: `${upload.progress}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {upload.status === 'error' && (
                <div className="upload-error">
                  <AlertCircle size={14} />
                  <span>{upload.error}</span>
                  <button onClick={() => retryUpload(upload)} className="retry-btn" aria-label="Retry">
                    <Loader2 size={12} />
                  </button>
                </div>
              )}

              {upload.status === 'complete' && (
                <CheckCircle size={16} className="upload-success" />
              )}

              <button
                className="upload-remove"
                onClick={() => removeUpload(upload.id)}
                aria-label={`Remove ${upload.name}`}
                disabled={upload.status === 'uploading'}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .file-picker {
          display: inline-flex;
          flex-direction: column;
          gap: 8px;
        }
        .file-picker-trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--bg-tertiary, #1e293b);
          border: 2px dashed var(--border-color, #334155);
          border-radius: 8px;
          color: var(--text-primary, #f1f5f9);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .file-picker-trigger:hover:not(:disabled) {
          border-color: var(--accent-color, #3b82f6);
          background: var(--bg-hover, #334155);
        }
        .file-picker-trigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .file-picker.dragging .file-picker-trigger {
          border-color: var(--accent-color, #3b82f6);
          background: var(--accent-bg, #1e3a5f);
        }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .file-picker-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: var(--error-bg, #7f1d1d);
          border: 1px solid var(--error-border, #ef4444);
          border-radius: 6px;
          color: var(--error-text, #fecaca);
          font-size: 13px;
        }
        .file-picker-uploads {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 200px;
          overflow-y: auto;
        }
        .upload-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          background: var(--bg-secondary, #0f172a);
          border: 1px solid var(--border-color, #334155);
          border-radius: 6px;
          animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .upload-info {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }
        .upload-icon {
          width: 24px;
          height: 24px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .upload-icon img { width: 100%; height: 100%; object-fit: cover; }
        .pdf-icon, .text-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          font-size: 10px;
          font-weight: 600;
          background: var(--bg-tertiary);
          color: var(--text-muted);
        }
        .pdf-icon { color: #ef4444; }
        .upload-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .upload-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .upload-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-muted);
        }
        .upload-progress {
          flex: 1;
          height: 4px;
          background: var(--bg-tertiary);
          border-radius: 2px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: var(--accent-color, #3b82f6);
          border-radius: 2px;
          transition: width 0.2s;
        }
        .upload-error {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          background: var(--error-bg, #7f1d1d);
          border-radius: 4px;
          color: var(--error-text, #fecaca);
          font-size: 11px;
        }
        .retry-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          border-radius: 3px;
        }
        .retry-btn:hover { background: rgba(255,255,255,0.1); }
        .upload-success {
          color: var(--success-color, #22c55e);
          flex-shrink: 0;
        }
        .upload-remove {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .upload-remove:hover:not(:disabled) {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
        .upload-remove:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  )
}