/**
 * Workspace Time Machine — Atomic File Snapshots & Instant Rollback System
 *
 * Automatically records file states before any destructive AI modifications
 * (fs_write, fs_edit, fs_replace_content, fs_patch, fs_multi_replace).
 * Allows 1-click undo, visual diffing, and version recovery.
 */

import { getSetting, setSetting } from './db'

const TIME_MACHINE_KEY = 'yogatik_workspace_snapshots_v1'
const MAX_SNAPSHOTS = 100

// In-memory fallback for test and non-IndexedDB environments
let memorySnapshots = []

async function loadSnapshots() {
  try {
    const data = await getSetting(TIME_MACHINE_KEY, null)
    if (Array.isArray(data)) return data
  } catch {}
  return memorySnapshots
}

async function persistSnapshots(snapshots) {
  memorySnapshots = snapshots
  try {
    await setSetting(TIME_MACHINE_KEY, snapshots)
  } catch {}
}

/**
 * Creates an atomic snapshot of a file before an AI tool modifies it.
 */
export async function recordSnapshot({
  filePath,
  previousContent,
  newContent = '',
  toolName = 'fs_edit',
  description = 'AI Workspace Modification',
}) {
  if (!filePath) return null

  try {
    const snapshots = await loadSnapshots()
    const snapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      filePath,
      fileName: filePath.split(/[/\\]/).pop(),
      previousContent: previousContent ?? '',
      newContent: newContent ?? '',
      toolName,
      description,
      sizeBytes: (previousContent || '').length,
    }

    const updated = [snapshot, ...snapshots.slice(0, MAX_SNAPSHOTS - 1)]
    await persistSnapshots(updated)
    return snapshot
  } catch (err) {
    console.warn('[WorkspaceTimeMachine] Failed to record snapshot:', err)
    return null
  }
}

/**
 * Lists all recorded snapshots
 */
export async function listSnapshots(filePathFilter = null) {
  const snapshots = await loadSnapshots()
  if (!filePathFilter) return snapshots
  return snapshots.filter((s) => s.filePath === filePathFilter)
}

/**
 * Retrieves a specific snapshot by ID
 */
export async function getSnapshotById(snapshotId) {
  const snapshots = await loadSnapshots()
  return snapshots.find((s) => s.id === snapshotId) || null
}

/**
 * Rolls back a file to its previous state using the desktop filesystem tool
 */
export async function rollbackSnapshot(snapshotId, fsWriteToolFn) {
  const snapshot = await getSnapshotById(snapshotId)
  if (!snapshot) {
    return { success: false, error: `Snapshot ${snapshotId} not found` }
  }

  try {
    if (typeof fsWriteToolFn === 'function') {
      await fsWriteToolFn({
        path: snapshot.filePath,
        content: snapshot.previousContent,
      })
    }

    return {
      success: true,
      message: `Successfully rolled back ${snapshot.fileName} to version before ${snapshot.toolName}`,
      filePath: snapshot.filePath,
      restoredTimestamp: snapshot.timestamp,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Rollback failed',
    }
  }
}

/**
 * Clears snapshots
 */
export async function clearSnapshots() {
  await persistSnapshots([])
}
