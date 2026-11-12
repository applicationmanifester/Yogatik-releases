/**
 * Cross-Device Chat Sync using Firebase Firestore (continued).
 */

// Subscribe to all user's chats list.
export function subscribeToChatList(callback) {
  if (!syncEnabled || !db || !userId) return () => {}

  const chatsQuery = query(
    collection(db, SYNC_COLLECTION),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc'),
    limit(100)
  )

  const unsubscribe = onSnapshot(chatsQuery, (snap) => {
    const chats = []
    snap.forEach((doc) => {
      chats.push({ id: doc.id, ...doc.data() })
    })
    callback(chats)
  }, (error) => {
    console.error('Chat list subscription error:', error)
    callback([])
  })

  listeners.set('chat_list', unsubscribe)
  return unsubscribe
}

/**
 * Delete a chat from sync.
 */
export async function deleteChat(chatId) {
  if (!syncEnabled || !db || !userId) return { success: false, error: 'Sync not enabled' }

  try {
    const chatRef = doc(db, SYNC_COLLECTION, chatId)
    await deleteDoc(chatRef)
    return { success: true }
  } catch (error) {
    console.error('Delete chat failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Sync user preferences/settings.
 */
export async function syncPreferences(prefs) {
  if (!syncEnabled || !db || !userId) return { success: false, error: 'Sync not enabled' }

  try {
    const encrypted = await encryptChatData(prefs)
    const metaRef = doc(db, METADATA_COLLECTION, prefs_)
    await setDoc(metaRef, {
      data: encrypted,
      userId,
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return { success: true }
  } catch (error) {
    console.error('Sync prefs failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get synced preferences.
 */
export async function getSyncedPreferences() {
  if (!syncEnabled || !db || !userId) return { success: false, error: 'Sync not enabled' }

  try {
    const metaRef = doc(db, METADATA_COLLECTION, prefs_)
    const snap = await getDoc(metaRef)
    
    if (!snap.exists()) return { success: false, error: 'No synced prefs' }

    const encrypted = snap.data().data
    const decrypted = await decryptChatData(encrypted)
    return { success: true, data: decrypted }
  } catch (error) {
    console.error('Get synced prefs failed:', error)
    return { success: false, error: error.message }
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
