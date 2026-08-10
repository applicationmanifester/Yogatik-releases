import React from 'react'
import { Plug, Plus, Trash2, RefreshCw } from 'lucide-react'
import { getMcpServers, setMcpServers, refreshMcpTools } from '../mcp'

/** Manage remote MCP servers: add a URL, connect, see discovered tool counts. */
export function McpServers() {
  const [servers, setServers] = React.useState([])
  const [status, setStatus] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')

  React.useEffect(() => { getMcpServers().then(setServers) }, [])

  const persist = async (next) => { setServers(next); await setMcpServers(next) }

  const add = async () => {
    const u = url.trim()
    if (!/^https:\/\//i.test(u)) return
    const id = (name.trim() || new URL(u).hostname).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    await persist([...servers.filter(s => s.id !== id), { id, name: name.trim() || id, url: u }])
    setName(''); setUrl('')
  }

  const remove = async (id) => persist(servers.filter(s => s.id !== id))

  const connect = async () => {
    setBusy(true)
    try { setStatus(await refreshMcpTools()) } finally { setBusy(false) }
  }

  return (
    <section className="personalise-group">
      <h4><Plug size={13} /> MCP connectors</h4>
      <p className="personalise-hint">
        Connect remote MCP servers (Streamable HTTP) to add their tools. The server must send
        CORS headers to be reachable from the browser.
      </p>

      {servers.map(s => {
        const st = status.find(x => x.id === s.id)
        return (
          <div className="toggle-row" key={s.id}>
            <label title={s.url}>
              {s.name}
              <span className="personalise-sub">{s.url}</span>
              {st && <span className="personalise-sub">{st.ok ? `✓ ${st.tools} tools` : `✕ ${st.error}`}</span>}
            </label>
            <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`}>
              <Trash2 size={13} />
            </button>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)"
          style={{ flex: '1 1 120px' }} />
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mcp.example.com/…"
          style={{ flex: '2 1 200px' }} />
        <button className="small-btn" onClick={add}><Plus size={12} /> Add</button>
      </div>

      {servers.length > 0 && (
        <button className="small-btn" onClick={connect} disabled={busy} style={{ marginTop: 8 }}>
          <RefreshCw size={12} /> {busy ? 'Connecting…' : 'Connect & discover tools'}
        </button>
      )}
    </section>
  )
}
