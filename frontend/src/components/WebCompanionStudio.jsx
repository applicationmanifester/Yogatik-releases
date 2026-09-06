import React, { useState, useRef } from 'react'
import {
  ExternalLink,
  Upload,
  Copy,
  Check,
  Download,
  Code,
  FolderOpen,
  Sparkles,
  ArrowRight,
  Laptop,
  Layers,
  FileCode,
  RefreshCw,
} from 'lucide-react'

// Helper to parse markdown code blocks and infer filenames
export function parseMarkdownCodeBlocks(text) {
  if (!text || typeof text !== 'string') return []
  const regex = /```([a-zA-Z0-9_\-#+.]*)\s*\n([\s\S]*?)```/g
  const blocks = []
  let match
  let idx = 0

  while ((match = regex.exec(text)) !== null) {
    const lang = (match[1] || 'text').trim().toLowerCase()
    const code = match[2] || ''
    const lines = code.split('\n').length

    // Inferred filename from first line comment or common patterns
    let filename = ''
    const firstLine = code.split('\n')[0]?.trim() || ''
    const fileCommentMatch = firstLine.match(
      /^(?:\/\/|#|\/\*|<!--|--)\s*(?:file(?:name|path)?:\s*|)([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i
    )
    if (fileCommentMatch) {
      filename = fileCommentMatch[1].trim()
    } else {
      const extMap = {
        javascript: 'js',
        js: 'js',
        jsx: 'jsx',
        typescript: 'ts',
        ts: 'ts',
        tsx: 'tsx',
        python: 'py',
        py: 'py',
        html: 'html',
        css: 'css',
        json: 'json',
        rust: 'rs',
        rs: 'rs',
        go: 'go',
        shell: 'sh',
        bash: 'sh',
        sql: 'sql',
        markdown: 'md',
        md: 'md',
        yaml: 'yaml',
        yml: 'yaml',
      }
      const ext = extMap[lang] || (lang && lang.length <= 4 ? lang : 'txt')
      filename = `extracted_file_${idx + 1}.${ext}`
    }

    blocks.push({
      id: `block-${idx++}`,
      language: lang || 'text',
      code,
      lines,
      filename,
    })
  }

  return blocks
}

// Download code directly to user's computer via browser Blob
export function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'downloaded_code.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PROMPT_GOALS = [
  { id: 'review', label: '🔍 Deep Code Review & Fixes', text: 'Please perform a thorough code review of this file. Identify potential bugs, security concerns, and performance improvements.' },
  { id: 'debug', label: '🐛 Debug & Handle Edge Cases', text: 'Analyze this file for runtime errors, missing null/undefined checks, and boundary condition bugs. Provide the corrected code.' },
  { id: 'tests', label: '🧪 Generate Unit Tests', text: 'Write comprehensive unit tests with full branch coverage for this code, testing both typical use and edge cases.' },
  { id: 'docs', label: '📝 Explain & Add JSDoc/Types', text: 'Explain the architecture of this code clearly and add comprehensive type annotations and JSDoc documentation.' },
  { id: 'modernize', label: '⚡ Modernize & Refactor', text: 'Refactor this code to follow the cleanest modern practices, concise idioms, and optimal readability.' },
]

export function WebCompanionStudio({
  serviceName = 'Grok',
  serviceUrl = 'https://grok.com/',
  serviceIcon = '🤖',
  onToast,
  onSwitchService,
  switchLabel,
}) {
  const [activeTab, setActiveTab] = useState('send') // 'send' | 'harvest' | 'api'
  const [selectedFileName, setSelectedFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [fileSizeStr, setFileSizeStr] = useState('')
  const [selectedGoal, setSelectedGoal] = useState('review')
  const [customInstructions, setCustomInstructions] = useState('')
  const [copiedFile, setCopiedFile] = useState(false)

  // Harvester state
  const [harvestInput, setHarvestInput] = useState('')
  const [harvestedBlocks, setHarvestedBlocks] = useState([])
  const [customFileNames, setCustomFileNames] = useState({})
  const [copiedBlockId, setCopiedBlockId] = useState(null)

  const fileInputRef = useRef(null)

  // Handle local file selection in browser
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFileName(file.name)
    const kb = (file.size / 1024).toFixed(1)
    setFileSizeStr(`${kb} KB`)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result || ''
      setFileContent(text)
      onToast?.(`Loaded ${file.name} (${kb} KB) ready to transfer`)
    }
    reader.onerror = () => {
      onToast?.(`Could not read file: ${file.name}`)
    }
    reader.readAsText(file)
  }

  // Open the companion popup window
  const openCompanionWindow = () => {
    const w = 780
    const h = 940
    const left = Math.max(0, window.screen.width - w - 40)
    const top = 40
    const popup = window.open(
      serviceUrl,
      `${serviceName.toLowerCase()}_companion_win`,
      `width=${w},height=${h},left=${left},top=${top},menubar=no,status=no,titlebar=no,toolbar=no,popup=yes`
    )
    if (!popup) {
      window.open(serviceUrl, '_blank', 'noopener,noreferrer')
      onToast?.(`Opened ${serviceName}.com in new tab`)
    } else {
      popup.focus()
      onToast?.(`Launched ${serviceName}.com Companion Window`)
    }
    return popup
  }

  // Copy formatted file & instructions to clipboard and launch companion
  const handleCopyAndLaunch = async () => {
    if (!fileContent.trim()) {
      onToast?.('Please choose or upload a file first')
      return
    }

    const goalObj = PROMPT_GOALS.find((g) => g.id === selectedGoal)
    const instructions = customInstructions.trim()
      ? customInstructions.trim()
      : goalObj?.text || 'Please analyze this code.'

    const ext = selectedFileName.split('.').pop() || 'text'
    const prompt = `📁 **File: \`${selectedFileName}\`**\n\n${instructions}\n\n\`\`\`${ext}\n${fileContent}\n\`\`\`\n`

    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedFile(true)
      setTimeout(() => setCopiedFile(false), 3000)
      onToast?.(`✓ Copied ${selectedFileName} to clipboard! Press Ctrl+V in ${serviceName}.com`)
      openCompanionWindow()
    } catch {
      onToast?.('Clipboard write permission denied. You can copy the preview below.')
    }
  }

  // Paste from clipboard into harvester
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        onToast?.('Clipboard is empty')
        return
      }
      setHarvestInput(text)
      const blocks = parseMarkdownCodeBlocks(text)
      setHarvestedBlocks(blocks)
      onToast?.(`Parsed ${blocks.length} code block(s) from clipboard`)
    } catch {
      onToast?.('Could not read clipboard. Please paste directly into the box.')
    }
  }

  // Parse harvest input whenever it changes
  const handleHarvestInputChange = (text) => {
    setHarvestInput(text)
    const blocks = parseMarkdownCodeBlocks(text)
    setHarvestedBlocks(blocks)
  }

  // Copy individual extracted code block
  const handleCopyBlock = async (block) => {
    try {
      await navigator.clipboard.writeText(block.code)
      setCopiedBlockId(block.id)
      setTimeout(() => setCopiedBlockId(null), 2000)
      onToast?.(`✓ Copied code block to clipboard`)
    } catch {
      onToast?.('Could not copy code to clipboard')
    }
  }

  // Download individual extracted code block
  const handleDownloadBlock = (block) => {
    const filename = customFileNames[block.id] || block.filename || `code_block.${block.language || 'txt'}`
    downloadFile(filename, block.code)
    onToast?.(`✓ Downloaded ${filename}`)
  }

  return (
    <div className="web-companion-studio">
      {/* Studio Header Banner */}
      <div className="web-companion-banner">
        <div className="companion-banner-info">
          <div className="companion-title-row">
            <span className="companion-icon">{serviceIcon}</span>
            <div className="companion-heading">
              <h3>{serviceName}.com Web Companion Studio</h3>
              <p>Dual-screen productivity bridge for Yogatik Web users</p>
            </div>
          </div>
          <div className="companion-badge-row">
            <span className="companion-badge live">
              <span className="status-dot online" /> Web Companion Active
            </span>
            {onSwitchService && (
              <button className="dock-switch-pill" onClick={onSwitchService} title={switchLabel}>
                {switchLabel}
              </button>
            )}
          </div>
        </div>

        <div className="companion-banner-actions">
          <button
            className="btn-primary companion-launch-btn"
            onClick={openCompanionWindow}
            title={`Launch ${serviceName}.com in a dedicated side-by-side companion window`}
          >
            <ExternalLink size={14} /> Launch {serviceName} Companion
          </button>
          <a
            href={serviceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="companion-tab-link"
            title="Open in new browser tab"
          >
            New Tab ↗
          </a>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="web-companion-tabs">
        <button
          className={`companion-tab-btn ${activeTab === 'send' ? 'active' : ''}`}
          onClick={() => setActiveTab('send')}
        >
          <Upload size={13} /> Send File & Context
        </button>
        <button
          className={`companion-tab-btn ${activeTab === 'harvest' ? 'active' : ''}`}
          onClick={() => setActiveTab('harvest')}
        >
          <Code size={13} /> Harvest Code Blocks{' '}
          {harvestedBlocks.length > 0 && <span className="tab-count">{harvestedBlocks.length}</span>}
        </button>
        <button
          className={`companion-tab-btn ${activeTab === 'api' ? 'active' : ''}`}
          onClick={() => setActiveTab('api')}
        >
          <Sparkles size={13} /> Direct In-App AI
        </button>
      </div>

      {/* Tab 1: Send File & Context */}
      {activeTab === 'send' && (
        <div className="companion-tab-content">
          <div className="companion-section-card">
            <div className="card-header-row">
              <h4>1. Select or Upload File</h4>
              {selectedFileName && <span className="file-tag">{selectedFileName} ({fileSizeStr})</span>}
            </div>

            <div className="file-drop-area" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Upload size={24} className="drop-icon" />
              <div className="drop-text">
                <strong>Click to choose a file from your computer</strong>
                <p>Supports JS, TS, JSX, Python, HTML, CSS, JSON, Markdown, Rust, Go, and more</p>
              </div>
            </div>

            {fileContent && (
              <div className="file-preview-box">
                <div className="preview-meta">
                  <span>📄 {selectedFileName}</span>
                  <span>{fileContent.split('\n').length} lines</span>
                </div>
                <pre className="preview-code">
                  <code>
                    {fileContent.slice(0, 320)}
                    {fileContent.length > 320 ? '\n... (trimmed in preview)' : ''}
                  </code>
                </pre>
              </div>
            )}
          </div>

          <div className="companion-section-card">
            <h4>2. Choose Analysis Goal or Custom Prompt</h4>
            <div className="goals-grid">
              {PROMPT_GOALS.map((goal) => (
                <button
                  key={goal.id}
                  className={`goal-btn ${selectedGoal === goal.id ? 'active' : ''}`}
                  onClick={() => setSelectedGoal(goal.id)}
                >
                  {goal.label}
                </button>
              ))}
            </div>

            <textarea
              className="companion-custom-input"
              rows={2}
              placeholder="Optional: Add specific instructions (e.g. 'Migrate this component to Tailwind CSS and add error boundaries')..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
            />
          </div>

          <div className="companion-action-bar">
            <button
              className="btn-primary copy-launch-btn"
              disabled={!fileContent.trim()}
              onClick={handleCopyAndLaunch}
            >
              {copiedFile ? (
                <>
                  <Check size={15} /> Copied! Press Ctrl+V in {serviceName}
                </>
              ) : (
                <>
                  <Copy size={15} /> Copy Formatted File & Open {serviceName}
                </>
              )}
            </button>
            <span className="action-hint">
              1-click copies syntax-highlighted code block to your clipboard and launches the companion window.
            </span>
          </div>
        </div>
      )}

      {/* Tab 2: Harvest Code Blocks */}
      {activeTab === 'harvest' && (
        <div className="companion-tab-content">
          <div className="companion-section-card">
            <div className="card-header-row">
              <h4>Paste {serviceName}'s Response</h4>
              <button className="small-btn" onClick={handlePasteFromClipboard}>
                <Copy size={12} /> Paste from Clipboard
              </button>
            </div>
            <textarea
              className="harvest-textarea"
              rows={4}
              placeholder={`Paste the response or code blocks generated by ${serviceName}.com here to automatically extract and download them as files...`}
              value={harvestInput}
              onChange={(e) => handleHarvestInputChange(e.target.value)}
            />
          </div>

          {harvestedBlocks.length > 0 ? (
            <div className="harvested-blocks-list">
              <div className="list-title-row">
                <h4>Extracted Code Blocks ({harvestedBlocks.length})</h4>
                <span className="list-hint">Ready to download or copy</span>
              </div>

              {harvestedBlocks.map((block) => (
                <div key={block.id} className="extracted-block-card">
                  <div className="block-meta">
                    <span className="lang-tag">{block.language}</span>
                    <span className="line-tag">{block.lines} lines</span>
                  </div>
                  <pre className="block-preview">
                    <code>
                      {block.code.slice(0, 260)}
                      {block.code.length > 260 ? '…' : ''}
                    </code>
                  </pre>
                  <div className="save-row">
                    <input
                      type="text"
                      className="path-input"
                      value={customFileNames[block.id] ?? block.filename}
                      onChange={(e) =>
                        setCustomFileNames({ ...customFileNames, [block.id]: e.target.value })
                      }
                      title="File name for download"
                    />
                    <button
                      className="small-btn"
                      onClick={() => handleCopyBlock(block)}
                      title="Copy code without markdown ticks"
                    >
                      {copiedBlockId === block.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedBlockId === block.id ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      className="small-btn btn-primary"
                      onClick={() => handleDownloadBlock(block)}
                      title="Download file directly to your downloads folder"
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="harvest-empty-state">
              <Code size={28} className="empty-icon" />
              <p>
                No code blocks parsed yet. Copy any response from {serviceName}.com containing{' '}
                <code>```language ... ```</code> and click <strong>Paste from Clipboard</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Direct In-App AI Alternative */}
      {activeTab === 'api' && (
        <div className="companion-tab-content">
          <div className="companion-section-card api-card">
            <div className="card-header-row">
              <h4>💬 Native In-App Chat Integration</h4>
              <span className="companion-badge live">Built into Yogatik</span>
            </div>
            <p className="api-description">
              You can chat with <strong>xAI Grok</strong> (Grok 2 / Grok Beta) or{' '}
              <strong>Google Gemini</strong> (Gemini 2.5 Flash / 1.5 Pro) directly inside Yogatik's main
              chat interface without leaving the browser tab.
            </p>
            <div className="api-benefits-grid">
              <div className="benefit-item">
                <strong>⚡ Instant Streaming</strong>
                <span>Direct token-by-token low latency responses</span>
              </div>
              <div className="benefit-item">
                <strong>🔍 200+ Web Tools</strong>
                <span>Search, live calculator, code execution & charts</span>
              </div>
              <div className="benefit-item">
                <strong>💾 Persistent History</strong>
                <span>Searchable chat transcripts, sessions & export</span>
              </div>
              <div className="benefit-item">
                <strong>🔒 Private & Direct</strong>
                <span>Keys stored securely in your browser's encrypted storage</span>
              </div>
            </div>
            <div className="api-cta-row">
              <a href="/settings.html" className="btn-primary configure-keys-btn">
                <Sparkles size={14} /> Configure API Keys in Settings
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Desktop Download Callout */}
      <div className="desktop-callout-footer">
        <div className="callout-content">
          <Laptop size={16} className="callout-icon" />
          <span>
            Want zero-copy direct iframe embedding with local file system read/write?
          </span>
        </div>
        <a href="/platforms.html" className="desktop-download-link">
          Download Yogatik 7.1.0 Desktop ↗
        </a>
      </div>
    </div>
  )
}
