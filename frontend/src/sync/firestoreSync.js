/**
 * Cross-Device Chat Sync using Firebase Firestore.
 * Provides real-time synchronization of encrypted conversations & preferences.
 */

import { fb, ensureFirebaseAuth } from '../firebaseAuth'
import { encryptSecret, decryptSecret } from '../crypto'

const SYNC_COLLECTION = 'user_synced_chats'
const METADATA_COLLECTION = 'user_metadata'
const PREFS_DOC = 'preferences'

let syncEnabled = false
let userId = null
let vaultKey = null
const listeners = new Map()
const pendingWrites = new Set()

/**
 * Initialize Firestore sync with user credentials.
 */
export async function initSync(uid, secretKey) {
  userId = uid || null
  vaultKey = secretKey || null
  syncEnabled = Boolean(userId && vaultKey)
  return syncEnabled
}

/**
 * Enable sync.
 */
export function enableSync() {
  syncEnabled = true
}

/**
 * Disable sync and tear down active listeners.
 */
export function disableSync() {
  syncEnabled = false
  for (const [key, unsub] of listeners.entries()) {
    try { if (typeof unsub === 'function') unsub() } catch {}
    listeners.delete(key)
  }
}

/**
 * Push an encrypted chat to Firestore.
 */
export async function pushChat(chat) {
  if (!syncEnabled || !userId || !vaultKey || !chat?.id) {
    return { success: false, error: 'Sync not enabled' }
  }

  try {
    const f = await fb()
    await ensureFirebaseAuth(f)
    const encrypted = await encryptSecret(JSON.stringify(chat), vaultKey)
    const chatRef = f.doc(f.db, 'users', userId, SYNC_COLLECTION, chat.id)
    
    await f.setDoc(chatRef, {
      data: encrypted,
      userId,
      updatedAt: f.serverTimestamp ? f.serverTimestamp() : new Date(),
    }, { merge: true })

    return { success: true }
  } catch (error) {
    console.error('Push chat failed:', error)
    return { success: false, error: error?.message || String(error) }
  }
}

/**
 * Pull a single chat from Firestore.
 */
export async function pullChat(chatId) {
  if (!syncEnabled || !userId || !vaultKey || !chatId) {
    return { success: false, error: 'Sync not enabled' }
  }

  try {
    const f = await fb()
    await ensureFirebaseAuth(f)
    const chatRef = f.doc(f.db, 'users', userId, SYNC_COLLECTION, chatId)
    const snap = await f.getDoc(chatRef)

    if (!snap.exists()) return { success: false, error: 'Chat not found' }

    const raw = snap.data()?.data
    const decrypted = await decryptSecret(raw, vaultKey)
    return { success: true, chat: JSON.parse(decrypted) }
  } catch (error) {
    console.error('Pull chat failed:', error)
    return { success: false, error: error?.message || String(error) }
  }
}

/**
 * Subscribe to changes on a specific chat.
 */
export function subscribeToChat(chatId, callback) {
  if (!syncEnabled || !userId || !vaultKey || !chatId) return () => {}

  let active = true
  let unsub = () => {}

  fb().then(async (f) => {
    if (!active) return
    await ensureFirebaseAuth(f)
    const chatRef = f.doc(f.db, 'users', userId, SYNC_COLLECTION, chatId)
    unsub = f.onSnapshot(chatRef, async (snap) => {
      if (!snap.exists()) return
      try {
        const raw = snap.data()?.data
        const decrypted = await decryptSecret(raw, vaultKey)
        callback(JSON.parse(decrypted))
      } catch (err) {
        console.warn('Chat decryption error in sync:', err)
      }
    }, (err) => {
      console.error('Chat snapshot error:', err)
    })
    listeners.set(`chat_${chatId}`, unsub)
  }).catch(() => {})

  return () => {
    active = false
    try { unsub() } catch {}
    listeners.delete(`chat_${chatId}`)
  }
}

/**
 * Subscribe to all user's chats list.
 */
export function subscribeToChatList(callback) {
  if (!syncEnabled || !userId) return () => {}

  let active = true
  let unsub = () => {}

  fb().then(async (f) => {
    if (!active) return
    await ensureFirebaseAuth(f)
    const chatsCol = f.collection(f.db, 'users', userId, SYNC_COLLECTION)
    const chatsQuery = f.query(
      chatsCol,
      f.where('userId', '==', userId),
      f.orderBy('updatedAt', 'desc'),
      f.limit(100)
    )

    unsub = f.onSnapshot(chatsQuery, (snap) => {
      const chats = []
      snap.forEach((d) => {
        chats.push({ id: d.id, ...d.data() })
      })
      callback(chats)
    }, (error) => {
      console.error('Chat list subscription error:', error)
      callback([])
    })

    listeners.set('chat_list', unsub)
  }).catch(() => {})

  return () => {
    active = false
    try { unsub() } catch {}
    listeners.delete('chat_list')
  }
}

/**
 * Delete a chat from sync.
 */
export async function deleteChat(chatId) {
  if (!syncEnabled || !userId || !chatId) return { success: false, error: 'Sync not enabled' }

  try {
    const f = await fb()
    await ensureFirebaseAuth(f)
    const chatRef = f.doc(f.db, 'users', userId, SYNC_COLLECTION, chatId)
    await f.deleteDoc(chatRef)
    return { success: true }
  } catch (error) {
    console.error('Delete chat failed:', error)
    return { success: false, error: error?.message || String(error) }
  }
}

/**
 * Sync user preferences/settings.
 */
export async function syncPreferences(prefs) {
  if (!syncEnabled || !userId || !vaultKey) return { success: false, error: 'Sync not enabled' }

  try {
    const f = await fb()
    await ensureFirebaseAuth(f)
    const encrypted = await encryptSecret(JSON.stringify(prefs), vaultKey)
    const metaRef = f.doc(f.db, 'users', userId, METADATA_COLLECTION, PREFS_DOC)
    await f.setDoc(metaRef, {
      data: encrypted,
      userId,
      updatedAt: f.serverTimestamp ? f.serverTimestamp() : new Date(),
    }, { merge: true })
    return { success: true }
  } catch (error) {
    console.error('Sync prefs failed:', error)
    return { success: false, error: error?.message || String(error) }
  }
}

/**
 * Get synced preferences.
 */
export async function getSyncedPreferences() {
  if (!syncEnabled || !userId || !vaultKey) return { success: false, error: 'Sync not enabled' }

  try {
    const f = await fb()
    await ensureFirebaseAuth(f)
    const metaRef = f.doc(f.db, 'users', userId, METADATA_COLLECTION, PREFS_DOC)
    const snap = await f.getDoc(metaRef)
    
    if (!snap.exists()) return { success: false, error: 'No synced prefs' }

    const encrypted = snap.data()?.data
    const decrypted = await decryptSecret(encrypted, vaultKey)
    return { success: true, data: JSON.parse(decrypted) }
  } catch (error) {
    console.error('Get synced prefs failed:', error)
    return { success: false, error: error?.message || String(error) }
  }
}

/**
 * Check if sync is enabled and working.
 */
export function isSyncEnabled() {
  return syncEnabled && !!userId
}

/**
 * Get current sync status.
 */
export function getSyncStatus() {
  return {
    enabled: syncEnabled,
    userId,
    activeListeners: listeners.size,
    pendingWrites: pendingWrites.size,
  }
}

export default {
  initSync,
  enableSync,
  disableSync,
  pushChat,
  pullChat,
  subscribeToChat,
  subscribeToChatList,
  deleteChat,
  syncPreferences,
  getSyncedPreferences,
  isSyncEnabled,
  getSyncStatus,
}
