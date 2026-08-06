import React from 'react'
import ReactMarkdown from 'react-markdown'
import { CodeBlock } from './CodeBlock'

export function ArenaView({ arenaData, onOpenArtifact }) {
  if (!arenaData || !arenaData.modelA || !arenaData.modelB) return null

  const { modelA, modelB, responseA, responseB, streamingA, streamingB } = arenaData

  return (
    <div className="arena-container">
      <div className="arena-header">
        <span className="arena-badge">⚔️ Arena Side-by-Side Comparison Mode</span>
      </div>
      <div className="arena-grid">
        <div className="arena-column">
          <div className="arena-col-header">
            <strong>Model A:</strong> {modelA}
            {streamingA && <span className="arena-status pulsing">Streaming...</span>}
          </div>
          <div className="arena-col-body">
            <ReactMarkdown components={{
              code({ node, inline, className, children, ...props }) {
                return !inline ? (
                  <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>
                ) : (
                  <code className={className} {...props}>{children}</code>
                )
              }
            }}>
              {responseA || '_Waiting for response..._'}
            </ReactMarkdown>
          </div>
        </div>

        <div className="arena-column">
          <div className="arena-col-header">
            <strong>Model B:</strong> {modelB}
            {streamingB && <span className="arena-status pulsing">Streaming...</span>}
          </div>
          <div className="arena-col-body">
            <ReactMarkdown components={{
              code({ node, inline, className, children, ...props }) {
                return !inline ? (
                  <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{children}</CodeBlock>
                ) : (
                  <code className={className} {...props}>{children}</code>
                )
              }
            }}>
              {responseB || '_Waiting for response..._'}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
