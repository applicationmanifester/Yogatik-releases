import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Database, Trash2, Download, Upload, X, BarChart3, HardDrive, Sparkles, Zap, DollarSign } from 'lucide-react'
import { allMemories, forget, STORES } from '../memory4'
import { exportFullWorkspaceArchive, importFullWorkspaceArchive } from '../workspaceArchive'
import { getUsageSummary, clearUsageRecords } from '../usageAnalytics'
import { storageReport, optimizeAndCleanStorage, formatBytes } from '../storage'

/**
 * Data & Analytics Dashboard — memory control, usage & cost breakdown, and storage optimization.
 */
const STORE_LABELS = {
  episodic: 'Events (episodic)',
  semantic: 'Facts (semantic)',
  procedural: 'Preferences (procedural)',
  emotional: 'Emotional context (local-only)',
}

export default function DataDashboard({ onClose, onExport }) {
  const [activeTab, setActiveTab] = useState('analytics') // 'analytics' | 'memory'
  const [byStore, setByStore] = useState(null)
  const [usage, setUsage] = useState(() => getUsageSummary())
  const [storage, setStorage] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const fileInputRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const all = await allMemories()
      const grouped = Object.fromEntries(STORES.map(s => [s, []]))
      for (const m of all) (grouped[m.store] || (grouped[m.store] = [])).push(m)
      setByStore(grouped)
    } catch { setByStore({}) }

    try {
      const rep = await storageReport()
      setStorage(rep)
    } catch {}

    setUsage(getUsageSummary())
  }, [])

  useEffect(() => { load() }, [load])

  const removeOne = async (id) => { await forget(id); load() }
  const clearStore = async (store) => {
    const items = byStore?.[store] || []
    if (!items.length) return
    if (!window.confirm(`Delete all ${items.length} ${store} memories? This cannot be undone.`)) return
    await Promise.all(items.map(m => forget(m.id)))
    load()
  }

  const handleFullExport = async () => {
    try {
      setStatusMsg('Exporting complete workspace archive…')
      const res = await exportFullWorkspaceArchive()
      setStatusMsg(`Exported ${res.count} chats and memories to .yogatik archive!`)
      setTimeout(() => setStatusMsg(''), 4000)
    } catch (e) {
      setStatusMsg(`Export failed: ${e.message}`)
    }
  }

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setStatusMsg('Restoring workspace from archive…')
      const res = await importFullWorkspaceArchive(file)
      setStatusMsg(`Restored ${res.conversationsCount} chats and ${res.memoriesCount} memories!`)
      load()
      setTimeout(() => setStatusMsg(''), 4000)
    } catch (err) {
      setStatusMsg(`Import failed: ${err.message}`)
    }
  }

  const handleOptimizeStorage = async () => {
    setOptimizing(true)
    try {
      const res = await optimizeAndCleanStorage({ maxAgeDays: 30 })
      setStatusMsg(`Storage cleaned! Purged ${res.purgedTraces} old traces and ${res.purgedMedia} cached media blobs.`)
      await load()
      setTimeout(() => setStatusMsg(''), 4000)
    } catch (e) {
      setStatusMsg(`Storage optimization failed: ${e.message}`)
    } finally {
      setOptimizing(false)
    }
  }

  const handleClearUsage = () => {
    if (!window.confirm('Reset local usage and token counters?')) return
    clearUsageRecords()
    setUsage(getUsageSummary())
    setStatusMsg('Usage metrics reset.')
    setTimeout(() => setStatusMsg(''), 3000)
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette data-dashboard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Your data" style={{ width: 'min(680px, 96%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="palette-input-bar" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Data, Usage &amp; Storage Hub</h3>
          </div>
          <button className="palette-clear-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-input, rgba(0,0,0,0.15))', padding: '0 12px' }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
            style={{
              padding: '10px 14px', background: 'none', border: 'none',
              borderBottom: activeTab === 'analytics' ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
              color: activeTab === 'analytics' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <BarChart3 size={14} /> Usage &amp; Cost Analytics
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'memory' ? 'active' : ''}`}
            onClick={() => setActiveTab('memory')}
            style={{
              padding: '10px 14px', background: 'none', border: 'none',
              borderBottom: activeTab === 'memory' ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
              color: activeTab === 'memory' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <HardDrive size={14} /> Memory &amp; Storage Quota
          </button>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div style={{ margin: '10px 18px 0', padding: '8px 12px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent, #6366f1)', fontSize: 12, border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            {statusMsg}
          </div>
        )}

        {/* Content Body */}
        <div className="palette-list" style={{ padding: '14px 18px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activeTab === 'analytics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Analytics Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div style={{ background: 'var(--bg-tertiary, rgba(255,255,255,0.04))', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', padding: '12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Requests</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{usage.totalRequests}</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary, rgba(255,255,255,0.04))', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', padding: '12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Tokens</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--accent, #6366f1)' }}>{usage.totalTokens.toLocaleString()}</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary, rgba(255,255,255,0.04))', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', padding: '12px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Estimated Spend</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: '#10b981' }}>${usage.totalCost.toFixed(4)}</div>
                </div>
              </div>

              {/* Provider Breakdown */}
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-primary)' }}>Usage by Provider</h4>
                {Object.keys(usage.byProvider).length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No provider requests logged yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(usage.byProvider).map(([prov, data]) => (
                      <div key={prov} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-tertiary, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                        <div>
                          <strong style={{ fontSize: 12, textTransform: 'capitalize' }}>{prov}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.requests} turns · {data.tokens.toLocaleString()} tokens</div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>${data.cost.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Models */}
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-primary)' }}>Top Models</h4>
                {Object.keys(usage.byModel).length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No model usage recorded yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(usage.byModel).slice(0, 5).map(([mod, data]) => (
                      <div key={mod} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-tertiary, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 12 }}>{mod}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.tokens.toLocaleString()} tokens</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="small-btn" onClick={handleClearUsage} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Reset Usage Counters
                </button>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Storage Quota Card */}
              {storage && (
                <div style={{ padding: '12px', borderRadius: 8, background: 'var(--bg-tertiary, rgba(255,255,255,0.04))', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 12.5 }}>Local IndexedDB Quota</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {formatBytes(storage.used)} / {formatBytes(storage.quota)} ({storage.pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ height: '100%', width: `${Math.max(2, storage.pct)}%`, background: storage.pct > 80 ? '#ef4444' : 'var(--accent, #6366f1)', borderRadius: 3 }} />
                  </div>
                  <button
                    className="small-btn"
                    onClick={handleOptimizeStorage}
                    disabled={optimizing}
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Sparkles size={12} /> {optimizing ? 'Cleaning…' : 'Optimize & Clean Old Traces'}
                  </button>
                </div>
              )}

              {/* Memory Stores List */}
              {byStore == null ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
              ) : STORES.every(s => !(byStore[s] || []).length) ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing remembered yet. As you chat, Yogatik will keep useful facts and preferences here — all on your device, all deletable.</p>
              ) : STORES.map(store => {
                const items = byStore[store] || []
                return (
                  <div key={store}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{STORE_LABELS[store]}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{items.length}</span>
                      {items.length > 0 && (
                        <button className="small-btn" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, color: 'var(--error)' }}
                          onClick={() => clearStore(store)}>Clear all</button>
                      )}
                    </div>
                    {items.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', color: 'var(--text-secondary)' }}>
                        <span style={{ flex: 1 }}>{m.text}</span>
                        <button className="icon-btn" title="Forget this" aria-label="Forget this memory"
                          onClick={() => removeOne(m.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="palette-footer" style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 160 }}>All data is stored locally in your private IndexedDB.</span>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".yogatik,.json"
            style={{ display: 'none' }}
          />
          <button className="small-btn" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Upload size={12} /> Restore .yogatik
          </button>
          <button className="small-btn btn-primary" onClick={handleFullExport} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={12} /> Full Backup (.yogatik)
          </button>
          <button className="small-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

