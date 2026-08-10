import React, { useState } from 'react'
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
      printWin.document.write(`<!DOCTYPE html><html><head><title>${defaultTitle}</title><style>body{font-family:sans-serif;padding:30px;line-height:1.6;color:#222;}</style></head><body><pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre><script>window.print();</script></body></html>`)
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

const MessageBubble = React.memo(function MessageBubble({
   msg, onTTS, onOpenArtifact, onRegenerate, onEdit, onRetry, showToolCards = true,
}) {
   const [copied, setCopied] = useState(false)
   const [showExportMenu, setShowExportMenu] = useState(false)
   // Default EXPANDED: collapsing by default hid whole answers behind "Show more".
   const [isExpanded, setIsExpanded] = useState(true)
   let reasoning = '', answer = msg.content

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — nothing useful to say */ }
  }

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
              <button
                className="icon-btn"
                onClick={() => setShowExportMenu(v => !v)}
                title="Download as Word / PDF / MD"
                aria-label="Download message"
              >
                <Download size={12} />
              </button>
              {showExportMenu && (
                <div
                  className="export-dropdown"
                  style={{
                    position: 'absolute', top: '100%', right: 0, zIndex: 100,
                    background: 'var(--bg-secondary, #1e1e2e)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                    borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140,
                  }}
                >
                  <button
                    className="dropdown-item"
                    onClick={() => { triggerDownload(msg.content, 'doc', 'document'); setShowExportMenu(false) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <FileText size={12} /> Word Document (.doc)
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { triggerDownload(msg.content, 'ppt', 'presentation'); setShowExportMenu(false) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <FileText size={12} /> PowerPoint (.ppt)
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { triggerDownload(msg.content, 'csv', 'data'); setShowExportMenu(false) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <FileText size={12} /> CSV Spreadsheet (.csv)
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { triggerDownload(msg.content, 'pdf', 'document'); setShowExportMenu(false) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <FileDown size={12} /> PDF (.pdf)
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => { triggerDownload(msg.content, 'md', 'document'); setShowExportMenu(false) }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, textAlign: 'left', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={12} /> Markdown (.md)
                  </button>
                </div>
              )}
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
      {msg.trace?.length > 0 && (
        <details className="activity-trace">
          <summary>How I answered this — {msg.trace.length} step{msg.trace.length === 1 ? '' : 's'}</summary>
          <ol>
            {msg.trace.map((s, i) => {
              const Icon = TOOL_ICONS[s.tool] || Wrench
              const arg = s.args && Object.keys(s.args).length
                ? JSON.stringify(s.args).replace(/^{|}$/g, '').slice(0, 120)
                : ''
              const mark = s.status === 'error' ? '✕' : s.status === 'done' ? '✓' : '…'
              return (
                <li key={i} className={`trace-step trace-${s.status}`}>
                  <Icon size={11} /> <span className="trace-tool">{s.tool}</span>
                  {arg && <span className="trace-args">{arg}</span>}
                  <span className="trace-mark">{mark}</span>
                </li>
              )
            })}
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
         <>
           {!isExpanded && (
             <>
               <ReactMarkdown components={{
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
                           triggerDownload(msg.content, format, cleanLabel.replace(/\.(rtf|doc|docx|pdf)$/i, '') || 'document')
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
               }}>
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
               <ReactMarkdown components={{
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
                           triggerDownload(msg.content, format, cleanLabel.replace(/\.(rtf|doc|docx|pdf)$/i, '') || 'document')
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
               }}>
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
         </>
       ) : (
         <div className="message-content">
            <ReactMarkdown components={{
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
                        triggerDownload(msg.content, format, cleanLabel.replace(/\.(rtf|doc|docx|pdf)$/i, '') || 'document')
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
            }}>{answer}</ReactMarkdown>
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
