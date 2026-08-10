import React, { useState, lazy, Suspense } from 'react'
import { Copy, Check, Eye, Play, Terminal, X, Pencil, FileDown } from 'lucide-react'
import { retryImport } from '../pwa'

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

  const rawLang = className?.replace('language-', '')?.toLowerCase()
  const lang = rawLang || 'text'
  const initialCode = String(children).replace(/\n$/, '')
  const [code, setCode] = useState(initialCode)

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isPreviewable = Boolean(rawLang && ['html', 'svg', 'xml', 'javascript', 'jsx', 'css'].includes(rawLang))
  const isExecutable = Boolean(rawLang && ['javascript', 'js', 'json', 'html', 'python', 'py'].includes(rawLang) && (code.includes('\n') || code.length > 20))
  const isCsv = rawLang === 'csv' || (code.includes(',') && code.includes('\n') && code.split('\n')[0].includes(','))

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
      if (['javascript', 'js', 'json'].includes(lowerLang)) {
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
          {isPreviewable && onOpenArtifact && (
            <button className="code-block-btn" onClick={handleOpenArtifact} title="Open in Canvas Sandbox">
              <Eye size={11} /> Preview
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
    </div>
  )
}
