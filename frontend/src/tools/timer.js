/**
 * Browser-native Timer, Alarm & Reminder Tool
 * Works 100% in browser (and desktop) using Web Audio API chime,
 * HTML5 Notifications, and Speech synthesis.
 */

import { getSharedSpeaker } from '../live/voice'

// Active timers stored in memory
const activeTimers = new Map()
let nextTimerId = 1
const timerListeners = new Set()

function notifyListeners() {
  const current = getActiveTimers()
  for (const listener of timerListeners) {
    try { listener(current) } catch {}
  }
}

export function subscribeTimers(fn) {
  timerListeners.add(fn)
  fn(getActiveTimers())
  return () => timerListeners.delete(fn)
}

export function getActiveTimers() {
  const now = Date.now()
  return Array.from(activeTimers.values()).map(t => {
    const remaining = Math.max(0, Math.round((t.targetTimestamp - now) / 1000))
    const mins = Math.floor(remaining / 60)
    const secs = remaining % 60
    const countdown = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
    return {
      id: t.id,
      label: t.label,
      message: t.message,
      targetTimestamp: t.targetTimestamp,
      firesAt: new Date(t.targetTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      remainingSeconds: remaining,
      countdown,
    }
  })
}

export function cancelTimer(id) {
  const tid = Number(id)
  if (activeTimers.has(tid)) {
    const t = activeTimers.get(tid)
    clearTimeout(t.timeoutHandle)
    activeTimers.delete(tid)
    notifyListeners()
    return true
  }
  return false
}

function parseTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0
  const clean = timeStr.trim().toLowerCase().replace(/^(?:at|for|by)\s+/i, '')
  // Match "07:30", "3:30 PM", "15:45", "4pm", "4 pm", "4:00am", "4 am"
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i) ||
                clean.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (match) {
    let hours = parseInt(match[1], 10)
    const minutes = match[2] ? parseInt(match[2], 10) : 0
    const meridiem = (match[3] || '').toLowerCase()

    if (meridiem === 'pm' && hours < 12) hours += 12
    if (meridiem === 'am' && hours === 12) hours = 0

    const now = new Date()
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)

    // If target time is earlier today, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }

    return Math.max(1, Math.round((target.getTime() - now.getTime()) / 1000))
  }
  return 0
}

function parseDurationSeconds(duration, seconds, time) {
  if (typeof seconds === 'number' && !isNaN(seconds) && seconds > 0) {
    return Math.round(seconds)
  }
  if (typeof duration === 'number' && !isNaN(duration) && duration > 0) {
    return Math.round(duration)
  }

  // Check explicit time argument
  if (time && typeof time === 'string') {
    const secs = parseTimeString(time)
    if (secs > 0) return secs
  }

  // Parse duration string like "10 minutes", "5m", "1 hour", "30s", "2h 15m" or "4pm"
  if (duration && typeof duration === 'string') {
    const text = duration.trim().toLowerCase()

    // If duration looks like a time ("4pm", "16:00", "4:30 pm", "for 4pm")
    if (text.match(/(?:\d{1,2}:\d{2}|\b\d{1,2}\s*(?:am|pm)\b|\b\d{1,2}(?:am|pm)\b)/i)) {
      const secs = parseTimeString(text)
      if (secs > 0) return secs
    }

    // Match patterns like "5 minutes", "10 min", "1 hour", "30 seconds", "45s"
    let totalSecs = 0
    const hourMatch = text.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)/)
    const minMatch = text.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/)
    const secMatch = text.match(/(\d+)\s*(?:s|sec|secs|second|seconds)/)

    if (hourMatch) totalSecs += parseInt(hourMatch[1], 10) * 3600
    if (minMatch) totalSecs += parseInt(minMatch[1], 10) * 60
    if (secMatch) totalSecs += parseInt(secMatch[1], 10)

    if (totalSecs > 0) return totalSecs

    // Plain number fallback
    const rawNum = parseFloat(text)
    if (!isNaN(rawNum) && rawNum > 0) {
      if (text.includes('m')) return Math.round(rawNum * 60)
      if (text.includes('h')) return Math.round(rawNum * 3600)
      return Math.round(rawNum)
    }
  }

  return 0
}

function playAlarmChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Play a friendly 3-beep alarm chime (D5, D5, A5)
    ;[0, 0.22, 0.44].forEach((offset, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(i === 2 ? 880 : 587.33, now + offset)
      gain.gain.setValueAtTime(0, now + offset)
      gain.gain.linearRampToValueAtTime(0.3, now + offset + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.21)
    })
  } catch {}
}

function triggerAlarm(timerObj) {
  const { id, label, message } = timerObj
  activeTimers.delete(id)
  notifyListeners()

  // 1. Play audio chime
  playAlarmChime()

  // 2. Trigger Web Notification if granted
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`⏰ Alarm: ${label || 'Timer'}`, {
        body: message || label || 'Your timer is up!',
        icon: '/favicon.ico',
      })
    }
  } catch {}

  // 3. Voice announcement
  try {
    const speaker = getSharedSpeaker({ engine: 'system', lang: 'en-US' })
    speaker.speak(`Alarm: ${label || 'Your timer is up'}`)
  } catch {}
}

export const timerTool = {
  schema: {
    description:
      'Set, list, or cancel alarms, countdown timers, and reminders in the browser. ' +
      'Plays an audio chime and speaks an alert when the timer completes. ' +
      'Examples: "set an alarm for 7:00 AM", "set a timer for 10 minutes", "remind me in 5 minutes to check email".',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'list', 'cancel', 'clear_all'],
          description: 'Action to perform: "set" (default), "list", "cancel", or "clear_all"',
        },
        duration: {
          type: 'string',
          description: 'Duration string, e.g. "10 minutes", "5m", "1 hour", "30 seconds"',
        },
        seconds: {
          type: 'number',
          description: 'Duration in seconds (e.g. 300 for 5 minutes)',
        },
        time: {
          type: 'string',
          description: 'Specific alarm time, e.g. "07:30 AM", "18:00", "3:45 PM"',
        },
        label: {
          type: 'string',
          description: 'Label or title for the alarm / reminder, e.g. "Check oven", "Team meeting"',
        },
        message: {
          type: 'string',
          description: 'Detailed reminder message to speak or display',
        },
        id: {
          type: 'number',
          description: 'Timer ID to cancel (required when action is "cancel")',
        },
      },
    },
  },

  async execute(args = {}) {
    const action = args?.action || 'set'

    // Request notification permission in background if supported
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
    } catch {}

    if (action === 'list') {
      const timers = Array.from(activeTimers.values()).map(t => ({
        id: t.id,
        label: t.label,
        message: t.message,
        scheduledFor: new Date(t.targetTimestamp).toLocaleTimeString(),
        remainingSeconds: Math.max(0, Math.round((t.targetTimestamp - Date.now()) / 1000)),
      }))
      return {
        success: true,
        tool: 'timer',
        count: timers.length,
        timers,
      }
    }

    if (action === 'cancel') {
      const tid = Number(args?.id)
      if (!tid || !activeTimers.has(tid)) {
        return { success: false, error: `No active timer found with ID ${args?.id}` }
      }
      const t = activeTimers.get(tid)
      clearTimeout(t.timeoutHandle)
      activeTimers.delete(tid)
      notifyListeners()
      return { success: true, tool: 'timer', message: `Timer #${tid} ("${t.label}") cancelled` }
    }

    if (action === 'clear_all') {
      for (const t of activeTimers.values()) {
        clearTimeout(t.timeoutHandle)
      }
      const count = activeTimers.size
      activeTimers.clear()
      notifyListeners()
      return { success: true, tool: 'timer', message: `Cleared ${count} active timers` }
    }

    // Default: Set timer / alarm / reminder
    const label = args?.label || args?.message || args?.prompt || 'Timer'
    const message = args?.message || args?.label || 'Your timer is up!'
    const secs = parseDurationSeconds(args?.duration, args?.seconds, args?.time)

    if (secs <= 0) {
      return {
        success: false,
        error: 'Please specify a valid duration (e.g. "10 minutes", "30s") or time (e.g. "07:30 AM").',
      }
    }

    const timerId = nextTimerId++
    const targetTimestamp = Date.now() + secs * 1000

    const timerObj = {
      id: timerId,
      label,
      message,
      targetTimestamp,
      timeoutHandle: null,
    }

    timerObj.timeoutHandle = setTimeout(() => {
      triggerAlarm(timerObj)
    }, secs * 1000)

    activeTimers.set(timerId, timerObj)
    notifyListeners()

    const formattedTime = new Date(targetTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const minutes = Math.floor(secs / 60)
    const remainingSecs = secs % 60
    const durationText = minutes > 0 ? `${minutes}m ${remainingSecs > 0 ? remainingSecs + 's' : ''}`.trim() : `${secs}s`

    return {
      success: true,
      tool: 'timer',
      id: timerId,
      label,
      duration: durationText,
      seconds: secs,
      firesAt: formattedTime,
      message: `Alarm set for ${formattedTime} (${durationText} from now): "${label}"`,
    }
  },
}
