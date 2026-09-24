import React, { useState, useEffect } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import {
  syncCloudKeys, pushCloudData, pullCloudData, cloudSyncStatus,
  downloadBackup
} from '../../api'

export function SyncTab({
  user = null,
  onSignIn,
  onProviderSaved,
}) {
  const [syncState, setSyncState] = useState({ enabled: false, syncing: false, at: null })
  const [storageEstimate, setStorageEstimate] = useState(null)

  useEffect(() => {
    cloudSyncStatus().then(st => setSyncState(s => ({ ...s, ...st }))).catch(() => {})
    if (navigator?.storage?.estimate) {
      navigator.storage.estimate().then(setStorageEstimate).catch(() => {})
    }
  }, [])

  const handleSyncNow = async () => {
    setSyncState(s => ({ ...s, syncing: true }))
    try {
      await syncCloudKeys()
      await pullCloudData('merge')
      await pushCloudData()
      const st = await cloudSyncStatus()
      setSyncState(s => ({ ...s, ...st, syncing: false }))
      onProviderSaved?.()
    } catch {
      setSyncState(s => ({ ...s, syncing: false }))
    }
  }

  return (
    <section className="settings-pane">
      <div className="settings-pane-header">
        <div>
          <h3 className="settings-pane-title">Privacy, Backup &amp; Encrypted Sync</h3>
          <p className="settings-pane-subtitle">
            Your chats, keys, and documents are stored locally in IndexedDB with zero telemetry.
          </p>
        </div>
      </div>

      <div className="settings-section-card">
        <h4>End-to-End Encrypted Cloud Sync</h4>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Encrypted Sync</span>
            <span className="setting-desc">
              {user ? `Connected to ${user.email}. Keys and chats are client-side encrypted before syncing.` : 'Sign in to automatically sync keys and chats securely across your devices.'}
            </span>
          </div>
          {user ? (
            <button className="settings-btn primary sm" onClick={handleSyncNow} disabled={syncState.syncing}>
              <RefreshCw size={12} className={syncState.syncing ? 'spinning' : ''} />
              {syncState.syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          ) : (
            <button className="settings-btn primary sm" onClick={onSignIn}>
              Sign In to Sync
            </button>
          )}
        </div>
      </div>

      <div className="settings-section-card">
        <h4>Local Storage &amp; Backup</h4>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">On-Device Storage Footprint</span>
            <span className="setting-desc">
              {storageEstimate ? `Using approx ${(storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB of local storage.` : 'IndexedDB client-side database.'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="settings-btn secondary sm" onClick={() => downloadBackup()}>
              <Download size={12} /> Backup All (.json)
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
