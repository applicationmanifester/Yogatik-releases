import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'

export function ArenaView({ arenaData, onOpenArtifact, onPickResponse, onRetry }) {
  if (!arenaData || !arenaData.modelA || !arenaData.modelB) return null

  const { modelA, modelB, responseA, responseB, streamingA, streamingB } = arenaData
  const retryBtn = (side) => onRetry && (
    <button onClick={() => onRetry(side)}
      style={{ display: 'block', width: '100%', marginTop: 12, padding: '6px 12px', background: 'transparent', color: 'var(--accent-color, #ff6b35)', border: '1px solid var(--accent-color, #ff6b35)', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
      ↻ Retry Model {side}
    </button>
  )

  const mdComponents = {
    a({ node, href, children, ...props }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link" {...props}>
          {children}
        </a>
      )
    },
    pre({ children }) {
      return <>{children}</>
    },
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const isMultiLine = String(children || '').includes('\n')
      const isBlock = !inline && (Boolean(match) || isMultiLine)
      return isBlock ? (
        <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>
      ) : (
        <code className={className} {...props}>{children}</code>
      )
    }
  }

  return (
    <div className="arena-container" style={{ margin: '16px 0', padding: 16, background: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="arena-header" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="arena-badge" style={{ color: 'var(--accent-color, #ff6b35)', fontWeight: 600, fontSize: 13 }}>
          ⚔️ Arena Side-by-Side Comparison Mode
        </span>
      </div>
      <div className="arena-grid" style={{ display: 'grid', gap: 16 }}>
        <div className="arena-column" style={{ background: '#181825', borderRadius: 8, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="arena-col-header" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#38bdf8', fontSize: 13 }}>
            <span><strong>Model A:</strong> {modelA}</span>
            {streamingA && <span className="arena-status pulsing" style={{ fontSize: 11, color: '#f59e0b' }}>Streaming...</span>}
          </div>
          <div className="arena-col-body" style={{ minHeight: 120, fontSize: 14, lineHeight: 1.6, color: '#e2e8f0' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {responseA || '_Waiting for response..._'}
            </ReactMarkdown>
          </div>
          {!streamingA && responseA && !responseA.startsWith('Error:') && onPickResponse && (
            <button
              onClick={() => onPickResponse('A', responseA, modelA)}
              style={{ display: 'block', width: '100%', marginTop: 12, padding: '6px 12px', background: 'var(--accent-color, #ff6b35)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
            >
              ✓ Choose Response A
            </button>
          )}
          {!streamingA && responseA?.startsWith('Error:') && retryBtn('A')}
        </div>

        <div className="arena-column" style={{ background: '#181825', borderRadius: 8, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="arena-col-header" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a855f7', fontSize: 13 }}>
            <span><strong>Model B:</strong> {modelB}</span>
            {streamingB && <span className="arena-status pulsing" style={{ fontSize: 11, color: '#f59e0b' }}>Streaming...</span>}
          </div>
          <div className="arena-col-body" style={{ minHeight: 120, fontSize: 14, lineHeight: 1.6, color: '#e2e8f0' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {responseB || '_Waiting for response..._'}
            </ReactMarkdown>
          </div>
          {!streamingB && responseB && !responseB.startsWith('Error:') && onPickResponse && (
            <button
              onClick={() => onPickResponse('B', responseB, modelB)}
              style={{ display: 'block', width: '100%', marginTop: 12, padding: '6px 12px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
            >
              ✓ Choose Response B
            </button>
          )}
          {!streamingB && responseB?.startsWith('Error:') && retryBtn('B')}
        </div>
      </div>
    </div>
  )
}
