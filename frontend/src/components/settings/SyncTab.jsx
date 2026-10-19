import React, { useState, useEffect } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import {
  syncCloudKeys, pushCloudData, pullCloudData, cloudSyncStatus,
  downloadBackup
} from '../../api'
import { pullPrefs, pushPrefs } from '../../prefsSync'
import { AnalyticsToggle } from '../AnalyticsToggle'
import AuditPanel from '../AuditPanel'

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
      // Manual Sync Now bypasses the auto-sync gate, and that is the point:
      // "bring everything over" means prefs and feature flags too, not just
      // chats. Field-level LWW resolves inside prefsSync; both best-effort.
      try { await pullPrefs({ force: true }) } catch { /* prefs are best-effort */ }
      try { await pushPrefs({ force: true }) } catch { /* prefs are best-effort */ }
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

      <AnalyticsToggle />

      {/* The audit panel lives beside the analytics toggle — both are "what
          does this app record / send" transparency surfaces. It pulls its data
          through auditTrail.js itself; SyncTab passes no props. */}
      <AuditPanel />

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
