import React, { useMemo } from 'react'
import {
  Activity, BarChart3, Sparkles, Cpu, Clock, Layers,
  Trash2, ShieldCheck, ChevronRight, X, ArrowUpRight, Zap, Info
} from 'lucide-react'
import { Modal } from './Modal'
import { estimateConversationTokens, getModelContextLimit } from './ContextMeter'

/**
 * ContextUsageModal — AI Model Context Window & Token Utilization Window.
 * Shows detailed itemized token breakdown (System prompt, Chat history,
 * Tool results, RAG documents, Draft prompt), headroom remaining, and
 * direct actions to compact history or open the full usage & cost dashboard.
 */
export function ContextUsageModal({
  messages = [],
  systemPrompt = '',
  input = '',
  provider = 'local',
  model = '',
  docs = [],
  onClose,
  onOpenAnalytics,
  onCompact,
  onClearHistory,
}) {
  const limit = useMemo(() => getModelContextLimit(provider, model), [provider, model])

  const {
    systemTokens,
    userTokens,
    assistantTokens,
    toolTokens,
    draftTokens,
    ragTokens,
    totalTokens,
    percent,
    remainingTokens,
    userTurns,
    assistantTurns,
  } = useMemo(() => {
    let sChars = (systemPrompt || '').length
    let uChars = 0
    let aChars = 0
    let tChars = 0
    let uTurns = 0
    let aTurns = 0

    for (const msg of messages) {
      const textLen = (msg?.text || (typeof msg?.content === 'string' ? msg.content : '') || '').length
      if (msg?.role === 'user') {
        uChars += textLen
        uTurns++
      } else if (msg?.role === 'assistant') {
        aChars += textLen
        aTurns++
      }
      if (Array.isArray(msg?.toolResults)) {
        tChars += JSON.stringify(msg.toolResults).length
      }
    }

    const sTokens = Math.ceil(sChars / 4)
    const uTokens = Math.ceil(uChars / 4)
    const aTokens = Math.ceil(aChars / 4)
    const tTokens = Math.ceil(tChars / 4)
    const dTokens = Math.ceil((input || '').length / 4)

    const rChars = (docs || []).reduce((acc, d) => acc + (d.chars || (d.chunks || []).reduce((cAcc, c) => cAcc + (c?.length || 0), 0)), 0)
    const rTokens = Math.ceil(rChars / 4)

    const total = sTokens + uTokens + aTokens + tTokens + dTokens
    const pct = Math.min(100, Math.round((total / limit) * 100))
    const rem = Math.max(0, limit - total)

    return {
      systemTokens: sTokens,
      userTokens: uTokens,
      assistantTokens: aTokens,
      toolTokens: tTokens,
      draftTokens: dTokens,
      ragTokens: rTokens,
      totalTokens: total,
      percent: pct,
      remainingTokens: rem,
      userTurns: uTurns,
      assistantTurns: aTurns,
    }
  }, [messages, systemPrompt, input, docs, limit])

  const getStatus = () => {
    if (percent > 85) {
      return {
        label: 'Critical Capacity (>85%)',
        color: '#f87171',
        desc: 'Approaching maximum context window. Older turns will be compacted or trimmed automatically to preserve headroom.',
      }
    }
    if (percent > 60) {
      return {
        label: 'Moderate Usage (60%–85%)',
        color: '#fbbf24',
        desc: 'Context is filling up. Conversation flows normally, but deep tool outputs may accelerate compaction.',
      }
    }
    return {
      label: 'Optimal Capacity (<60%)',
      color: '#34d399',
      desc: 'Plenty of headroom available for long reasoning chains, file analysis, and high-fidelity responses.',
    }
  }

  const status = getStatus()

  const formatTokens = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
    return String(num)
  }

  return (
    <Modal
      title="AI Context Window &amp; Token Breakdown"
      icon={<Activity size={18} style={{ color: status.color }} />}
      onClose={onClose}
      className="context-usage-modal"
    >
      <div style={{ padding: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Model & Architecture Overview */}
        <div style={{
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Cpu size={16} style={{ color: 'var(--accent, #ff6b35)' }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                  {model || 'Active Model'}
                </span>
                <span style={{
                  marginLeft: '8px',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(255, 107, 53, 0.12)',
                  color: 'var(--accent, #ff6b35)',
                  fontWeight: 700,
                  textTransform: 'uppercase'
                }}>
                  {(provider || '').toUpperCase()}
                </span>
              </div>
            </div>

            <span style={{
              fontSize: '11px',
              padding: '3px 9px',
              borderRadius: '6px',
              background: `${status.color}1a`,
              color: status.color,
              border: `1px solid ${status.color}40`,
              fontWeight: 700
            }}>
              {status.label}
            </span>
          </div>

          {/* Progress Bar & Numerical Metrics */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #fff)' }}>
                {totalTokens.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary, #94a3b8)' }}>/ {limit.toLocaleString()} tokens</span>
              </div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: status.color }}>
                {percent}% used · {remainingTokens.toLocaleString()} free
              </div>
            </div>

            <div style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.max(2, percent)}%`,
                height: '100%',
                background: status.color,
                transition: 'width 0.3s ease',
                borderRadius: '4px'
              }} />
            </div>

            <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
              {status.desc}
            </p>
          </div>
        </div>

        {/* Itemized Token Breakdown */}
        <div style={{
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.02))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.07))',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Context Itemization Breakdown
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* System Prompt */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚙️</span>
                <span>System Prompt &amp; Persona</span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                ~{systemTokens.toLocaleString()} tokens
              </div>
            </div>

            {/* Conversation History */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💬</span>
                <span>Conversation History ({userTurns + assistantTurns} turns)</span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                ~{(userTokens + assistantTokens).toLocaleString()} tokens <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: 400 }}>({userTokens} user / {assistantTokens} assistant)</span>
              </div>
            </div>

            {/* Tool Payloads */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🛠️</span>
                <span>Tool Invocations &amp; Results</span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                ~{toolTokens.toLocaleString()} tokens
              </div>
            </div>

            {/* Draft Prompt */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✍️</span>
                <span>Current Composer Draft</span>
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                ~{draftTokens.toLocaleString()} tokens
              </div>
            </div>

            {/* RAG Knowledge Context */}
            {docs.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📑</span>
                  <span>Indexed Local RAG Corpus ({docs.length} files)</span>
                </div>
                <div style={{ fontWeight: 600, color: '#34d399' }}>
                  ~{ragTokens.toLocaleString()} tokens available via retrieval
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          {onOpenAnalytics && (
            <button
              type="button"
              className="small-btn btn-primary"
              onClick={() => {
                onClose?.()
                onOpenAnalytics()
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '12px',
                borderRadius: '8px',
                background: 'var(--accent, #ff6b35)',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <BarChart3 size={14} /> Open Full Usage &amp; Cost Analytics <ArrowUpRight size={13} />
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            {onCompact && messages.length > 4 && (
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  onCompact()
                  onClose?.()
                }}
                title="Compact older turns to free up tokens"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                  cursor: 'pointer'
                }}
              >
                <Zap size={13} style={{ color: '#fbbf24' }} /> Compact History
              </button>
            )}

            {onClearHistory && messages.length > 0 && (
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  if (window.confirm('Clear all conversation messages to reset context?')) {
                    onClearHistory()
                    onClose?.()
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={13} /> Reset Context
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
