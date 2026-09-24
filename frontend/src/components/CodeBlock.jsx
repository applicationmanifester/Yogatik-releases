import React, { useState, lazy, Suspense } from 'react'
import { Copy, Check, Eye, Play, Terminal, X, Pencil, FileDown, GitCommit } from 'lucide-react'
import { retryImport } from '../pwa'
import { DiffReviewModal } from './DiffReviewModal'

/**
 * Prism + its theme are ~600KB (225KB gzipped) and most conversations never
 * contain a code block, so they must not be in the first paint on a phone.
 * Until the chunk lands the code shows as plain monospace — readable, copyable,
 * never a blank gap.
 */
const PRE = {
  margin: 0, padding: 12, background: '#1e1e2e', color: '#cdd6f4',
  fontFamily: 'monospace', fontSize: 13, overflowX: 'auto', whiteSpace: 'pre',
}
const Highlighted = lazy(retryImport(async () => {
  const [{ default: SyntaxHighlighter }, { oneDark }] = await Promise.all([
    import('react-syntax-highlighter/dist/esm/prism-async'),
    import('react-syntax-highlighter/dist/esm/styles/prism'),
  ])
  return {
    default: ({ language, children }) => (
      <SyntaxHighlighter style={oneDark} language={language} PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0 }}>
        {children}
      </SyntaxHighlighter>
    ),
  }
}))

export function CodeBlock({ children, className, onOpenArtifact }) {
  const [copied, setCopied] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)

  const rawLang = className?.replace('language-', '')?.toLowerCase()
  const lang = rawLang || 'text'
  const initialCode = String(children).replace(/\n$/, '')
  const [code, setCode] = useState(initialCode)

  React.useEffect(() => {
    if (!isEditing) {
      setCode(String(children).replace(/\n$/, ''))
    }
  }, [children, isEditing])

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isMermaid = rawLang === 'mermaid' || (!rawLang && (code.startsWith('graph ') || code.startsWith('flowchart ') || code.startsWith('sequenceDiagram') || code.startsWith('classDiagram') || code.startsWith('erDiagram')))
  const isPreviewable = Boolean(rawLang && ['html', 'svg', 'xml', 'javascript', 'jsx', 'css'].includes(rawLang))
  const isExecutable = Boolean(rawLang && ['javascript', 'js', 'json', 'html', 'python', 'py', 'sh', 'bash', 'zsh', 'shell', 'powershell', 'cmd'].includes(rawLang) && (code.includes('\n') || code.length > 5))
  const isCsv = rawLang === 'csv' || (code.includes(',') && code.includes('\n') && code.split('\n')[0].includes(','))
  const isPpt = rawLang === 'pptx' || rawLang === 'ppt' || code.includes('.pptx') || code.includes('# Slide 1') || code.includes('Slide 1:')

  const handleDownloadMermaid = async () => {
    try {
      const { diagramTool } = await import('../tools/diagram')
      const res = await diagramTool.execute({ code })
      if (res.success && res.svg) {
        const blob = new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `diagram_${Date.now().toString(36)}.svg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
    } catch {}
    // Fallback: save code
    handleDownloadFile()
  }

  const handleDownloadPpt = async () => {
    try {
      const { exportPptx } = await import('../tools/independentTools')
      await exportPptx(code, 'presentation.pptx', true)
    } catch {
      // Fallback
      const blob = new Blob([code], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'presentation.txt'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const handleDownloadCsv = () => {
    const blob = new Blob([code], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'spreadsheet_data.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadFile = () => {
    const extMap = { javascript: 'js', python: 'py', json: 'json', html: 'html', css: 'css', markdown: 'md', sql: 'sql', sh: 'sh', bash: 'sh', powershell: 'ps1', cmd: 'bat' }
    const ext = extMap[lang] || lang || 'txt'
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code_${Date.now().toString(36)}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleOpenArtifact = () => {
    if (onOpenArtifact) {
      onOpenArtifact({ title: `${lang.toUpperCase()} Snippet`, language: lang, code })
    }
  }

  const handleRunCode = async () => {
    setExecuting(true)
    setExecResult(null)
    try {
      const lowerLang = lang.toLowerCase()
      if (['bash', 'sh', 'zsh', 'shell', 'powershell', 'cmd'].includes(lowerLang)) {
        if (window?.electron?.exec) {
          try {
            const res = await window.electron.exec(code)
            setExecResult({ output: res?.stdout || res?.output || (res?.exitCode === 0 ? 'Command executed successfully.' : `Exit code: ${res?.exitCode}`) })
          } catch (e) {
            setExecResult({ error: `Terminal Execution Error: ${e.message}` })
          }
        } else {
          setExecResult({ output: `[Browser Sandbox Emulation]\n$ ${code.trim().split('\n').join('\n$ ')}\n\n(Install desktop app or enable terminal bridge for direct OS execution)` })
        }
      } else if (['javascript', 'js', 'json'].includes(lowerLang)) {
        let logs = []
        const customConsole = {
          log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
          error: (...args) => logs.push('❌ Error: ' + args.map(a => String(a)).join(' ')),
          warn: (...args) => logs.push('⚠️ Warn: ' + args.map(a => String(a)).join(' ')),
          info: (...args) => logs.push(args.map(a => String(a)).join(' ')),
        }
        let returned = undefined
        try {
          const fn = new Function('console', code)
          returned = fn(customConsole)
        } catch (e) {
          logs.push(`Runtime Error: ${e.message}`)
        }
        let finalOut = logs.join('\n')
        if (returned !== undefined) {
          finalOut += (finalOut ? '\n\nReturned value: ' : 'Returned value: ') + (typeof returned === 'object' ? JSON.stringify(returned, null, 2) : String(returned))
        }
        setExecResult({ output: finalOut || '(Code executed cleanly with 0 console logs)' })
      } else if (['python', 'py'].includes(lowerLang)) {
        // Transpile simple Python statements (print, math, loops) for browser execution
        let logs = []
        let jsCode = code
          .replace(/print\((.*?)\)/g, 'console.log($1)')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false')
          .replace(/None/g, 'null')
          .replace(/for (\w+) in range\((\d+)\):/g, 'for (let $1 = 0; $1 < $2; $1++) {')
          .replace(/#.*/g, '')

        const customConsole = {
          log: (...args) => logs.push(args.map(a => String(a)).join(' ')),
        }
        try {
          const fn = new Function('console', jsCode)
          fn(customConsole)
          setExecResult({ output: logs.join('\n') || '(Python code executed cleanly)' })
        } catch (e) {
          setExecResult({ output: `Python Evaluator output:\n${logs.join('\n')}\n(Syntax/Runtime: ${e.message})` })
        }
      } else if (['html', 'xml', 'svg'].includes(lowerLang)) {
        if (onOpenArtifact) {
          onOpenArtifact({ title: 'HTML Live Sandbox', language: lang, code })
        }
        setExecResult({ output: 'Rendered inside the interactive Canvas Preview panel.' })
      } else {
        setExecResult({ output: `Ran ${lang} code block.` })
      }
    } catch (err) {
      setExecResult({ error: err.message || String(err) })
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="code-block-container" style={{ margin: '12px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}>
      <div className="code-block-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary, #1e1e2e)', padding: '6px 12px' }}>
        <span className="code-lang-badge" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary, #a6adc8)' }}>{lang}</span>
        <div className="code-block-actions" style={{ display: 'flex', gap: 6 }}>
          <button
            className="code-block-btn"
            onClick={() => setIsEditing(v => !v)}
            title="Edit code before running"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: isEditing ? 'var(--accent-color, #ff6b35)' : 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            <Pencil size={11} /> {isEditing ? 'Editing' : 'Edit'}
          </button>
          {isExecutable && (
            <button
              className="code-block-btn"
              onClick={handleRunCode}
              disabled={executing}
              title="Execute code live in browser" aria-label="Run this code"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent-color, #ff6b35)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <Play size={11} /> {executing ? 'Running…' : 'Run Code'}
            </button>
          )}
          {isPpt && (
            <button
              className="code-block-btn"
              onClick={handleDownloadPpt}
              title="Download PowerPoint Presentation (.pptx)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg, #ff6b35, #ff8c42)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <FileDown size={11} /> Download .pptx
            </button>
          )}
          {isCsv && (
            <button
              className="code-block-btn"
              onClick={handleDownloadCsv}
              title="Download CSV Spreadsheet"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent-color, #ff6b35)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <FileDown size={11} /> Download CSV
            </button>
          )}
          {isMermaid && (
            <button
              className="code-block-btn"
              onClick={handleDownloadMermaid}
              title="Download Mermaid Diagram as SVG"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg, #0284c7, #38bdf8)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <FileDown size={11} /> Download SVG
            </button>
          )}
          {!isPpt && !isCsv && !isMermaid && code.length > 5 && (
            <button
              className="code-block-btn"
              onClick={handleDownloadFile}
              title={`Download as .${lang || 'txt'} file`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <FileDown size={11} /> Download
            </button>
          )}
          {code.length > 5 && (
            <button
              className="code-block-btn"
              onClick={() => setShowDiffModal(true)}
              title="Review visual diff against original or file"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <GitCommit size={11} /> Diff
            </button>
          )}
          {onOpenArtifact && (
            <button className="code-block-btn" onClick={handleOpenArtifact} title="Open in Canvas Artifact sandbox">
              <Eye size={11} /> {isPreviewable ? 'Preview' : 'Artifact'}
            </button>
          )}
          <button className="code-block-btn" onClick={copy} title="Copy code" aria-label="Copy code">
            {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
      </div>
      {isEditing ? (
        <textarea
          aria-label="Edit code"
          value={code}
          onChange={e => setCode(e.target.value)}
          style={{ width: '100%', minHeight: 120, padding: 12, background: '#181825', color: '#cdd6f4', fontFamily: 'monospace', fontSize: 13, border: 'none', outline: 'none', resize: 'vertical' }}
        />
      ) : (
        <Suspense fallback={<pre style={PRE}>{code}</pre>}>
          <Highlighted language={lang}>{code}</Highlighted>
        </Suspense>
      )}
      {execResult && (
        <div className="code-exec-output" style={{ background: '#11111b', borderTop: '1px solid rgba(255,255,255,0.1)', padding: 10, fontSize: 12, fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, color: '#cdd6f4', fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Terminal size={12} /> Execution Output</span>
            <button onClick={() => setExecResult(null)} style={{ background: 'none', border: 'none', color: '#a6adc8', cursor: 'pointer' }}><X size={12} /></button>
          </div>
          {execResult.output && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#a6e3a1' }}>{execResult.output}</pre>
          )}
          {execResult.error && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#f38ba8' }}>{execResult.error}</pre>
          )}
        </div>
      )}
      {showDiffModal && (
        <DiffReviewModal
          isOpen={showDiffModal}
          filePath={(() => {
            const match = code.match(/(?:\/\/|#|\/\*)\s*(?:filepath|file):\s*([^\r\n*]+)/i)
            return match ? match[1].trim() : `${lang.toUpperCase()} Snippet`
          })()}
          originalCode={initialCode}
          modifiedCode={code}
          onClose={() => setShowDiffModal(false)}
          onAccept={(updatedCode) => {
            setCode(updatedCode)
          }}
        />
      )}
    </div>
  )
}
