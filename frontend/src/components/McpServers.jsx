import React from 'react'
import { Plug, Plus, Trash2, RefreshCw, Server, Sparkles, Check, ChevronDown, ChevronRight, Key, TerminalSquare } from 'lucide-react'
import { getMcpServers, setMcpServers, refreshMcpTools } from '../mcp'

const hasStdio = typeof window !== 'undefined' && !!window.__YOGATIK_MCP_STDIO__

const POPULAR_MCP_PRESETS = [
  {
    id: 'github_copilot',
    name: 'GitHub Copilot MCP',
    url: 'https://api.githubcopilot.com/mcp/',
    desc: 'Search repos, inspect code, read issues / PRs. Requires a GitHub token.',
    badge: 'Git & Code',
    needsToken: true,
  },
  {
    id: 'stripe',
    name: 'Stripe MCP',
    url: 'https://mcp.stripe.com/',
    desc: 'Payments, customers, invoices, and subscriptions via the Stripe API.',
    badge: 'Payments',
    needsToken: true,
  },
  {
    id: 'brave_search',
    name: 'Brave Search MCP',
    url: 'https://api.search.brave.com/mcp',
    desc: 'Privacy-preserving real-time web & news search. Requires Brave API key.',
    badge: 'Search API',
    needsToken: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare MCP',
    url: 'https://mcp.cloudflare.com/',
    desc: 'Manage Workers, KV, D1 databases, and Cloudflare services.',
    badge: 'Cloud',
    needsToken: true,
  },
  {
    id: 'local_desktop',
    name: 'Local Desktop MCP Bridge',
    url: 'http://localhost:3001/mcp',
    desc: 'Connect to your local workstation filesystem & terminal (run locally).',
    badge: 'Local Machine',
    needsToken: false,
  },
]

/** Manage remote MCP servers: add a URL, connect, see discovered tool counts. */
export function McpServers() {
  const [servers, setServers] = React.useState([])
  const [status, setStatus] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [token, setToken] = React.useState('')
  const [expanded, setExpanded] = React.useState({})
  // Local (stdio) server draft — desktop only.
  const [localName, setLocalName] = React.useState('')
  const [localCmd, setLocalCmd] = React.useState('')
  const [localArgs, setLocalArgs] = React.useState('')

  React.useEffect(() => { getMcpServers().then(setServers) }, [])

  const persist = async (next) => { setServers(next); await setMcpServers(next) }

  const add = async (customName, customUrl, customToken) => {
    const u = (customUrl || url).trim()
    if (!/^https?:\/\//i.test(u)) return
    const targetName = (customName || name).trim()
    const id = (targetName || new URL(u).hostname).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    const entry = { id, name: targetName || id, url: u }
    if (customToken || token) entry.token = (customToken || token).trim()
    await persist([...servers.filter(s => s.id !== id), entry])
    if (!customUrl) {
      setName('')
      setUrl('')
      setToken('')
    }
  }

  // Add a LOCAL stdio MCP server (spawned by the desktop app).
  const addLocal = async () => {
    const command = localCmd.trim()
    if (!command) return
    const nm = (localName || command).trim()
    const id = ('local_' + nm).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    // Split args respecting simple quoted segments.
    const args = (localArgs.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(a => a.replace(/^["']|["']$/g, ''))
    const entry = { id, name: nm, transport: 'stdio', command, args }
    await persist([...servers.filter(s => s.id !== id), entry])
    setLocalName(''); setLocalCmd(''); setLocalArgs('')
  }

  const remove = async (id) => persist(servers.filter(s => s.id !== id))

  const connect = async () => {
    setBusy(true)
    try { setStatus(await refreshMcpTools()) } finally { setBusy(false) }
  }

  return (
    <section className="personalise-group">
      <h4><Plug size={13} /> MCP Connectors (Model Context Protocol)</h4>
      <p className="personalise-hint">
        Connect remote Streamable HTTP / SSE MCP servers to dynamically discover new tools.
        The server must send standard CORS headers to allow browser access.
      </p>

      {/* Connected Servers List */}
      {servers.map(s => {
        const st = status.find(x => x.id === s.id)
        const isExp = expanded[s.id]
        return (
          <div className="toggle-row" key={s.id} style={{ alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexDirection: 'column' }}>
            <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
              <label title={s.transport === 'stdio' ? `${s.command} ${(s.args || []).join(' ')}` : s.url} style={{ flex: 1, cursor: 'pointer' }} onClick={() => st?.ok && setExpanded(e => ({ ...e, [s.id]: !e[s.id] }))}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.transport === 'stdio' ? <TerminalSquare size={12} color="#a78bfa" /> : <Server size={12} color="#38BDF8" />}
                  {s.name}
                  {s.transport === 'stdio' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>local</span>}
                  {s.token && <Key size={10} color="#fbbf24" title="Auth token configured" />}
                  {st?.ok && (
                    <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>
                      {isExp ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                  )}
                </div>
                <span className="personalise-sub" style={{ wordBreak: 'break-all', fontSize: 11 }}>
                  {s.transport === 'stdio' ? `${s.command} ${(s.args || []).join(' ')}` : s.url}
                </span>
                {st && (
                  <span className="personalise-sub" style={{ color: st.ok ? '#10B981' : '#EF4444', fontWeight: 500 }}>
                    {st.ok
                      ? `✓ ${st.tools} tool${st.tools !== 1 ? 's' : ''}${st.resources ? ` · ${st.resources} resources` : ''}${st.prompts ? ` · ${st.prompts} prompts` : ''}${st.latencyMs != null ? ` · ${st.latencyMs}ms` : ''}`
                      : `✕ ${st.error}`}
                  </span>
                )}
              </label>
              <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`} title="Remove server">
                <Trash2 size={13} />
              </button>
            </div>
            {isExp && st?.toolNames?.length > 0 && (
              <div style={{ marginTop: 4, marginLeft: 18, display: 'flex', flexWrap: 'wrap', gap: '3px 6px' }}>
                {st.toolNames.map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Popular Presets */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={11} color="#ff6b35" /> Popular MCP Connector Presets:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {POPULAR_MCP_PRESETS.map(preset => {
            const isAdded = servers.some(s => s.url === preset.url)
            return (
              <div key={preset.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
                gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{preset.name}</span>
                    <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', fontWeight: 600 }}>
                      {preset.badge}
                    </span>
                    {preset.needsToken && (
                      <span style={{ fontSize: 9, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Key size={9} /> token required
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {preset.desc}
                  </div>
                </div>
                <button
                  className="small-btn"
                  onClick={() => add(preset.name, preset.url)}
                  disabled={isAdded}
                  style={{ flexShrink: 0, fontSize: 11, padding: '3px 8px' }}
                >
                  {isAdded ? <><Check size={11} /> Added</> : <><Plus size={11} /> Add</>}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom Add Row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Connector Name"
          style={{ flex: '1 1 120px' }}
        />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://mcp.server.com/mcp"
          style={{ flex: '2 1 200px' }}
        />
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Bearer token (optional)"
          style={{ flex: '1 1 150px' }}
        />
        <button className="small-btn" onClick={() => add()} disabled={!url.trim()}>
          <Plus size={12} /> Add
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
        <Key size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />
        Token is stored locally and sent as an Authorization Bearer header.
      </div>

      {/* Local (stdio) server — desktop only */}
      {hasStdio && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TerminalSquare size={12} color="#a78bfa" /> Local (stdio) MCP server — runs on your computer
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={localName} onChange={e => setLocalName(e.target.value)} placeholder="Name (e.g. Filesystem)" style={{ flex: '1 1 120px' }} />
            <input value={localCmd} onChange={e => setLocalCmd(e.target.value)} placeholder="Command (e.g. npx)" style={{ flex: '1 1 120px' }} />
            <input value={localArgs} onChange={e => setLocalArgs(e.target.value)} placeholder='Args (e.g. -y @modelcontextprotocol/server-filesystem .)' style={{ flex: '2 1 220px' }} />
            <button className="small-btn" onClick={addLocal} disabled={!localCmd.trim()}>
              <Plus size={12} /> Add local
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
            The command is spawned on your machine and spoken to over stdio — reaches local servers (filesystem, git, sqlite) the browser can’t.
          </div>
        </div>
      )}

      {servers.length > 0 && (
        <button className="small-btn" onClick={connect} disabled={busy} style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}>
          <RefreshCw size={12} className={busy ? 'spin' : ''} /> {busy ? 'Connecting & Discovering Tools…' : 'Connect & Discover Tools'}
        </button>
      )}
    </section>
  )
}
