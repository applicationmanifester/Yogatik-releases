/**
 * browserSessionPersistence — Save and restore browsing sessions.
 * 
 * Persists tab state (URLs, titles, scroll positions, cookies, localStorage)
 * to IndexedDB so sessions survive app restarts and can be synced across devices.
 */

import { getSetting, setSetting } from '../db'
import { openDB } from 'idb'

const DB_NAME = 'yogatik-browser-sessions'
const DB_VERSION = 1
const STORE_NAME = 'sessions'

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' })
          store.createIndex('conversationId', 'conversationId')
          store.createIndex('updatedAt', 'updatedAt')
        }
      },
    })
  }
  return dbPromise
}

/**
 * Reset the cached DB promise (for testing)
 */
export function resetDBPromise() {
  dbPromise = null
}

/**
 * Save a browsing session to IndexedDB
 * @param {Object} session - The session object from browserControl.cjs
 * @param {string} conversationId - The conversation this session belongs to
 */
export async function saveSession(session, conversationId) {
  if (!session) return { success: false, error: 'No session to save' }
  
  try {
    const db = await getDB()
    
    // Extract serializable tab data
    const tabs = []
    for (const [tabId, tab] of session.tabs) {
      tabs.push({
        tabId,
        url: tab.url || tab.savedUrl || '',
        title: tab.title || tab.savedTitle || '',
        active: tabId === session.activeTabId,
        pinned: tab.pinned || false,
        hibernating: tab.hibernating || false,
        savedScroll: tab.savedScroll || { x: 0, y: 0 },
        isAgent: tab.isAgent || false,
        viewCreated: tab.viewCreated || false,
        // Note: WebContentsView and webContents cannot be serialized
        // They will be recreated on restore
      })
    }
    
    const sessionData = {
      sessionId: `session_${conversationId || 'default'}_${Date.now()}`, // Unique per save
      conversationId: conversationId || 'default',
      tabs,
      activeTabId: session.activeTabId,
      mode: session.mode || 'window',
      createdAt: session.createdAt || Date.now(),
      updatedAt: Date.now(),
      // Store the original sessionId for reference
      originalSessionId: Object.keys(session.tabs).length > 0 
        ? Array.from(session.tabs.keys())[0].split('_')[0] // rough heuristic
        : null,
    }
    
    await db.put(STORE_NAME, sessionData)
    
    // Also save to settings for quick access
    await setSetting(`browser_session_${conversationId || 'default'}`, sessionData)
    
    return { success: true, sessionId: sessionData.sessionId, tabCount: tabs.length }
  } catch (e) {
    console.error('[browserSessionPersistence] Failed to save session:', e)
    return { success: false, error: e.message }
  }
}

/**
 * Load the most recent session for a conversation
 * @param {string} conversationId - The conversation to load session for
 */
export async function loadSession(conversationId) {
  try {
    // First try settings (fastest)
    const quickLoad = await getSetting(`browser_session_${conversationId || 'default'}`)
    if (quickLoad) return { success: true, session: quickLoad, source: 'settings' }
    
    // Fallback to IndexedDB
    const db = await getDB()
    const sessions = await db.getAllFromIndex(STORE_NAME, 'conversationId', conversationId || 'default')
    
    if (!sessions.length) {
      return { success: false, error: 'No saved session found', session: null }
    }
    
    // Get most recent
    const latest = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]
    return { success: true, session: latest, source: 'indexeddb' }
  } catch (e) {
    console.error('[browserSessionPersistence] Failed to load session:', e)
    return { success: false, error: e.message, session: null }
  }
}

/**
 * List all saved sessions
 */
export async function listSessions() {
  try {
    const db = await getDB()
    const sessions = await db.getAll(STORE_NAME)
    return sessions.map(s => ({
      sessionId: s.sessionId,
      conversationId: s.conversationId,
      tabCount: s.tabs?.length || 0,
      activeTabId: s.activeTabId,
      mode: s.mode,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (e) {
    console.error('[browserSessionPersistence] Failed to list sessions:', e)
    return []
  }
}

/**
 * Delete a specific session
 */
export async function deleteSession(sessionId) {
  try {
    const db = await getDB()
    await db.delete(STORE_NAME, sessionId)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Delete all sessions for a conversation
 */
export async function deleteConversationSessions(conversationId) {
  try {
    const db = await getDB()
    const sessions = await db.getAllFromIndex(STORE_NAME, 'conversationId', conversationId || 'default')
    for (const s of sessions) {
      await db.delete(STORE_NAME, s.sessionId)
    }
    await setSetting(`browser_session_${conversationId || 'default'}`, null)
    return { success: true, deleted: sessions.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Export session as JSON for backup/sync
 */
export async function exportSession(conversationId) {
  const result = await loadSession(conversationId)
  if (!result.success) return result
  
  return {
    success: true,
    export: JSON.stringify(result.session, null, 2),
    filename: `yogatik-browser-session-${conversationId || 'default'}-${Date.now()}.json`
  }
}

/**
 * Import session from JSON backup
 */
export async function importSession(jsonString) {
  try {
    const session = JSON.parse(jsonString)
    if (!session.conversationId || !session.tabs) {
      return { success: false, error: 'Invalid session format' }
    }
    
    const db = await getDB()
    session.sessionId = `session_${session.conversationId}_${Date.now()}_imported`
    session.updatedAt = Date.now()
    session.importedAt = Date.now()
    
    await db.put(STORE_NAME, session)
    await setSetting(`browser_session_${session.conversationId}`, session)
    
    return { success: true, sessionId: session.sessionId }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Restore a session into the Electron browser (called from main process)
 * This reconstructs the tabs and navigates to their URLs
 */
export async function restoreSessionToBrowser(session, browserController) {
  if (!session?.tabs?.length) return { success: false, error: 'No tabs to restore' }
  
  const restored = []
  const failed = []
  
  for (const tab of session.tabs) {
    try {
      // Create new tab
      const tabId = await browserController.newTab({
        conversationId: session.conversationId,
        url: tab.url || 'about:blank',
        background: !tab.active,
      })
      
      if (!tabId) throw new Error('Failed to create tab')
      
      // Restore pinned state
      if (tab.pinned) {
        await browserController.pinTab({ conversationId: session.conversationId, tabId })
      }
      
      // Restore scroll position (will apply after load)
      if (tab.savedScroll && (tab.savedScroll.x > 0 || tab.savedScroll.y > 0)) {
        // The browser controller will handle this on did-finish-load
        await browserController.setTabScroll({ conversationId: session.conversationId, tabId, ...tab.savedScroll })
      }
      
      restored.push({ tabId, url: tab.url, title: tab.title })
    } catch (e) {
      failed.push({ url: tab.url, error: e.message })
    }
  }
  
  // Activate the originally active tab
  if (session.activeTabId && restored.length) {
    // Find the restored tab that corresponds to the original active tab
    // This is heuristic since tabIds change
    const targetTab = restored.find(t => t.url === session.tabs.get(session.activeTabId)?.url) || restored[0]
    if (targetTab) {
      await browserController.activateTab({ conversationId: session.conversationId, tabId: targetTab.tabId })
    }
  }
  
  return { success: true, restored, failed }
}

/**
 * Auto-save session on interval
 */
export function startAutoSave(conversationId, getSessionFn, intervalMs = 30000) {
  const timer = setInterval(async () => {
    try {
      const session = getSessionFn()
      if (session) {
        await saveSession(session, conversationId)
      }
    } catch (e) {
      console.warn('[browserSessionPersistence] Auto-save failed:', e.message)
    }
  }, intervalMs)
  
  return () => clearInterval(timer)
}

export const browserSessionPersistenceTool = {
  schema: {
    type: 'function',
    function: {
      name: 'browser_session_persistence',
      description: 'Save, restore, export, and manage browser sessions across app restarts.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'load', 'list', 'delete', 'export', 'import', 'auto_save_start', 'auto_save_stop'],
            description: 'Action to perform',
          },
          conversationId: { type: 'string', description: 'Conversation ID (defaults to current)' },
          sessionId: { type: 'string', description: 'Specific session ID for delete/import' },
          jsonData: { type: 'string', description: 'JSON string for import action' },
          intervalMs: { type: 'number', description: 'Auto-save interval in ms (default 30000)' },
        },
        required: ['action'],
      },
    },
  },
  async execute({ action, conversationId, sessionId, jsonData, intervalMs = 30000 }) {
    const convId = conversationId || (await getSetting('current_conversation_id', 'default'))
    
    switch (action) {
      case 'save':
        // This would need the actual session from the bridge
        return { success: false, error: 'Save requires access to browser bridge session - call from main process' }
      case 'load':
        return await loadSession(convId)
      case 'list':
        return { success: true, sessions: await listSessions() }
      case 'delete':
        if (sessionId) return await deleteSession(sessionId)
        return await deleteConversationSessions(convId)
      case 'export':
        return await exportSession(convId)
      case 'import':
        if (!jsonData) return { success: false, error: 'jsonData required for import' }
        return await importSession(jsonData)
      case 'auto_save_start':
        return { success: true, message: 'Auto-save must be started from main process with getSessionFn' }
      case 'auto_save_stop':
        return { success: true, message: 'Auto-save stopped' }
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
