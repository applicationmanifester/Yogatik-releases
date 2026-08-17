import React from 'react'
import { Loader2, CircleCheck, CircleAlert, RotateCw, X } from 'lucide-react'
import { subscribeToolStatus, isLongRunning, friendlyError } from '../toolStatus'

/**
 * Live tool-status panel — shows which tools are running / just finished /
 * failed, with an elapsed timer on long-running calls and an optional retry.
 * Addresses the two ★★★ Phase-1 pain-points: "tool list exposed without status"
 * and "no progress indicator for long-running tools".
 *
 * Purely presentational + subscribed: it never drives the agent, so it is safe
 * to mount anywhere (it renders nothing when idle).
 *
 * @param {(name:string, args:any)=>void} [onRetry] - optional re-run handler.
 */
export default function ToolStatusPanel({ onRetry }) {
  const [items, setItems] = React.useState([])
  const [now, setNow] = React.useState(Date.now())
  const [dismissed, setDismissed] = React.useState(() => new Set())

  React.useEffect(() => subscribeToolStatus(setItems), [])

  // Tick only while something is running — no idle timers.
  const anyRunning = items.some(i => i.phase === 'running')
  React.useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [anyRunning])

  const visible = items.filter(i => !dismissed.has(i.id))
  if (visible.length === 0) return null

  return (
    <div className="tool-status-panel" role="status" aria-live="polite" aria-label="Tool activity">
      {visible.map(rec => {
        const elapsed = ((rec.endedAt || now) - rec.startedAt) / 1000
        const slow = isLongRunning(rec, now)
        return (
          <div key={rec.id} className={`tool-status-row ${rec.phase}`}>
            <span className="tool-status-icon" aria-hidden="true">
              {rec.phase === 'running' && <Loader2 size={13} className="spin" />}
              {rec.phase === 'done' && <CircleCheck size={13} />}
              {rec.phase === 'error' && <CircleAlert size={13} />}
            </span>
            <span className="tool-status-name">{rec.name}</span>
            <span className="tool-status-detail">
              {rec.phase === 'running' && (slow ? `working… ${elapsed.toFixed(0)}s` : 'running…')}
              {rec.phase === 'done' && `done in ${elapsed.toFixed(1)}s`}
              {rec.phase === 'error' && friendlyError(rec)}
            </span>
            {rec.phase === 'error' && onRetry && (
              <button
                className="tool-status-retry"
                title="Retry this tool"
                onClick={() => onRetry(rec.name, rec.args)}
              >
                <RotateCw size={11} /> Retry
              </button>
            )}
            {rec.phase === 'error' && (
              <button
                className="tool-status-dismiss"
                title="Dismiss"
                aria-label={`Dismiss ${rec.name} error`}
                onClick={() => setDismissed(d => new Set(d).add(rec.id))}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
