import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Volume2, Wrench, Copy, Check, RefreshCw, Pencil, AlertTriangle, FileDown, FileText, Download } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { exportPptx } from '../tools/independentTools'
import { ToolResultCard, TOOL_ICONS } from './ToolResultCard'

/**
 * Reasoning models (nemotron, r1, …) wrap their scratch-work in <think>…</think>.
 * react-markdown drops the tag but the text used to render as a blank preview, or
 * the whole answer sat inside it. Pull reasoning out so the answer renders plainly
 * and the reasoning goes in a collapsible panel. Handles an unclosed <think> while
 * the reply is still streaming.
 */
function splitReasoning(content) {
  if (typeof content !== 'string') return { reasoning: '', answer: content }
  let reasoning = ''
  const answer = content
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_, r) => { reasoning += r + '\n'; return '' })
    .replace(/<think>([\s\S]*)$/i, (_, r) => { reasoning += r; return '' }) // still streaming
    .trim()
  return { reasoning: reasoning.trim(), answer }
}

/** "just now", "4m", "2h", then a date. */
function relativeTime(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

function triggerDownload(text, format = 'doc', defaultTitle = 'Document') {
  let content = text
  let mimeType = 'text/plain'
  let ext = format

  if (format === 'ppt' || format === 'pptx' || format === 'presentation') {
    exportPptx(text, defaultTitle, true)
    return
  } else if (format === 'csv') {
    ext = 'csv'
    mimeType = 'text/csv'
    if (text.includes('|')) {
      const lines = text.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---'))
      content = '\uFEFF' + lines.map(l => l.split('|').slice(1, -1).map(c => `"${c.trim().replace(/"/g, '""')}"`).join(',')).join('\n')
    } else {
      content = '\uFEFF' + text
    }
  } else if (format === 'doc' || format === 'docx' || format === 'word' || format === 'rtf') {
    ext = 'doc'
    mimeType = 'application/msword'
    content = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${defaultTitle}</title><style>body{font-family:'Calibri','Segoe UI',sans-serif;font-size:11pt;line-height:1.5;color:#222;margin:1in;}h1{font-size:18pt;color:#1f4e78;}h2{font-size:14pt;color:#2e75b6;}p{margin-bottom:6pt;}</style></head><body>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</body></html>`
  } else if (format === 'html') {
    ext = 'html'
    mimeType = 'text/html'
    content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${defaultTitle}</title><style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:0 auto;color:#222;}</style></head><body>${text.replace(/\n/g, '<br>')}</body></html>`
  } else if (format === 'md') {
    ext = 'md'
    mimeType = 'text/markdown'
  } else if (format === 'pdf') {
    if (window.html2pdf) {
      const container = document.createElement('div')
      container.innerHTML = text.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
      container.style.cssText = 'font-family:Inter,sans-serif;padding:30px;color:#1a2332;font-size:13px;line-height:1.6'
      window.html2pdf().from(container).set({ margin: 10, filename: `${defaultTitle}.pdf`, jsPDF: { unit: 'mm', format: 'a4' } }).save()
      return
    }
    const printWin = window.open('', '_blank')
    if (printWin) {
      printWin.document.write(`<!DOCTYPE html><html><head><title>${defaultTitle}</title><style>body{font-family:sans-serif;padding:30px;line-height:1.6;color:#222;}</style></head><body><pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre><script>window.print();<\/script></body></html>`)
      printWin.document.close()
    }
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${defaultTitle.replace(/[^a-z0-9_-]/gi, '_')}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Build a stable ReactMarkdown `components` map. Defined once per MessageBubble
 * instance (not inline per render), so React.memo can actually skip re-renders.
 */
function useMarkdownComponents(msgContent, onOpenArtifact) {
  return useMemo(() => ({
    a({ node, href, children, ...props }) {
      const rawLabel = String(children || '').trim()
      const cleanLabel = rawLabel.replace(/^download\s+/i, '').trim()
      const isDocLink = href?.match(/\.(rtf|doc|docx|pdf|csv|html|txt)($|\?)/i) || rawLabel.match(/\.(rtf|doc|docx|pdf|csv|html|txt)\b/i)
      if (isDocLink || href?.startsWith('data:') || href?.startsWith('blob:')) {
        const format = rawLabel.match(/\.(rtf|doc|docx)/i) ? 'doc' : rawLabel.match(/\.pdf/i) ? 'pdf' : 'doc'
        return (
          <button
            className="inline-download-btn"
            onClick={(e) => {
              e.preventDefault()
              triggerDownload(msgContent, format, cleanLabel.replace(/\.(rtf|doc|docx|pdf)$/i, '') || 'document')
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent-color, #ff6b35)', color: '#fff',
              border: 'none', padding: '4px 10px', borderRadius: 6,
              fontWeight: 600, fontSize: 12, cursor: 'pointer', margin: '4px 0',
            }}
          >
            <FileDown size={14} /> Download {cleanLabel}
          </button>
        )
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    },
    code({ node, inline, className, children, ...props }) {
      return !inline ? (
        <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>
      ) : (
        <code className={className} {...props}>{children}</code>
      )
    }
  // msgContent changes when the message changes, onOpenArtifact is stable
  }), [msgContent, onOpenArtifact])
}

const MessageBubble = React.memo(function MessageBubble({
   msg, onTTS, onOpenArtifact, onRegenerate, onEdit, onRetry, showToolCards = true,
}) {
   const [copied, setCopied] = useState(false)
   const [showExportMenu, setShowExportMenu] = useState(false)
   // Default EXPANDED: collapsing by default hid whole answers behind "Show more".
   const [isExpanded, setIsExpanded] = useState(true)
   const exportMenuRef = useRef(null)

  // Close export dropdown when clicking outside it
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — nothing useful to say */ }
  }, [msg.content])

  // Build stable markdown components config — avoids new object on every render
  const markdownComponents = useMarkdownComponents(msg.content, onOpenArtifact)

  const formattedModelName = useMemo(() => {
    const rawModel = msg.model || ''
    const rawProv = msg.provider || ''
    const mName = rawModel ? rawModel.split('/').pop() : ''
    const pName = rawProv === 'nvidia' ? 'NVIDIA (Free)'
      : rawProv === 'openrouter' ? 'OpenRouter'
      : rawProv === 'groq' ? 'Groq'
      : rawProv === 'openai' ? 'OpenAI'
      : rawProv === 'gemini' ? 'Gemini'
      : rawProv === 'local' ? 'On-device Model'
      : rawProv
    if (pName && mName) return `${pName} · ${mName}`
    if (mName) return mName
    if (pName) return pName
    return 'AI Model'
  }, [msg.model, msg.provider])

  let reasoning = '', answer = msg.content

  // Failed turns are shown attached to the message, never stored as if the
  // assistant had said them.
  if (msg.error) {
    return (
      <div className="message assistant message-failed" role="alert">
        <div className="message-error">
          <AlertTriangle size={13} />
          <div className="message-error-text">{msg.error}</div>
          {onRetry && (
            <button className="small-btn" onClick={onRetry}>
              <RefreshCw size={11} /> Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`message ${msg.role}`}>
      <div className="message-role">
        <span className="message-who">{msg.role === 'user' ? 'You' : 'Yogatik'}</span>
        {msg.role === 'assistant' && (
          <span className="msg-model-badge" title={`Generated by ${formattedModelName}`}>
            {formattedModelName}
          </span>
        )}
        {msg.createdAt && <time className="message-time" dateTime={new Date(msg.createdAt).toISOString()}>{relativeTime(msg.createdAt)}</time>}

        <span className="message-actions" style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={copy} title="Copy" aria-label="Copy message">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {msg.role === 'assistant' && (
            <>
              <button className="icon-btn" onClick={() => onTTS(msg.content)} title="Read aloud" aria-label="Read aloud">
                <Volume2 size={12} />
              </button>
              <span ref={exportMenuRef} style={{ position: 'relative' }}>
                <button
                  className="icon-btn"
                  onClick={() => setShowExportMenu(v => !v)}
                  title="Download as Word / PDF / MD"
                  aria-label="Download message"
                  aria-haspopup="true"
                  aria-expanded={showExportMenu}
                >
                  <Download size={12} />
                </button>
                {showExportMenu && (
                  <div
                    className="export-dropdown"
                    role="menu"
                    style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 100,
                      background: 'var(--bg-secondary, #1e1e2e)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                      borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140,
                    }}
                  >
                    {[
                      { fmt: 'doc',          label: 'Word Document (.doc)',    icon: <FileText size={12} />,  title: 'document' },
                      { fmt: 'ppt',          label: 'PowerPoint (.ppt)',       icon: <FileText size={12} />,  title: 'presentation' },
                      { fmt: 'csv',          label: 'CSV Spreadsheet (.csv)',  icon: <FileText size={12} />,  title: 'data' },
                      { fmt: 'pdf',          label: 'PDF (.pdf)',              icon: <FileDown size={12} />,  title: 'document' },
                      { fmt: 'md',           label: 'Markdown (.md)',          icon: <Download size={12} />,  title: 'document' },
                    ].map(({ fmt, label, icon, title }) => (
                      <button
                        key={fmt}
                        role="menuitem"
                        className="dropdown-item"
                        onClick={() => { triggerDownload(msg.content, fmt, title); setShowExportMenu(false) }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            </>
          )}
          {msg.role === 'assistant' && onRegenerate && (
            <button className="icon-btn" onClick={onRegenerate} title="Regenerate" aria-label="Regenerate this reply">
              <RefreshCw size={12} />
            </button>
          )}
          {msg.role === 'user' && onEdit && (
            <button className="icon-btn" onClick={() => onEdit(typeof msg.content === 'string' ? msg.content : '')}
              title="Edit this message — earlier turns branch into a new chat, the original is kept"
              aria-label="Edit this message">
              <Pencil size={12} />
            </button>
          )}
        </span>
      </div>

      {showToolCards && msg.toolResults && Object.keys(msg.toolResults).length > 0 && (
        <div className="tool-results">
          {Object.entries(msg.toolResults).map(([tool, result]) => (
            <ToolResultCard key={tool} tool={tool} result={result} />
          ))}
        </div>
      )}
      {msg.toolsUsed?.length > 0 && (
        <div className="tools-used">
          {msg.toolsUsed.map(t => {
            const Icon = TOOL_ICONS[t] || Wrench
            return <span key={t} className="tool-chip"><Icon size={10} /> {t}</span>
          })}
        </div>
      )}
      {msg.role === 'assistant' && (
        <details className="activity-trace">
          <summary>Steps, thoughts & actions taken ({msg.trace?.length || 1} step{(msg.trace?.length || 1) === 1 ? '' : 's'})</summary>
          <ol>
            {msg.trace?.length > 0 ? (
              msg.trace.map((s, i) => {
                const Icon = TOOL_ICONS[s.tool] || Wrench
                const arg = s.args && Object.keys(s.args).length
                  ? JSON.stringify(s.args).replace(/^{|}$/g, '').slice(0, 180)
                  : ''
                const mark = s.status === 'error' ? '✕ Failed' : s.status === 'done' ? '✓ Completed' : '… In progress'
                return (
                  <li key={i} className={`trace-step trace-${s.status}`}>
                    <Icon size={11} /> <span className="trace-tool">Step {i + 1}: Executed {s.tool}</span>
                    {arg && <div className="trace-args" style={{ fontSize: '10.5px', opacity: 0.85, marginTop: '2px' }}>Input: {arg}</div>}
                    <span className="trace-mark" style={{ fontSize: '10px', marginLeft: 'auto', fontWeight: 600 }}>{mark}</span>
                  </li>
                )
              })
            ) : (
              <li className="trace-step trace-done">
                <Wrench size={11} /> <span className="trace-tool">Step 1: Direct response generation ({formattedModelName})</span>
                <span className="trace-mark" style={{ fontSize: '10px', marginLeft: 'auto', fontWeight: 600 }}>✓ Completed</span>
              </li>
            )}
          </ol>
        </details>
      )}
      {msg.image && (
        <img src={msg.image} alt="Attached image" className="msg-image"
          onClick={() => window.open(msg.image, '_blank', 'noopener')} />
      )}
      {(() => { const s = splitReasoning(msg.content); reasoning = s.reasoning; answer = s.answer; return null })()}
      {reasoning && (
        <details className="reasoning-panel">
          <summary>Thinking</summary>
          <ReactMarkdown>{reasoning}</ReactMarkdown>
        </details>
      )}
      {/* A successful turn with no visible answer (e.g. reasoning-only) must not
          render blank — say so instead of looking broken. */}
      {msg.role === 'assistant' && typeof answer === 'string' && !answer && (
        <div className="message-content message-empty">
          {reasoning ? '(The model returned only reasoning — no final answer.)'
                     : '(The model returned an empty response. Try Regenerate or a stronger model.)'}
        </div>
      )}
       {/* Check if message content is long enough to warrant collapsing */}
       {typeof answer === 'string' && answer.length > 500 && msg.role === 'assistant' ? (
         <div className="message-content">
           {!isExpanded && (
             <>
               <ReactMarkdown components={markdownComponents}>
                 {answer.substring(0, 500)}...
               </ReactMarkdown>
               <button
                 className="message-toggle-btn"
                 onClick={() => setIsExpanded(true)}
               >
                 Show more
               </button>
             </>
           )}
           {isExpanded && (
             <>
               <ReactMarkdown components={markdownComponents}>
                 {answer}
               </ReactMarkdown>
               <button
                 className="message-toggle-btn"
                 onClick={() => setIsExpanded(false)}
               >
                 Show less
               </button>
             </>
           )}
         </div>
        ) : (
         <div className="message-content">
            <ReactMarkdown components={markdownComponents}>{answer}</ReactMarkdown>
          </div>
        )}
      {msg.sources?.length > 0 && (
        <div className="sources">
          <div className="sources-title">Sources</div>
          {msg.sources.filter(s => s.url).map((s, i) => (
            <div key={i} className="source-item">
              <a href={s.url} target="_blank" rel="noopener">{s.title || s.url}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export { MessageBubble }
