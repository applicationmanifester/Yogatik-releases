import React from 'react'
import { Package, Plus, Trash2, Upload, Download, Check, X } from 'lucide-react'
import {
  getPlugins, installPlugin, uninstallPlugin, setPluginEnabled, exportPlugin, parsePlugin,
} from '../plugins'

/**
 * Install / enable / share plugin bundles (agents + skills + MCP servers).
 * A plugin composes existing building blocks — no arbitrary code runs.
 */
export function PluginsManager({ onShowToast } = {}) {
  const [plugins, setPlugins] = React.useState([])
  const [draft, setDraft] = React.useState('')
  const [err, setErr] = React.useState('')
  const fileRef = React.useRef(null)

  const load = React.useCallback(() => { getPlugins().then(setPlugins) }, [])
  React.useEffect(() => { load() }, [load])

  const install = async (json) => {
    setErr('')
    try {
      const p = await installPlugin(parsePlugin(json))
      setDraft('')
      load()
      onShowToast?.(`Installed “${p.name}”`)
    } catch (e) {
      setErr(e.message || 'Invalid plugin JSON')
    }
  }

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { await install(await file.text()) } catch { setErr('Could not read that file') }
    e.target.value = ''
  }

  const toggle = async (id, on) => { await setPluginEnabled(id, on); load() }
  const remove = async (id) => { await uninstallPlugin(id); load() }

  const exportOne = (p) => {
    const blob = new Blob([exportPlugin(p)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.id || 'plugin'}.yogatik-plugin.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const contribCount = (p) =>
    [['agents', p.agents], ['skills', p.skills], ['servers', p.mcpServers]]
      .filter(([, v]) => v?.length)
      .map(([k, v]) => `${v.length} ${k}`)
      .join(' · ') || 'no contributions'

  return (
    <section className="personalise-group">
      <h4><Package size={13} /> Plugins & extensions</h4>
      <p className="personalise-hint">
        Install bundles that add agents, skills and MCP connectors together. Enable, disable, or share them —
        nothing runs arbitrary code; a plugin composes existing building blocks.
      </p>

      {plugins.map(p => (
        <div className="toggle-row" key={p.id} style={{ alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={12} color="#f59e0b" /> {p.name}
              <span style={{ fontSize: 10, color: '#94a3b8' }}>v{p.version}</span>
            </div>
            {p.description && <span className="personalise-sub" style={{ fontSize: 11 }}>{p.description}</span>}
            <span className="personalise-sub" style={{ fontSize: 10, color: '#94a3b8' }}>{contribCount(p)}</span>
          </div>
          <label className="switch" title={p.enabled ? 'Enabled' : 'Disabled'} style={{ marginRight: 6 }}>
            <input type="checkbox" checked={p.enabled !== false} onChange={e => toggle(p.id, e.target.checked)} />
            <span className="slider" />
          </label>
          <button className="icon-btn" onClick={() => exportOne(p)} title="Export / share"><Download size={13} /></button>
          <button className="icon-btn" onClick={() => remove(p.id)} title="Uninstall"><Trash2 size={13} /></button>
        </div>
      ))}
      {!plugins.length && <p className="personalise-sub" style={{ fontSize: 11, opacity: 0.7 }}>No plugins installed yet.</p>}

      <div style={{ marginTop: 12 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder='Paste plugin JSON here, e.g. {"name":"My Pack","agents":[…],"mcpServers":[…]}'
          rows={3}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
        />
        {err && <div style={{ color: '#EF4444', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><X size={11} /> {err}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="small-btn" onClick={() => install(draft)} disabled={!draft.trim()}>
            <Plus size={12} /> Install from JSON
          </button>
          <button className="small-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={12} /> Import file
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImportFile} style={{ display: 'none' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Check size={9} /> Enabled plugins’ agents & skills appear in their panels; MCP servers appear in the connector list above.
        </div>
      </div>
    </section>
  )
}
