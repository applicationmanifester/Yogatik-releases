/**
 * Cross-Device Chat & Context Sync Service
 * Works seamlessly with offline IndexedDB (Dexie) and remote Firestore backup/sync
 */

import type { ChatSession, UserPreferences } from '@/types';

export interface SyncState {
  lastSyncedAt: number | null;
  isSyncing: boolean;
  error: string | null;
}

export class ChatSyncManager {
  private syncState: SyncState = {
    lastSyncedAt: null,
    isSyncing: false,
    error: null,
  };

  getSyncState(): SyncState {
    return { ...this.syncState };
  }

  /**
   * Check if browser storage persistence is granted
   */
  async checkStoragePersistence(): Promise<{ persisted: boolean; canPrompt: boolean }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      const isPersisted = await navigator.storage.persisted();
      return { persisted: isPersisted, canPrompt: !isPersisted && Boolean(navigator.storage.persist) };
    }
    return { persisted: true, canPrompt: false };
  }

  /**
   * Request persistent storage to prevent browser eviction
   */
  async requestStoragePersistence(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
    return false;
  }

  /**
   * Export all sessions as clean JSON backup
   */
  exportBackup(sessions: ChatSession[], preferences?: UserPreferences): string {
    const payload = {
      version: '1.0.0',
      exportedAt: Date.now(),
      app: 'Yogatik',
      preferences,
      sessions,
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Import and validate JSON backup
   */
  importBackup(jsonString: string): { sessions: ChatSession[]; preferences?: UserPreferences } {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !Array.isArray(parsed.sessions)) {
        throw new Error('Invalid backup format: missing sessions array');
      }
      return {
        sessions: parsed.sessions,
        preferences: parsed.preferences,
      };
    } catch (err: any) {
      throw new Error(`Failed to import backup: ${err.message}`);
    }
  }
}

export const chatSyncManager = new ChatSyncManager();
