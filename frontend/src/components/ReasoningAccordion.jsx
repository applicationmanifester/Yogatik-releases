import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Brain, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Modern Collapsible Extended Thinking / Reasoning Widget.
 * Formats internal chain-of-thought tokens from models like DeepSeek-R1, o1/o3, and Claude 3.7.
 *
 * Sprint 3 accessibility (WCAG 2.1 AA): the header is a native <button>
 * (not a div with role="button") so Tab order, Enter/Space activation, and
 * focus-visible styling work without handlers. aria-expanded + aria-controls
 * point at the content region; the copy control is a nested button that stops
 * propagation so its label ("Copy reasoning chain") is announced distinctly.
 * Manual axe checklist: button-name, aria-valid-attr-value, color-contrast
 * (badge + labels audited in the high-contrast theme), region.
 */
export function ReasoningAccordion({
  reasoning = '',
  isStreaming = false,
  elapsedSec = null,
  defaultExpanded = false,
}) {
  const [userToggled, setUserToggled] = useState(false)
  const [isExpanded, setIsExpanded] = useState(() => defaultExpanded || isStreaming)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef(null)

  // Keep expanded while streaming unless the user manually collapsed it
  useEffect(() => {
    if (isStreaming && !userToggled) {
      setIsExpanded(true)
    }
  }, [isStreaming, userToggled])

  // Follow reasoning stream
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [reasoning, isStreaming, isExpanded])

  // Estimate token count (~4 characters per token average)
  const tokenEstimate = useMemo(() => {
    if (!reasoning) return 0
    return Math.max(1, Math.round(reasoning.length / 4))
  }, [reasoning])

  const copyReasoning = (e) => {
    e.stopPropagation()
    if (!reasoning) return
    navigator.clipboard?.writeText(reasoning)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleExpanded = () => {
    setUserToggled(true)
    setIsExpanded(v => !v)
  }

  if (!reasoning && !isStreaming) return null

  const contentId = `reasoning-body-${tokenEstimate}-${String(reasoning).length}`
  return (
    <div className={`reasoning-accordion-card ${isStreaming ? 'streaming' : ''} ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="reasoning-accordion-header-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="reasoning-accordion-header"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-label={isExpanded ? 'Collapse thought process' : 'Expand thought process'}
        style={{ flex: 1 }}
      >
        <div className="reasoning-header-left">
          <div className="reasoning-brain-icon">
            <Brain size={14} className={isStreaming ? 'pulsing-brain' : ''} />
          </div>
          <span className="reasoning-title-text">
            {isStreaming ? (
              <span className="reasoning-live-label">
                Thinking…
                <span className="reasoning-dots"><span>.</span><span>.</span><span>.</span></span>
              </span>
            ) : (
              <span>
                Thought Process
                {elapsedSec != null && ` (${elapsedSec}s)`}
              </span>
            )}
          </span>
          <span className="reasoning-token-badge">
            ~{tokenEstimate.toLocaleString()} tokens
          </span>
        </div>

        <div className="reasoning-header-right">
          <div className="reasoning-toggle-icon" aria-hidden="true">
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </button>
      {reasoning && isExpanded && (
        <button
          type="button"
          className="reasoning-copy-btn"
          onClick={copyReasoning}
          title="Copy reasoning chain"
          aria-label="Copy reasoning chain"
        >
          {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
      </div>

      {isExpanded && (
        <div className="reasoning-accordion-content" id={contentId} role="region" aria-label="Thought process details">
          <div className="reasoning-markdown-body" ref={scrollRef}>
            <div className="reasoning-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {reasoning}
              </ReactMarkdown>
            </div>
            {isStreaming && <span className="reasoning-cursor" aria-hidden="true">▌</span>}
          </div>
        </div>
      )}
    </div>
  )
}
