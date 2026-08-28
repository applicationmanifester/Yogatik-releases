import React from 'react'
import { Database, Trash2, Download, Upload, X } from 'lucide-react'
import { allMemories, forget, STORES } from '../memory4'
import { exportFullWorkspaceArchive, importFullWorkspaceArchive } from '../workspaceArchive'

/**
 * Data-usage dashboard — user-owned data transparency & control. Shows the
 * four structured memory stores with counts, lets the user delete individual
 * memories or a whole store, and export/import full workspace archives.
 *
 * @param {() => void} onClose
 * @param {() => void} onExport  wire to downloadBackup()
 */
const STORE_LABELS = {
  episodic: 'Events (episodic)',
  semantic: 'Facts (semantic)',
  procedural: 'Preferences (procedural)',
  emotional: 'Emotional context (local-only)',
}

export default function DataDashboard({ onClose, onExport }) {
  const [byStore, setByStore] = React.useState(null)
  const [statusMsg, setStatusMsg] = React.useState('')
  const fileInputRef = React.useRef(null)

  const load = React.useCallback(async () => {
    try {
      const all = await allMemories()
      const grouped = Object.fromEntries(STORES.map(s => [s, []]))
      for (const m of all) (grouped[m.store] || (grouped[m.store] = [])).push(m)
      setByStore(grouped)
    } catch { setByStore({}) }
  }, [])

  React.useEffect(() => { load() }, [load])

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

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette data-dashboard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Your data" style={{ width: 'min(640px, 96%)', maxHeight: '82vh' }}>
        <div className="palette-input-bar" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Database size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Your data — memory &amp; full workspace backup</h3>
          </div>
          <button className="palette-clear-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="palette-list" style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {statusMsg && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent, #6366f1)', fontSize: 12, border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              {statusMsg}
            </div>
          )}
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

        <div className="palette-footer" style={{ padding: '10px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 160 }}>All memory lives on your device.</span>
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
