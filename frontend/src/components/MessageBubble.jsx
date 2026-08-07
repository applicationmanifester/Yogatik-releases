import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Volume2, Wrench, Copy, Check, RefreshCw, Pencil, AlertTriangle } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { ToolResultCard, TOOL_ICONS } from './ToolResultCard'

/** "just now", "4m", "2h", then a date. */
function relativeTime(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

const MessageBubble = React.memo(function MessageBubble({
  msg, onTTS, onOpenArtifact, onRegenerate, onEdit, onRetry,
}) {
  const [copied, setCopied] = useState(false)

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

        <span className="message-actions">
          <button className="icon-btn" onClick={copy} title="Copy" aria-label="Copy message">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {msg.role === 'assistant' && (
            <button className="icon-btn" onClick={() => onTTS(msg.content)} title="Read aloud" aria-label="Read aloud">
              <Volume2 size={12} />
            </button>
          )}
          {msg.role === 'assistant' && onRegenerate && (
            <button className="icon-btn" onClick={onRegenerate} title="Regenerate" aria-label="Regenerate this reply">
              <RefreshCw size={12} />
            </button>
          )}
          {msg.role === 'user' && onEdit && (
            <button className="icon-btn" onClick={() => onEdit(msg.content)} title="Edit and resend" aria-label="Edit and resend">
              <Pencil size={12} />
            </button>
          )}
        </span>
      </div>

      {msg.toolResults && Object.keys(msg.toolResults).length > 0 && (
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
      <div className="message-content">
        <ReactMarkdown components={{
          code({ node, inline, className, children, ...props }) {
            return !inline ? (
              <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>
            ) : (
              <code className={className} {...props}>{children}</code>
            )
          }
        }}>{msg.content}</ReactMarkdown>
      </div>
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
