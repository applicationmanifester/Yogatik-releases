import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { 
  ChevronRight, ChevronDown, Folder, FolderOpen, File as FileIcon, FileCode, FileJson,
  FileText, Image as ImageIcon, Search, X, Loader2, MoreVertical, 
  Download, Edit, Trash2, Copy, ExternalLink, Eye
} from 'lucide-react'
import { humanSize, extOf } from '../workspace/treeStore'
import { wsRead, wsDelete, wsMove, wsMkdir, wsWrite, wsCopy, wsStat, wsList, isDesktop } from '../tools/localFs'

const ROW_H = 24
const OVERSCAN = 10

const ICON_BY_EXT = {
  js: FileCode, jsx: FileCode, ts: FileCode, tsx: FileCode, mjs: FileCode, cjs: FileCode,
  py: FileCode, rs: FileCode, go: FileCode, java: FileCode, c: FileCode, h: FileCode,
  cpp: FileCode, cs: FileCode, rb: FileCode, php: FileCode, sh: FileCode, bat: FileCode,
  css: FileCode, scss: FileCode, html: FileCode, vue: FileCode, svelte: FileCode,
  json: FileJson, jsonc: FileJson, lock: FileJson,
  md: FileText, mdx: FileText, txt: FileText, log: FileText, csv: FileText,
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon, gif: ImageIcon, svg: ImageIcon,
  webp: ImageIcon, ico: ImageIcon, avif: ImageIcon,
}

const PREVIEWABLE_TYPES = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
  'application/json', 'application/javascript', 'application/typescript',
  'application/xml', 'application/yaml',
  'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
  'application/pdf'
])

function iconFor(row) {
  if (row.kind !== 'file') return row.expanded ? FolderOpen : Folder
  return ICON_BY_EXT[extOf(row.name)] || FileIcon
}

export default function FileBrowser({
  rootPath,
  conversationId,
  onFileOpen,
  onFileSelect,
  selectedPaths = [],
  multiSelect = false,
  showHidden = false,
  className = '',
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedDirs, setExpandedDirs] = useState(new Set([rootPath]))
  const [filter, setFilter] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [preview, setPreview] = useState(null)
  const [operation, setOperation] = useState(null)
  const scrollerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(400)

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath) => {
    try {
      setLoading(true)
      const result = await wsList(dirPath, { conversationId })
      if (result.success) {
        const entries = result.entries
          .filter(e => showHidden || !e.name.startsWith('.'))
          .map(e => ({
            ...e,
            path: e.path,
            relPath: dirPath === rootPath ? e.name : `${dirPath.replace(rootPath + '/', '')}/${e.name}`.replace(/^\//, ''),
            kind: e.is_dir ? 'dir' : 'file',
            expanded: false,
          }))
          .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
            return a.name.localeCompare(b.name)
          })
        setRows(entries)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [conversationId, rootPath, showHidden])

  // Initial load
  useEffect(() => {
    loadDirectory(rootPath)
  }, [loadDirectory, rootPath])

  // Viewport measurement
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 400))
    ro.observe(el)
    setViewportH(el.clientHeight || 400)
    return () => ro.disconnect()
  }, [])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!filter) return rows
    const lower = filter.toLowerCase()
    return rows.filter(r => r.name.toLowerCase().includes(lower))
  }, [rows, filter])

  // Virtualization
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const count = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2
  const visibleRows = filteredRows.slice(first, first + count)

  const toggleDir = useCallback((row) => {
    if (row.kind !== 'dir') return
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(row.path)) next.delete(row.path)
      else next.add(row.path)
      return next
    })
    // Load subdirectory
    loadDirectory(row.path)
  }, [loadDirectory])

  const handleRowClick = useCallback((row, e) => {
    if (e.shiftKey && multiSelect) {
      // Range selection would go here
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
    } else {
      // Single select
      if (row.kind === 'dir') {
        toggleDir(row)
      } else {
        onFileOpen?.(row)
        onFileSelect?.(row.path, true)
      }
    }
  }, [multiSelect, onFileOpen, onFileSelect, toggleDir])

  const handleContextMenu = useCallback((e, row) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, row })
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setContextMenu(null)
      setPreview(null)
    }
  }, [])

  // File operations
  const doDelete = useCallback(async (row) => {
    if (!window.confirm(`Delete ${row.kind === 'dir' ? 'folder' : 'file'} "${row.name}"?`)) return
    setOperation({ type: 'delete', path: row.path })
    try {
      const result = await wsDelete(row.path, { recursive: row.kind === 'dir', conversationId })
      if (result.success) {
        loadDirectory(rootPath)
      } else {
        alert(result.error)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setOperation(null)
      setContextMenu(null)
    }
  }, [conversationId, loadDirectory, rootPath])

  const doRename = useCallback(async (row, newName) => {
    const parent = row.path.split('/').slice(0, -1).join('/')
    const dest = parent ? `${parent}/${newName}` : newName
    setOperation({ type: 'rename', path: row.path })
    try {
      const result = await wsMove(row.path, dest, { conversationId })
      if (result.success) {
        loadDirectory(rootPath)
      } else {
        alert(result.error)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setOperation(null)
      setContextMenu(null)
    }
  }, [conversationId, loadDirectory, rootPath])

  const doDownload = useCallback(async (row) => {
    if (row.kind === 'dir') {
      alert('Folder download not yet supported')
      return
    }
    setOperation({ type: 'download', path: row.path })
    try {
      const result = await wsRead(row.path, { conversationId })
      if (result.success) {
        const blob = new Blob([result.content], { type: row.type || 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = row.name
        a.click()
        URL.revokeObjectURL(url)
      } else {
        alert(result.error)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setOperation(null)
      setContextMenu(null)
    }
  }, [conversationId])

  const doPreview = useCallback(async (row) => {
    if (row.kind === 'dir') return
    if (!PREVIEWABLE_TYPES.has(row.type) && !row.type.startsWith('text/')) {
      alert('Preview not available for this file type')
      return
    }
    try {
      const result = await wsRead(row.path, { maxBytes: 1024 * 1024, conversationId })
      if (result.success) {
        setPreview({ row, content: result.content, type: row.type })
      } else {
        alert(result.error)
      }
    } catch (err) {
      alert(err.message)
    }
  }, [conversationId])

  const doCopyPath = useCallback((row) => {
    navigator.clipboard.writeText(row.path).then(() => {
      // Could show toast
    })
    setContextMenu(null)
  }, [])

  const doNewFile = useCallback(async (dirRow) => {
    const name = prompt('New file name:')
    if (!name) return
    const target = dirRow.path === rootPath ? name : `${dirRow.path}/${name}`
    try {
      await wsWrite(target, '', { conversationId })
      loadDirectory(rootPath)
    } catch (err) {
      alert(err.message)
    }
  }, [conversationId, loadDirectory, rootPath])

  const doNewFolder = useCallback(async (dirRow) => {
    const name = prompt('New folder name:')
    if (!name) return
    const target = dirRow.path === rootPath ? name : `${dirRow.path}/${name}`
    try {
      await wsMkdir(target, { conversationId })
      loadDirectory(rootPath)
    } catch (err) {
      alert(err.message)
    }
  }, [conversationId, loadDirectory, rootPath])

  // Get parent directory for context menu
  const getParentRow = useCallback((row) => {
    if (row.path === rootPath) return null
    const parentPath = row.path.split('/').slice(0, -1).join('/')
    return rows.find(r => r.path === parentPath) || { path: parentPath, kind: 'dir', name: '..' }
  }, [rows, rootPath])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (loading && rows.length === 0) {
    return (
      <div className={`file-browser ${className}`} style={{ height: '100%' }}>
        <div className="fb-loading">
          <Loader2 size={24} className="spinning" />
          <span>Loading...</span>
        </div>
        <style jsx>{`
          .fb-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: var(--text-muted); }
          .spinning { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className={`file-browser ${className}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }} onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="fb-toolbar">
        <div className="fb-search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Filter files..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter files"
          />
          {filter && <button className="icon-btn" onClick={() => setFilter('')} aria-label="Clear filter"><X size={12} /></button>}
        </div>
        <div className="fb-path" title={rootPath}>
          {rootPath.split('/').filter(Boolean).map((part, i, arr) => (
            <span key={i} className="path-segment">
              {i > 0 && <span className="path-sep">/</span>}
              <span>{part}</span>
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="fb-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => loadDirectory(rootPath)}>Retry</button>
        </div>
      )}

      {/* File list */}
      <div 
        ref={scrollerRef}
        className="fb-list"
        role="listbox"
        aria-label="Files"
        onScroll={e => setScrollTop(e.target.scrollTop)}
        style={{ flex: 1, overflow: 'auto', position: 'relative' }}
      >
        <div style={{ height: `${filteredRows.length * ROW_H}px`, position: 'relative' }}>
          {visibleRows.map((row, idx) => {
            const Icon = iconFor(row)
            const isSelected = selectedPaths.includes(row.path)
            const actualIndex = first + idx
            const indent = (row.path.split('/').length - (rootPath ? rootPath.split('/').length : 0)) * 16
            
            return (
              <div
                key={row.path}
                className={`fb-row ${row.kind} ${isSelected ? 'selected' : ''} ${operation?.path === row.path ? 'busy' : ''}`}
                role="option"
                aria-selected={isSelected}
                style={{ top: `${actualIndex * ROW_H}px`, height: `${ROW_H}px`, paddingLeft: `${12 + indent}px` }}
                onClick={e => handleRowClick(row, e)}
                onContextMenu={e => handleContextMenu(e, row)}
                onDoubleClick={() => row.kind === 'file' && onFileOpen?.(row)}
              >
                {row.kind === 'dir' && (
                  <button
                    className="fb-expander"
                    onClick={e => { e.stopPropagation(); toggleDir(row) }}
                    aria-expanded={expandedDirs.has(row.path)}
                    aria-label={expandedDirs.has(row.path) ? 'Collapse' : 'Expand'}
                  >
                    {expandedDirs.has(row.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
                {row.kind === 'file' && <div style={{ width: 16 }} />}
                <Icon size={14} className="fb-icon" />
                <span className="fb-name" title={row.name}>{row.name}</span>
                {row.kind === 'file' && row.size != null && (
                  <span className="fb-size">{humanSize(row.size)}</span>
                )}
                {row.kind === 'file' && row.mtimeMs && (
                  <span className="fb-mtime" title={new Date(row.mtimeMs).toLocaleString()}>
                    {new Date(row.mtimeMs).toLocaleDateString()}
                  </span>
                )}
                <button
                  className="fb-menu-btn"
                  onClick={e => { e.stopPropagation(); handleContextMenu(e, row) }}
                  aria-label="More options"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fb-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <div className="cm-header">{contextMenu.row.name}</div>
          <div className="cm-divider" />
          {contextMenu.row.kind === 'file' && (
            <>
              <button className="cm-item" onClick={() => doPreview(contextMenu.row)}>
                <Eye size={14} /> Preview
              </button>
              <button className="cm-item" onClick={() => doDownload(contextMenu.row)}>
                <Download size={14} /> Download
              </button>
              <button className="cm-item" onClick={() => onFileOpen?.(contextMenu.row)}>
                <Edit size={14} /> Open in Editor
              </button>
            </>
          )}
          {contextMenu.row.kind === 'dir' && (
            <>
              <button className="cm-item" onClick={() => doNewFile(contextMenu.row)}>
                <FileIcon size={14} /> New File
              </button>
              <button className="cm-item" onClick={() => doNewFolder(contextMenu.row)}>
                <FolderPlus size={14} /> New Folder
              </button>
            </>
          )}
          <button className="cm-item" onClick={() => doCopyPath(contextMenu.row)}>
            <Copy size={14} /> Copy Path
          </button>
          <div className="cm-divider" />
          <button className="cm-item cm-danger" onClick={() => doDelete(contextMenu.row)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fb-preview-overlay" onClick={() => setPreview(null)}>
          <div className="fb-preview" onClick={e => e.stopPropagation()}>
            <div className="fp-header">
              <span>{preview.row.name}</span>
              <button onClick={() => setPreview(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="fp-content">
              {preview.type.startsWith('image/') ? (
                <img src={`data:${preview.type};base64,${btoa(preview.content)}`} alt={preview.row.name} />
              ) : preview.type === 'application/pdf' ? (
                <iframe src={`data:application/pdf;base64,${btoa(preview.content)}`} />
              ) : (
                <pre>{preview.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .file-browser {
          background: var(--bg-primary, #0a0e14);
          border: 1px solid var(--border-color, #334155);
          border-radius: 8px;
          overflow: hidden;
          font-family: var(--font-mono, ui-monospace, monospace);
        }
        .fb-toolbar {
          display: flex;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color, #334155);
          background: var(--bg-secondary, #0f172a);
        }
        .fb-search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
        }
        .fb-search input {
          flex: 1;
          padding: 6px 10px;
          background: var(--bg-tertiary, #1e293b);
          border: 1px solid var(--border-color, #334155);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 13px;
        }
        .fb-path {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-muted);
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .path-sep { color: var(--text-muted); }
        .fb-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin: 8px;
          background: var(--error-bg, #7f1d1d);
          border: 1px solid var(--error-border, #ef4444);
          border-radius: 4px;
          color: var(--error-text, #fecaca);
          font-size: 13px;
        }
        .fb-error button {
          margin-left: auto;
          padding: 4px 10px;
          background: var(--error-border);
          border: none;
          border-radius: 3px;
          color: white;
          cursor: pointer;
        }
        .fb-list { position: relative; }
        .fb-row {
          position: absolute;
          left: 0; right: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px;
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          user-select: none;
        }
        .fb-row:hover { background: var(--bg-hover, #1e293b); }
        .fb-row.selected { background: var(--accent-bg, #1e3a5f); }
        .fb-row.busy { opacity: 0.6; }
        .fb-expander {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: 3px;
        }
        .fb-expander:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .fb-icon { flex-shrink: 0; color: var(--text-muted); }
        .fb-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fb-size, .fb-mtime {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .fb-menu-btn {
          display: none;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: 3px;
        }
        .fb-row:hover .fb-menu-btn { display: flex; }
        /* Context Menu */
        .fb-context-menu {
          position: fixed;
          z-index: 1000;
          min-width: 180px;
          background: var(--bg-secondary, #0f172a);
          border: 1px solid var(--border-color, #334155);
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          padding: 4px 0;
        }
        .cm-header {
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cm-divider { height: 1px; background: var(--border-color); margin: 4px 0; }
        .cm-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }
        .cm-item:hover { background: var(--bg-tertiary); }
        .cm-danger { color: var(--error-text, #fecaca); }
        .cm-danger:hover { background: var(--error-bg, #7f1d1d); }
        /* Preview */
        .fb-preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 1001;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .fb-preview {
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .fp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
        }
        .fp-header button {
          background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;
        }
        .fp-header button:hover { color: var(--text-primary); }
        .fp-content {
          flex: 1;
          overflow: auto;
          padding: 16px;
        }
        .fp-content pre {
          margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit;
        }
        .fp-content img, .fp-content iframe { max-width: 100%; height: auto; }
      `}</style>
    </div>
  )
}