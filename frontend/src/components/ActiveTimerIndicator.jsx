import React, { useState, useEffect, useRef } from 'react'
import { AlarmClock, X, Trash2 } from 'lucide-react'
import { subscribeTimers, getActiveTimers, cancelTimer } from '../tools/timer'

export function ActiveTimerIndicator({ onShowToast }) {
  const [timers, setTimers] = useState(() => getActiveTimers() || [])
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef(null)

  // Isolated subscription to timer updates
  useEffect(() => {
    const unsub = subscribeTimers((list) => {
      setTimers(list || [])
    })

    let interval = null
    const sync = () => {
      const active = getActiveTimers() || []
      setTimers(active)
      if (active.length === 0 && interval) {
        clearInterval(interval)
        interval = null
      } else if (active.length > 0 && !interval) {
        interval = setInterval(() => {
          setTimers(getActiveTimers() || [])
        }, 1000)
      }
    }

    sync()
    const checkInterval = setInterval(sync, 2000)

    return () => {
      unsub()
      if (interval) clearInterval(interval)
      clearInterval(checkInterval)
    }
  }, [])

  // Outside click and Escape key listeners
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isOpen])

  if (!timers.length) return null

  const primary = timers[0]

  const handleCancel = (id, label) => {
    cancelTimer(id)
    onShowToast?.(`Timer "${label || id}" cancelled`)
    if (timers.length <= 1) setIsOpen(false)
  }

  return (
    <div className="active-timer-wrapper" ref={popoverRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="active-timer-pill"
        onClick={() => setIsOpen(v => !v)}
        title="Active Alarms & Timers — click to manage"
        aria-label="Active Alarms and Timers"
      >
        <span className="timer-pulse-dot" />
        <AlarmClock size={13} className="timer-pill-icon" />
        <span className="timer-pill-text">{primary.countdown}</span>
        {timers.length > 1 && (
          <span className="timer-pill-badge">+{timers.length - 1}</span>
        )}
      </button>

      {isOpen && (
        <div className="timer-popover" role="dialog" aria-label="Active timers list">
          <div className="timer-popover-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlarmClock size={14} color="var(--accent-color, #ff6b35)" />
              <strong>Active Timers ({timers.length})</strong>
            </div>
            <button className="icon-btn" onClick={() => setIsOpen(false)} aria-label="Close popover">
              <X size={12} />
            </button>
          </div>

          <div className="timer-popover-list">
            {timers.map(t => (
              <div key={t.id} className="timer-popover-item">
                <div className="timer-popover-info">
                  <div className="timer-popover-label">{t.label}</div>
                  <div className="timer-popover-meta">Fires at {t.firesAt} · {t.countdown} left</div>
                </div>
                <button
                  type="button"
                  className="timer-cancel-btn"
                  onClick={() => handleCancel(t.id, t.label)}
                  title="Cancel timer"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
