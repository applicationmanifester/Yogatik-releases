import React, { useMemo } from 'react'
import {
  Activity, BarChart3, Sparkles, Cpu, Clock, Layers,
  Trash2, ShieldCheck, ChevronRight, X, ArrowUpRight, Zap, Info
} from 'lucide-react'
import { Modal } from './Modal'
import { getModelContextLimit } from './ContextMeter'
import {
  estimateConversationTokens,
  estimateTokensFromText,
  estimateTokensFromMessage,
  formatTokenCount,
  calculateUsagePercent,
  getUsageColor,
} from '../tokenEstimator'

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
    let uTokens = 0
    let aTokens = 0
    let tTokens = 0
    let uTurns = 0
    let aTurns = 0

    for (const msg of messages) {
      const msgTokens = estimateTokensFromMessage(msg)
      if (msg?.role === 'user') {
        uTokens += msgTokens
        uTurns++
      } else if (msg?.role === 'assistant') {
        aTokens += msgTokens
        aTurns++
      }
      if (Array.isArray(msg?.toolResults)) {
        try {
          tTokens += Math.ceil(JSON.stringify(msg.toolResults).length / 3.8)
        } catch {}
      }
    }

    const sTokens = estimateTokensFromText(systemPrompt || '')
    const dTokens = estimateTokensFromText(input || '')

    const rChars = (docs || []).reduce((acc, d) => acc + (d.chars || (d.chunks || []).reduce((cAcc, c) => cAcc + (c?.length || 0), 0)), 0)
    const rTokens = Math.ceil(rChars / 3.8)

    const total = sTokens + uTokens + aTokens + tTokens + dTokens
    const pct = calculateUsagePercent(total, limit)
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

  const formatTokens = formatTokenCount

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

          {/* Progress ring / bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '56px', height: '56px' }}>
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx="28" cy="28" r="24"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="6"
                />
                <circle
                  cx="28" cy="28" r="24"
                  fill="none"
                  stroke={status.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 24}
                  strokeDashoffset={2 * Math.PI * 24 * (1 - percent / 100)}
                  style={{ transition: 'stroke-dashoffset 0.5s ease', filter: `drop-shadow(0 0 4px ${status.color})` }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary, #fff)' }}>{percent}%</span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted, #7a82a5)' }}>used</span>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary, #a6adc8)' }}>{formatTokens(totalTokens)} / {formatTokens(limit)} tokens</span>
                <span style={{ color: status.color, fontWeight: 700 }}>{formatTokens(remainingTokens)} remaining</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${percent}%`, height: '100%', background: status.color, borderRadius: '3px', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary, #a6adc8)', lineHeight: 1.5, margin: 0 }}>{status.desc}</p>
        </div>

        {/* Itemized Token Breakdown */}
        <div style={{
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>Token Breakdown</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #7a82a5)' }}>{userTurns + assistantTurns} turns ({userTurns}U / {assistantTurns}A)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            {systemTokens > 0 && (
              <TokenRow
                icon={<Layers size={14} style={{ color: '#8b5cf6' }} />}
                label="System Prompt & Persona"
                value={formatTokens(systemTokens)}
                color="#8b5cf6"
              />
            )}
            {userTokens > 0 && (
              <TokenRow
                icon={<Sparkles size={14} style={{ color: '#34d399' }} />}
                label="User Turns"
                value={formatTokens(userTokens)}
                color="#34d399"
              />
            )}
            {assistantTokens > 0 && (
              <TokenRow
                icon={<Cpu size={14} style={{ color: '#fbbf24' }} />}
                label="Assistant Turns"
                value={formatTokens(assistantTokens)}
                color="#fbbf24"
              />
            )}
            {toolTokens > 0 && (
              <TokenRow
                icon={<BarChart3 size={14} style={{ color: '#00e5ff' }} />}
                label="Tool Results"
                value={formatTokens(toolTokens)}
                color="#00e5ff"
              />
            )}
            {draftTokens > 0 && (
              <TokenRow
                icon={<Clock size={14} style={{ color: '#ff6b35' }} />}
                label="Current Composer Draft"
                value={formatTokens(draftTokens)}
                color="#ff6b35"
              />
            )}
            {ragTokens > 0 && (
              <TokenRow
                icon={<ShieldCheck size={14} style={{ color: '#1de9b6' }} />}
                label="Indexed Local RAG Corpus"
                value={formatTokens(ragTokens)}
                color="#1de9b6"
              />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))', fontSize: '12px', fontWeight: 600 }}>
            <span style={{ color: 'var(--text-secondary, #a6adc8)' }}>Total Estimated</span>
            <span style={{ color: 'var(--text-primary, #fff)' }}>{formatTokens(totalTokens)} / {formatTokens(limit)}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              onCompact?.()
              onClose?.()
            }}
            disabled={!onCompact || (messages.length <= 2 && totalTokens < 500)}
            style={{
              flex: 1,
              minWidth: '140px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              color: '#fff',
              background: (!onCompact || (messages.length <= 2 && totalTokens < 500)) ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              cursor: (!onCompact || (messages.length <= 2 && totalTokens < 500)) ? 'not-allowed' : 'pointer',
              opacity: (!onCompact || (messages.length <= 2 && totalTokens < 500)) ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <Zap size={14} /> Compact History
          </button>
          <button
            type="button"
            onClick={onClearHistory}
            style={{
              flex: 1,
              minWidth: '140px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(248, 113, 113, 0.4)',
              fontSize: '12px',
              fontWeight: 700,
              color: '#f87171',
              background: 'rgba(248, 113, 113, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Trash2 size={14} /> Clear History
          </button>
          {onOpenAnalytics && (
            <button
              type="button"
              onClick={onOpenAnalytics}
              style={{
                flex: 1,
                minWidth: '140px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <ArrowUpRight size={14} /> Usage Analytics
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function TokenRow({ icon, label, value, color }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-color, rgba(255,255,255,0.05))',
      borderRadius: '8px',
      fontSize: '12px'
    }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ color: 'var(--text-secondary, #a6adc8)', flex: 1 }}>{label}</span>
      <span style={{ color: 'var(--text-primary, #fff)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
