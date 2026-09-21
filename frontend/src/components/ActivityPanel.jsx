import React, { useEffect, useState, useRef } from 'react'
import { Activity, X, Check, AlertTriangle, Loader, Lightbulb } from 'lucide-react'
import { subscribeActivity } from '../activityStream'

/**
 * What the model is thinking and doing, live, in a docked panel.
 *
 * The data already existed — the per-message "Steps, thoughts & actions taken"
 * disclosure and the <think> panel — but only AFTER the turn, collapsed, and one
 * message at a time. This shows it as it happens.
 *
 * Subscribes to activityStream directly rather than taking props: routing
 * streaming tokens through App state re-renders the entire shell every frame,
 * which is the bug StreamingMessage.jsx exists to avoid. Only this panel
 * re-renders here, and activityStream coalesces to one animation frame.
 */
export function ActivityPanel({ conversationId, onClose }) {
  const [act, setAct] = useState(() => ({ reasoning: '', answer: '', steps: [], running: false }))
  const thinkRef = useRef(null)
  const stickRef = useRef(true)

  useEffect(() => {
    // Reset immediately so we never show stale state from the previous bucket
    // while the new subscription's first snapshot is being delivered.
    setAct({ reasoning: '', answer: '', steps: [], running: false })
    return subscribeActivity(setAct, conversationId)
  }, [conversationId])

  // Follow the reasoning as it streams, but stop fighting the user if they
  // scroll up to read something.
  useEffect(() => {
    const el = thinkRef.current
    if (!el || !stickRef.current) return
    el.scrollTop = el.scrollHeight
  }, [act.reasoning])

  const onThinkScroll = () => {
    const el = thinkRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const icon = (status) => {
    if (status === 'error') return <AlertTriangle size={13} className="act-ico err" />
    if (status === 'done') return <Check size={13} className="act-ico ok" />
    return <Loader size={13} className="act-ico run" />
  }

  const nothingYet = !act.reasoning && !act.steps.length && !act.running

  return (
    <div className="activity-panel">
      <div className="activity-header">
        <Activity size={15} />
        <span className="activity-title">Thinking &amp; actions</span>
        {act.running && <span className="activity-live">live</span>}
        <button className="artifact-btn close" onClick={onClose} title="Close" aria-label="Close activity panel">
          <X size={16} />
        </button>
      </div>

      <div className="activity-body">
        {nothingYet && (
          <p className="activity-empty">
            Send a message and this shows the model’s reasoning and every tool it
            runs, as it happens.
          </p>
        )}

        {!!act.steps.length && (
          <section className="activity-section">
            <h5>Actions <span className="activity-count">{act.steps.length}</span></h5>
            <ol className="activity-steps">
              {act.steps.map((s) => (
                <li key={s.id} className={`activity-step ${s.status || 'running'}`}>
                  <div className="activity-step-head">
                    {icon(s.status)}
                    <code>{s.name}</code>
                    {typeof s.ms === 'number' && <span className="activity-ms">{(s.ms / 1000).toFixed(1)}s</span>}
                  </div>
                  {s.detail && <div className="activity-step-detail">{s.detail}</div>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {!!act.reasoning && (
          <section className="activity-section">
            <h5><Lightbulb size={12} /> Reasoning</h5>
            <pre className="activity-think" ref={thinkRef} onScroll={onThinkScroll}>{act.reasoning}</pre>
          </section>
        )}
      </div>
    </div>
  )
}
