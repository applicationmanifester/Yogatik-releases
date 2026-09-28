import React, { useState, useEffect, useRef } from 'react'
import {
  Play, Pause, Square, FastForward, Rewind, SkipForward, SkipBack,
  Download, Upload, Trash2, Clock, Zap, FileText, Terminal,
  MessageSquare, Wrench, AlertTriangle, Search, ChevronDown, ChevronUp,
  Filter, Calendar, Hash, X
} from 'lucide-react'
import { Modal } from './Modal'
import { getReplaySessions, getReplayEvents, deleteReplaySession, exportReplaySession, importReplaySession, createSessionId } from '../sessionReplay'

const EVENT_COLORS = {
  user_message: '#3b82f6',
  ai_response: '#10b981',
  tool_call: '#f59e0b',
  tool_result: '#8b5cf6',
  model_switch: '#ec4899',
  provider_switch: '#ec4899',
  setting_change: '#64748b',
  file_open: '#06b6d4',
  file_save: '#06b6d4',
  terminal_command: '#ef4444',
  error: '#ef4444',
  ui_action: '#64748b',
  stream_start: '#a855f7',
  stream_token: '#a855f7',
  stream_done: '#a855f7',
  stream_error: '#ef4444',
}

const EVENT_ICONS = {
  user_message: MessageSquare,
  ai_response: MessageSquare,
  tool_call: Wrench,
  tool_result: Wrench,
  model_switch: Zap,
  provider_switch: Zap,
  setting_change: Zap,
  file_open: FileText,
  file_save: FileText,
  terminal_command: Terminal,
  error: AlertTriangle,
  ui_action: Zap,
  stream_start: Zap,
  stream_token: Zap,
  stream_done: Zap,
  stream_error: AlertTriangle,
}

function renderEventItem({ event, index, currentEventIndex, events, EVENT_COLORS, EVENT_ICONS, setCurrentEventIndex }) {
  const Icon = EVENT_ICONS[event.type] || Zap
  const color = EVENT_COLORS[event.type] || '#64748b'
  const isCurrent = index === currentEventIndex
  const originalIndex = events.indexOf(event)

  return (
    <div
      key={event.id}
      className={`replay-event ${index === currentEventIndex ? 'current' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={() => setCurrentEventIndex(events.indexOf(event))}
    >
      <div className="replay-event-marker">
        <Icon size={14} style={{ color }} />
      </div>
      <div className="replay-event-content">
        <div className="replay-event-header">
          <span className="replay-event-type" style={{ color }}>
            {event.type.replace(/_/g, ' ')}
          </span>
          <span className="replay-event-time">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="replay-event-preview">
          {typeof event.data === 'string' ? event.data.slice(0, 200) : JSON.stringify(event.data).slice(0, 200)}
        </div>
      </div>
      {isCurrent && <div className="replay-current-indicator" style={{ background: color }} />}
    </div>
  )
}

export function SessionReplayModal({ isOpen, onClose }) {
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [events, setEvents] = useState([])
  const [currentEventIndex, setCurrentEventIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [filterType, setFilterType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [importFile, setImportFile] = useState(null)
  const playbackIntervalRef = useRef(null)
  const eventsContainerRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      loadSessions()
    }
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
    }
  }, [isOpen])

  const loadSessions = async () => {
    const data = await getReplaySessions()
    setSessions(data)
  }

  const loadSession = async (session) => {
    setSelectedSession(session)
    const data = await getReplayEvents(session.sessionId)
    setEvents(data)
    setCurrentEventIndex(-1)
    setIsPlaying(false)
  }

  const handlePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
        playbackIntervalRef.current = null
      }
      return
    }

    if (currentEventIndex >= events.length - 1) {
      setCurrentEventIndex(-1)
    }

    setIsPlaying(true)
    playbackIntervalRef.current = setInterval(() => {
      setCurrentEventIndex(prev => {
        if (prev >= events.length - 1) {
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current)
            playbackIntervalRef.current = null
          }
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 1000 / playbackSpeed)
  }

  const handleStop = () => {
    setIsPlaying(false)
    setCurrentEventIndex(-1)
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current)
      playbackIntervalRef.current = null
    }
  }

  const handleStep = (direction) => {
    setCurrentEventIndex(prev => Math.max(-1, Math.min(events.length - 1, prev + direction)))
  }

  const filteredEvents = events.filter(e => {
    if (filterType !== 'all' && e.type !== filterType) return false
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return JSON.stringify(e.data).toLowerCase().includes(query) ||
           e.type.toLowerCase().includes(query)
  })

  const eventTypes = [...new Set(events.map(e => e.type))].sort()

  const deleteSession = async (sessionId, e) => {
    e.stopPropagation()
    if (confirm('Delete this session?')) {
      await deleteReplaySession(sessionId)
      loadSessions()
      if (selectedSession?.sessionId === sessionId) {
        setSelectedSession(null)
        setEvents([])
      }
    }
  }

  const exportSession = async (session) => {
    const json = await exportReplaySession(session.sessionId)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `replay_${session.sessionId}_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        await importReplaySession(e.target.result)
        loadSessions()
        alert('Session imported successfully')
      } catch (err) {
        alert('Import failed: ' + err.message)
      }
      setImportFile(null)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  if (!isOpen) return null

  return (
    <Modal
      title="Session Replay"
      onClose={onClose}
      className="replay-modal"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
          <label className="small-btn">
            <Upload size={14} /> Import
            <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button className="small-btn btn-primary" onClick={onClose}>Done</button>
        </div>
      }
    >
      <div className="replay-modal-content">
        {/* Sidebar - Sessions */}
        <div className="replay-sidebar">
          <div className="replay-sidebar-header">
            <h3>Sessions ({sessions.length})</h3>
            <div className="replay-sidebar-actions">
              <input
                type="file"
                accept=".json"
                id="replay-import"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
              <label htmlFor="replay-import" className="icon-btn" title="Import session">
                <Upload size={16} />
              </label>
            </div>
          </div>

          <div className="replay-sessions-list">
            {sessions.length === 0 ? (
              <div className="replay-empty">No sessions recorded yet</div>
            ) : (
              sessions.map(session => (
                <div
                  key={session.sessionId}
                  className={`replay-session-item ${selectedSession?.sessionId === session.sessionId ? 'selected' : ''}`}
                  onClick={() => loadSession(session)}
                >
                  <div className="replay-session-info">
                    <div className="replay-session-id">{session.sessionId}</div>
                    <div className="replay-session-meta">
                      <span>{session.eventCount} events</span>
                      <span>{new Date(session.lastEventTime).toLocaleString()}</span>
                    </div>
                    {session.conversationId && (
                      <div className="replay-session-conv">Conv: {session.conversationId.slice(0, 12)}...</div>
                    )}
                  </div>
                  <div className="replay-session-actions">
                    <button
                      className="icon-btn"
                      onClick={(e) => exportSession(session)}
                      title="Export"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={(e) => deleteSession(session.sessionId, e)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main - Events Timeline */}
        <div className="replay-main">
          {selectedSession ? (
            <>
              {/* Toolbar */}
              <div className="replay-toolbar">
                <div className="replay-playback">
                  <button
                    className={`replay-btn ${currentEventIndex === -1 ? 'disabled' : ''}`}
                    onClick={() => handleStep(-1)}
                    disabled={currentEventIndex <= -1}
                    title="Previous"
                  >
                    <SkipBack size={18} />
                  </button>
                  <button
                    className={`replay-btn play-btn ${isPlaying ? 'playing' : ''}`}
                    onClick={handlePlay}
                    disabled={events.length === 0}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button
                    className={`replay-btn ${currentEventIndex >= events.length - 1 ? 'disabled' : ''}`}
                    onClick={() => handleStep(1)}
                    disabled={currentEventIndex >= events.length - 1}
                    title="Next"
                  >
                    <SkipForward size={18} />
                  </button>
                  <button
                    className="replay-btn"
                    onClick={handleStop}
                    disabled={currentEventIndex === -1 && !isPlaying}
                  >
                    <Square size={18} />
                  </button>
                </div>

                <div className="replay-speed">
                  <label>
                    <span>Speed:</span>
                    <select
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={5}>5x</option>
                      <option value={10}>10x</option>
                    </select>
                  </label>
                </div>

                <div className="replay-filters">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="replay-filter-select"
                  >
                    <option value="all">All Types</option>
                    {eventTypes.map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="replay-search"
                  />
                  <button
                    className="replay-export-btn"
                    onClick={() => exportSession(selectedSession)}
                  >
                    <Download size={14} /> Export
                  </button>
                </div>
              </div>

              {/* Events Timeline */}
              <div className="replay-events-container" ref={eventsContainerRef}>
                {filteredEvents.length === 0 ? (
                  <div className="replay-empty">No events match filter</div>
                ) : (
                  filteredEvents.map((event, index) =>
                    renderEventItem({
                      event,
                      index,
                      currentEventIndex,
                      events,
                      EVENT_COLORS,
                      EVENT_ICONS,
                      setCurrentEventIndex,
                    })
                  )
                )}
              </div>

              {/* Current Event Detail */}
              {currentEventIndex >= 0 && currentEventIndex < events.length && (
                <div className="replay-detail">
                  <h4>Event Detail</h4>
                  <pre>{JSON.stringify(events[currentEventIndex], null, 2)}</pre>
                </div>
              )}
            </>
          ) : (
            <div className="replay-welcome">
              <Hash size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
              <h3>Session Replay</h3>
              <p>Select a session from the sidebar to view its event timeline</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}