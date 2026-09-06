import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  ExternalLink, X, RotateCw, FolderOpen, Send, Download,
  GitPullRequest, Code, FileCode, Sparkles, Maximize2, Minimize2,
  AlertCircle
} from 'lucide-react'
import { wsFindFiles, wsRead, wsWrite, gitDiff, gitStatus, listRoots, isDesktop } from '../tools/localFs'
import {
  injectTextIntoGemini,
  extractLatestCodeFromGemini,
  buildWorkspaceContextPrompt
} from '../tools/geminiBridge'
import { WebCompanionStudio } from './WebCompanionStudio'

const GEMINI_CONV_ID = 'gemini-dock'
const GEMINI_URL = 'https://gemini.google.com/'

const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'svg', 'mp4', 'mp3', 'wav',
  'pdf', 'zip', 'tar', 'gz', 'bin', 'exe', 'dll', 'so', 'dylib', 'wasm',
  'iso', '7z', 'rar', 'lock'
])
const MAX_INJECT_BYTES = 180 * 1024 // 180KB safety ceiling

export function GeminiDock({
  onClose,
  onToast,
  occluded = false,
  onSwitchToGrok,
  activeFileName = '',
  activeFileContent = ''
}) {
  const holeRef = useRef(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Ready')

  // Bridge File Picker State
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [availableFiles, setAvailableFiles] = useState([])
  const [fileFilter, setFileFilter] = useState('')
  const [selectedFile, setSelectedFile] = useState('')
  const [searchingFiles, setSearchingFiles] = useState(false)

  // Code Pull Drawer State
  const [extractedBlocks, setExtractedBlocks] = useState([])
  const [showCodeDrawer, setShowCodeDrawer] = useState(false)
  const [savingFile, setSavingFile] = useState(null)
  const [targetPaths, setTargetPaths] = useState({})

  const br = () => (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null
  const desktop = isDesktop()

  // An overlay/drawer paints UNDER the native view in Electron, so detach WebContentsView while occluded
  const isOccluded = occluded || showFilePicker || showCodeDrawer

  const reportBounds = useCallback(() => {
    const b = br()
    const el = holeRef.current
    if (!b || !el) return
    const r = el.getBoundingClientRect()
    b.setBounds({
      conversationId: GEMINI_CONV_ID,
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
  }, [])

  // Initialize and mount Gemini Webview in Electron
  useEffect(() => {
    const b = br()
    if (!b) return

    setLoading(true)
    b.navigate({ conversationId: GEMINI_CONV_ID, url: GEMINI_URL })
      .catch(() => {})
      .finally(() => setLoading(false))

    reportBounds()
    const ro = new ResizeObserver(reportBounds)
    if (holeRef.current) ro.observe(holeRef.current)
    window.addEventListener('resize', reportBounds)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', reportBounds)
      try {
        b.setDetached({ conversationId: GEMINI_CONV_ID, detached: true })
      } catch {
        /* ignore */
      }
    }
  }, [reportBounds])

  // Handle occlusion / dialog detachment
  useEffect(() => {
    const b = br()
    if (!b) return
    b.setDetached({ conversationId: GEMINI_CONV_ID, detached: !!isOccluded })
    if (!isOccluded) {
      reportBounds()
    }
  }, [isOccluded, reportBounds])

  const handleReload = () => {
    const b = br()
    if (b) {
      setLoading(true)
      b.reload({ conversationId: GEMINI_CONV_ID })
        .catch(() => {})
        .finally(() => setLoading(false))
      onToast?.('Reloaded gemini.google.com')
    }
  }

  const handleOpenExternal = () => {
    if (window.__YOGATIK_DESKTOP__?.openExternal) {
      window.__YOGATIK_DESKTOP__.openExternal(GEMINI_URL)
    } else {
      window.open(GEMINI_URL, '_blank', 'noopener,noreferrer')
    }
  }

  // Load project files for the file injector
  const openFileSelector = async () => {
    setShowFilePicker(true)
    setSearchingFiles(true)
    setFileFilter('')
    try {
      const res = await wsFindFiles('*', { limit: 150 })
      const files = Array.isArray(res) ? res : res?.files || []
      const filtered = files.filter(f => {
        if (f.includes('node_modules') || f.includes('.git/')) return false
        if (f.endsWith('package-lock.json') || f.endsWith('yarn.lock') || f.endsWith('pnpm-lock.yaml')) return false
        const ext = f.split('.').pop()?.toLowerCase() || ''
        return !BINARY_EXTS.has(ext)
      })
      setAvailableFiles(filtered)
      if (filtered.length && !selectedFile) {
        setSelectedFile(filtered[0])
      }
    } catch {
      setAvailableFiles([])
    } finally {
      setSearchingFiles(false)
    }
  }

  // Send a specific local file to Gemini
  const handleSendFile = async (filePath) => {
    const pathToSend = filePath || selectedFile
    if (!pathToSend) {
      onToast?.('Please choose a file to send')
      return
    }
    setShowFilePicker(false)
    setStatusMsg(`Reading ${pathToSend}...`)
    try {
      const res = await wsRead(pathToSend)
      let content = typeof res === 'string' ? res : res?.content || ''
      if (content.length > MAX_INJECT_BYTES) {
        content = content.slice(0, MAX_INJECT_BYTES) + `\n\n/* [NOTE: File trimmed to 180KB for prompt transmission (${Math.round(content.length / 1024)}KB total)] */`
        onToast?.(`Notice: ${pathToSend} trimmed to 180KB to fit prompt limits`)
      }
      const ext = pathToSend.split('.').pop() || 'text'
      const prompt = `📁 **File: \`${pathToSend}\`**\n\`\`\`${ext}\n${content}\n\`\`\`\nPlease analyze this code.`

      await injectTextIntoGemini(GEMINI_CONV_ID, prompt)
      onToast?.(`✓ Injected ${pathToSend} into Gemini prompt`)
      setStatusMsg(`Injected ${pathToSend}`)
    } catch (err) {
      onToast?.(`Failed to send file: ${err?.message || err}`)
      setStatusMsg('File injection failed')
    }
  }

  // Send workspace tree & context
  const handleSendContext = async () => {
    setStatusMsg('Gathering workspace context...')
    try {
      const [roots, filesRes, gitRes] = await Promise.all([
        listRoots().catch(() => []),
        wsFindFiles('*', { limit: 60 }).catch(() => []),
        gitStatus().catch(() => null),
      ])

      const primaryRoot = roots[0]?.path || roots[0]?.label || 'Workspace'
      const files = Array.isArray(filesRes) ? filesRes : filesRes?.files || []
      const prompt = buildWorkspaceContextPrompt({
        projectName: primaryRoot.split(/[\\/]/).pop() || 'Project',
        rootPath: primaryRoot,
        files,
        gitBranch: gitRes?.branch || '',
        gitStatus: gitRes?.clean ? 'clean' : `${(gitRes?.files || []).length} uncommitted changes`,
        activeFileName,
        activeFileContent,
      })

      await injectTextIntoGemini(GEMINI_CONV_ID, prompt)
      onToast?.('✓ Workspace context injected into Gemini')
      setStatusMsg('Context injected')
    } catch (err) {
      onToast?.(`Failed to inject context: ${err?.message || err}`)
      setStatusMsg('Context injection failed')
    }
  }

  // Send Git diff
  const handleSendDiff = async () => {
    setStatusMsg('Reading Git diff...')
    try {
      const res = await gitDiff()
      const diffText = typeof res === 'string' ? res : res?.diff || ''
      if (!diffText.trim()) {
        onToast?.('Working tree is clean — no git changes to send')
        setStatusMsg('Working tree clean')
        return
      }
      const prompt = `### 🔀 Current Git Diff\n\`\`\`diff\n${diffText.slice(0, 15000)}\n\`\`\`\nPlease review these changes.`
      await injectTextIntoGemini(GEMINI_CONV_ID, prompt)
      onToast?.('✓ Git diff injected into Gemini')
      setStatusMsg('Diff injected')
    } catch (err) {
      onToast?.(`Failed to send Git diff: ${err?.message || err}`)
      setStatusMsg('Diff injection failed')
    }
  }

  // Pull code blocks generated by Gemini on gemini.google.com
  const handlePullCode = async () => {
    setStatusMsg('Scanning Gemini response for code...')
    try {
      const res = await extractLatestCodeFromGemini(GEMINI_CONV_ID)
      const blocks = res?.blocks || []
      if (!blocks.length) {
        onToast?.('No code blocks found in recent Gemini messages')
        setStatusMsg('No code found')
        return
      }

      setExtractedBlocks(blocks)
      setShowCodeDrawer(true)
      const initialPaths = {}
      blocks.forEach(b => {
        if (b.filename) initialPaths[b.id] = b.filename
      })
      setTargetPaths(prev => ({ ...initialPaths, ...prev }))
      setStatusMsg(`Extracted ${blocks.length} code block(s)`)
      onToast?.(`Found ${blocks.length} code block(s) from Gemini`)
    } catch (err) {
      onToast?.(`Could not pull code: ${err?.message || err}`)
      setStatusMsg('Code pull failed')
    }
  }

  // Save extracted code block to workspace disk
  const handleSaveBlock = async (block) => {
    const target = targetPaths[block.id] || block.filename || `gemini_output_${Date.now()}.${block.language || 'txt'}`
    setSavingFile(block.id)
    try {
      await wsWrite(target, block.code)
      onToast?.(`✓ Saved code block to ${target}`)
    } catch (err) {
      onToast?.(`Failed to save: ${err?.message || err}`)
    } finally {
      setSavingFile(null)
    }
  }

  const displayedFiles = availableFiles.filter(
    f => !fileFilter || f.toLowerCase().includes(fileFilter.toLowerCase())
  )

  return (
    <div className={`gemini-dock-container ${fullscreen ? 'fullscreen' : ''}`}>
      {/* Top Header */}
      <header className="gemini-dock-header">
        <div className="gemini-dock-title-group">
          <span className="gemini-dock-logo">✨</span>
          <strong>Gemini.com Studio</strong>
          <span className="gemini-status-badge">
            <span className="status-dot online" /> {desktop ? 'Desktop Bridge Active' : 'Web Companion Mode'}
          </span>
          {onSwitchToGrok && (
            <button
              className="dock-switch-pill"
              onClick={onSwitchToGrok}
              title="Switch to Grok.com Studio"
            >
              🤖 Switch to Grok
            </button>
          )}
          <span className="gemini-dock-hint">({statusMsg})</span>
        </div>

        <div className="gemini-dock-controls">
          {desktop && (
            <button className="icon-btn" onClick={handleReload} title="Reload Gemini.com" aria-label="Reload">
              <RotateCw size={14} className={loading ? 'spinning' : ''} />
            </button>
          )}
          <button className="icon-btn" onClick={handleOpenExternal} title="Open in external browser" aria-label="External">
            <ExternalLink size={14} />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setFullscreen(f => !f)
              setTimeout(reportBounds, 80)
            }}
            title={fullscreen ? 'Restore view' : 'Maximize dock'}
            aria-label="Toggle Fullscreen"
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="icon-btn close-btn" onClick={onClose} title="Close Gemini Dock" aria-label="Close">
            <X size={15} />
          </button>
        </div>
      </header>

      {/* Desktop Local File Bridge Toolbar */}
      {desktop && (
        <div className="gemini-bridge-toolbar">
          <span className="bridge-label">Local File Bridge:</span>

          <button className="bridge-btn" onClick={openFileSelector} title="Send local file content to Gemini">
            <FolderOpen size={13} /> Send File…
          </button>

          <button className="bridge-btn" onClick={handleSendContext} title="Inject project file tree & environment context">
            <Sparkles size={13} /> Send Workspace Context
          </button>

          <button className="bridge-btn" onClick={handleSendDiff} title="Send Git working tree diff for review">
            <GitPullRequest size={13} /> Send Git Diff
          </button>

          <div className="bridge-divider" />

          <button className="bridge-btn accent-gemini" onClick={handlePullCode} title="Extract generated code from Gemini and save to disk">
            <Download size={13} /> Pull Code from Gemini
          </button>
        </div>
      )}

      {/* Main View Area / Hole for WebContentsView or Web Companion Studio */}
      <div className="gemini-dock-view">
        {desktop ? (
          <div ref={holeRef} className="gemini-native-hole" />
        ) : (
          <WebCompanionStudio
            serviceName="Gemini"
            serviceUrl={GEMINI_URL}
            serviceIcon="✨"
            onToast={onToast}
            onSwitchService={onSwitchToGrok}
            switchLabel="🤖 Switch to Grok"
          />
        )}
      </div>

      {/* File Picker Modal */}
      {showFilePicker && (
        <div className="gemini-modal-overlay" onClick={() => setShowFilePicker(false)}>
          <div className="gemini-picker-card" onClick={e => e.stopPropagation()}>
            <div className="picker-header">
              <h4><FolderOpen size={15} /> Select Workspace File to Send</h4>
              <button className="icon-btn" onClick={() => setShowFilePicker(false)}><X size={14} /></button>
            </div>
            <div className="picker-search-bar">
              <input
                type="search"
                placeholder="Filter files (e.g. App.jsx)..."
                value={fileFilter}
                onChange={e => setFileFilter(e.target.value)}
                className="path-input"
                autoFocus
              />
            </div>
            {searchingFiles ? (
              <p className="picker-loading">Listing project files…</p>
            ) : displayedFiles.length > 0 ? (
              <div className="picker-list">
                {displayedFiles.map(file => (
                  <button
                    key={file}
                    className={`picker-item ${selectedFile === file ? 'active' : ''}`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <FileCode size={13} /> {file}
                  </button>
                ))}
              </div>
            ) : (
              <p className="picker-empty">
                {availableFiles.length === 0
                  ? 'No files discovered in current workspace root.'
                  : 'No files match your search filter.'}
              </p>
            )}
            <div className="picker-footer">
              <button className="small-btn" onClick={() => setShowFilePicker(false)}>Cancel</button>
              <button
                className="small-btn btn-primary"
                disabled={!selectedFile}
                onClick={() => handleSendFile(selectedFile)}
              >
                <Send size={12} /> Inject into Gemini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Code Pull Drawer */}
      {showCodeDrawer && (
        <div className="gemini-code-drawer">
          <div className="drawer-header">
            <h4><Code size={15} /> Extracted Code Blocks ({extractedBlocks.length})</h4>
            <button className="icon-btn" onClick={() => setShowCodeDrawer(false)}><X size={14} /></button>
          </div>
          <div className="drawer-body">
            {extractedBlocks.map(block => (
              <div key={block.id} className="extracted-block-card">
                <div className="block-meta">
                  <span className="lang-tag">{block.language}</span>
                  <span className="line-tag">{block.lines} lines</span>
                </div>
                <pre className="block-preview">
                  <code>{block.code.slice(0, 300)}{block.code.length > 300 ? '…' : ''}</code>
                </pre>
                <div className="save-row">
                  <input
                    type="text"
                    placeholder="target/path/to/file.js"
                    value={targetPaths[block.id] ?? block.filename ?? ''}
                    onChange={e => setTargetPaths({ ...targetPaths, [block.id]: e.target.value })}
                    className="path-input"
                  />
                  <button
                    className="small-btn btn-primary"
                    disabled={savingFile === block.id}
                    onClick={() => handleSaveBlock(block)}
                  >
                    {savingFile === block.id ? 'Saving…' : <><Download size={12} /> Save to Disk</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
