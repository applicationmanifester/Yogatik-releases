/**
 * Session Replay — records all user/AI/tool events for later replay.
 * Uses IndexedDB for persistence, stores as append-only event log.
 */

const DB_NAME = 'yogatik_replay'
const STORE_NAME = 'sessions'
const MAX_EVENTS_PER_SESSION = 50000

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('conversationId', 'conversationId', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/**
 * Event types that can be recorded
 */
export const ReplayEventType = {
  USER_MESSAGE: 'user_message',
  AI_RESPONSE: 'ai_response',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  MODEL_SWITCH: 'model_switch',
  PROVIDER_SWITCH: 'provider_switch',
  SETTING_CHANGE: 'setting_change',
  FILE_OPEN: 'file_open',
  FILE_SAVE: 'file_save',
  TERMINAL_COMMAND: 'terminal_command',
  ERROR: 'error',
  UI_ACTION: 'ui_action',
  STREAM_START: 'stream_start',
  STREAM_TOKEN: 'stream_token',
  STREAM_DONE: 'stream_done',
  STREAM_ERROR: 'stream_error',
}

/**
 * Record an event to the session log
 */
export async function recordReplayEvent(sessionId, event) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    
    const record = {
      id: `${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      sessionId,
      conversationId: event.conversationId || null,
      type: event.type,
      timestamp: Date.now(),
      data: event.data || {},
      metadata: event.metadata || {},
    }
    
    const req = store.put(record)
    req.onsuccess = () => resolve(record.id)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get all events for a session
 */
export async function getReplayEvents(sessionId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const req = index.getAll(sessionId)
    req.onsuccess = () => {
      const events = req.result
        .filter(e => e.sessionId === sessionId)
        .sort((a, b) => a.timestamp - b.timestamp)
      resolve(events)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get all sessions
 */
export async function getReplaySessions() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      // Group by sessionId, get latest timestamp per session
      const sessions = new Map()
      for (const record of req.result) {
        const existing = sessions.get(record.sessionId)
        if (!existing || record.timestamp > existing.lastEventTime) {
          sessions.set(record.sessionId, {
            sessionId: record.sessionId,
            conversationId: record.conversationId,
            firstEventTime: existing ? Math.min(existing.firstEventTime, record.timestamp) : record.timestamp,
            lastEventTime: record.timestamp,
            eventCount: (existing?.eventCount || 0) + 1,
          })
        }
      }
      resolve(Array.from(sessions.values()).sort((a, b) => b.lastEventTime - a.lastEventTime))
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Delete a session
 */
export async function deleteReplaySession(sessionId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const req = index.getAll(sessionId)
    req.onsuccess = () => {
      const deleteTx = db.transaction(STORE_NAME, 'readwrite')
      const deleteStore = deleteTx.objectStore(STORE_NAME)
      for (const record of req.result) {
        if (record.sessionId === sessionId) {
          deleteStore.delete(record.id)
        }
      }
      deleteTx.oncomplete = () => resolve()
      deleteTx.onerror = () => reject(deleteTx.error)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Create a new session ID
 */
export function createSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Export session as JSON
 */
export async function exportReplaySession(sessionId) {
  const events = await getReplayEvents(sessionId)
  return JSON.stringify({
    sessionId,
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    events,
  }, null, 2)
}

/**
 * Import session from JSON
 */
export async function importReplaySession(json) {
  const data = JSON.parse(json)
  const db = await openDB()
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    
    let count = 0
    for (const event of data.events) {
      const req = store.put({
        ...event,
        id: `${event.sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      })
      req.onsuccess = () => count++
    }
    
    tx.oncomplete = () => resolve(count)
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Clear old sessions (keep last N)
 */
export async function pruneReplaySessions(keepCount = 100) {
  const sessions = await getReplaySessions()
  if (sessions.length <= keepCount) return 0
  
  const toDelete = sessions.slice(keepCount)
  let deleted = 0
  
  for (const session of toDelete) {
    await deleteReplaySession(session.sessionId)
    deleted++
  }
  
  return deleted
}

/**
 * Hook for React components to record events easily
 */
export function useReplayRecorder(sessionId, conversationId) {
  const record = (type, data, metadata = {}) => {
    if (!sessionId) return
    recordReplayEvent(sessionId, {
      type,
      conversationId,
      data,
      metadata,
    }).catch(() => {}) // fire and forget
  }
  
  return { record }
}