import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Volume2, Wrench } from 'lucide-react'
import { CodeBlock } from './CodeBlock'
import { ToolResultCard, TOOL_ICONS } from './ToolResultCard'

const MessageBubble = React.memo(function MessageBubble({ msg, onTTS, onOpenArtifact }) {
  return (
    <div className={`message ${msg.role}`}>
      <div className="message-role">
        {msg.role === 'user' ? 'You' : 'Yogatik'}
        {msg.role === 'assistant' && (
          <button className="icon-btn tts-btn" onClick={() => onTTS(msg.content)} title="Read aloud">
            <Volume2 size={12} />
          </button>
        )}
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
