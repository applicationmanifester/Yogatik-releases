import React from 'react'
import {
  Plug, Plus, Trash2, RefreshCw, Server, Sparkles, Check, ChevronDown, ChevronRight,
  Key, TerminalSquare, Search, Play, Activity, Power, Database, FolderGit2, Cpu, Globe, Brain, HelpCircle
} from 'lucide-react'
import { getMcpServers, setMcpServers, refreshMcpTools, pingMcpServer, testMcpTool, getMcpSchemas } from '../mcp'
// Single source of truth for the curated preset list — also read by
// mcpRegistry.js's detectMcpNeed() for auto-reconnect/suggestion. Keeping one
// copy here (this codebase has shipped a second, drifted copy of a list one
// too many times already — the youtube.js relay list, the old context-limits
// table) is the whole reason this import exists instead of a local literal.
import { KNOWN_MCP_SERVERS } from '../mcpRegistry'

const hasStdio = typeof window !== 'undefined' && !!window.__YOGATIK_MCP_STDIO__

const POPULAR_MCP_PRESETS = KNOWN_MCP_SERVERS

/** Manage remote & local MCP servers: add, connect, test tools, inspect schemas. */
export function McpServers() {
  const [servers, setServers] = React.useState([])
  const [status, setStatus] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [token, setToken] = React.useState('')
  const [expanded, setExpanded] = React.useState({})
  const [pingStatus, setPingStatus] = React.useState({})

  // Local (stdio) server draft — desktop only.
  const [localName, setLocalName] = React.useState('')
  const [localCmd, setLocalCmd] = React.useState('')
  const [localArgs, setLocalArgs] = React.useState('')

  // Interactive tool runner state
  const [activeTestTool, setActiveTestTool] = React.useState(null) // { serverId, toolName, schema }
  const [testArgsJson, setTestArgsJson] = React.useState('{}')
  const [testResult, setTestResult] = React.useState(null)
  const [testingTool, setTestingTool] = React.useState(false)

  React.useEffect(() => {
    getMcpServers().then(s => {
      setServers(s)
    })
  }, [])

  const persist = async (next) => {
    setServers(next)
    await setMcpServers(next)
  }

  const add = async (customName, customUrl, customToken) => {
    const u = (customUrl || url).trim()
    if (!/^https?:\/\//i.test(u)) return
    const targetName = (customName || name).trim()
    const id = (targetName || new URL(u).hostname).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    const entry = { id, name: targetName || id, url: u, enabled: true }
    if (customToken || token) entry.token = (customToken || token).trim()
    await persist([...servers.filter(s => s.id !== id), entry])
    if (!customUrl) {
      setName('')
      setUrl('')
      setToken('')
    }
  }

  const addLocal = async (preset) => {
    if (preset && preset.command) {
      const id = preset.id
      const entry = {
        id,
        name: preset.name,
        transport: 'stdio',
        command: preset.command,
        args: preset.args || [],
        enabled: true,
      }
      await persist([...servers.filter(s => s.id !== id), entry])
      return
    }

    const command = localCmd.trim()
    if (!command) return
    const nm = (localName || command).trim()
    const id = ('local_' + nm).replace(/[^a-z0-9]+/gi, '_').toLowerCase()
    const args = (localArgs.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(a => a.replace(/^["']|["']$/g, ''))
    const entry = { id, name: nm, transport: 'stdio', command, args, enabled: true }
    await persist([...servers.filter(s => s.id !== id), entry])
    setLocalName('')
    setLocalCmd('')
    setLocalArgs('')
  }

  const toggleServer = async (id) => {
    const next = servers.map(s => s.id === id ? { ...s, enabled: s.enabled === false ? true : false } : s)
    await persist(next)
  }

  const remove = async (id) => persist(servers.filter(s => s.id !== id))

  const connect = async () => {
    setBusy(true)
    try {
      const res = await refreshMcpTools()
      setStatus(res)
    } finally {
      setBusy(false)
    }
  }

  const pingServer = async (server) => {
    setPingStatus(p => ({ ...p, [server.id]: { checking: true } }))
    const res = await pingMcpServer(server)
    setPingStatus(p => ({ ...p, [server.id]: res }))
  }

  const openToolTester = (serverId, toolName) => {
    const schemas = getMcpSchemas()
    const found = schemas.find(s => s.function.name === `mcp__${serverId}__${toolName}`)
    setActiveTestTool({
      serverId,
      toolName,
      schema: found?.function || {},
    })
    setTestArgsJson('{}')
    setTestResult(null)
  }

  const executeTest = async () => {
    if (!activeTestTool) return
    setTestingTool(true)
    setTestResult(null)
    try {
      let parsed = {}
      try {
        parsed = JSON.parse(testArgsJson)
      } catch (err) {
        setTestResult({ success: false, error: `Invalid JSON parameters: ${err.message}` })
        return
      }
      const res = await testMcpTool(activeTestTool.serverId, activeTestTool.toolName, parsed)
      setTestResult(res)
    } finally {
      setTestingTool(false)
    }
  }

  const filteredPresets = POPULAR_MCP_PRESETS.filter(p => !p.desktopOnly || hasStdio)

  const filteredServers = servers.filter(s => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return s.name?.toLowerCase().includes(q) || s.url?.toLowerCase().includes(q) || s.command?.toLowerCase().includes(q)
  })

  return (
    <section className="personalise-group">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plug size={14} color="#38bdf8" /> MCP Connectors (Model Context Protocol)
        </h4>
        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(56,189,248,0.12)', color: '#38bdf8', fontWeight: 600 }}>
          MCP 2025/2026 Ready
        </span>
      </div>

      <p className="personalise-hint" style={{ marginBottom: 12 }}>
        Connect remote Streamable HTTP / SSE servers or local machine processes (stdio) to dynamically discover tools, resources, and prompt templates.
      </p>

      {/* Global Search Filter */}
      {servers.length > 2 && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-muted, #94a3b8)' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search configured connectors..."
            style={{ width: '100%', paddingLeft: 26, fontSize: 11, height: 28 }}
          />
        </div>
      )}

      {/* Configured Connectors List */}
      {filteredServers.map(s => {
        const st = status.find(x => x.id === s.id)
        const isExp = expanded[s.id]
        const ping = pingStatus[s.id]
        const isEnabled = s.enabled !== false

        return (
          <div
            className="toggle-row"
            key={s.id}
            style={{
              alignItems: 'flex-start',
              padding: '10px',
              marginBottom: 8,
              borderRadius: 8,
              background: isEnabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
              border: `1px solid ${isEnabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}`,
              flexDirection: 'column',
              opacity: isEnabled ? 1 : 0.6,
            }}
          >
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
              {/* Enable / Disable toggle */}
              <button
                className="icon-btn"
                onClick={() => toggleServer(s.id)}
                title={isEnabled ? 'Disable connector' : 'Enable connector'}
                style={{ color: isEnabled ? '#10B981' : '#64748b' }}
              >
                <Power size={13} />
              </button>

              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => st?.ok && setExpanded(e => ({ ...e, [s.id]: !e[s.id] }))}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  {s.transport === 'stdio' ? <TerminalSquare size={13} color="#a78bfa" /> : <Server size={13} color="#38BDF8" />}
                  <span>{s.name}</span>
                  {s.transport === 'stdio' ? (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>stdio</span>
                  ) : (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>http</span>
                  )}
                  {s.token && <Key size={10} color="#fbbf24" title="Auth token configured" />}
                  {ping?.ok && (
                    <span style={{ fontSize: 9, color: '#10B981', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Activity size={9} /> {ping.latencyMs}ms
                    </span>
                  )}
                  {st?.ok && (
                    <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>
                      {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  )}
                </div>

                <div className="personalise-sub" style={{ wordBreak: 'break-all', fontSize: 10.5, marginTop: 2 }}>
                  {s.transport === 'stdio' ? `${s.command} ${(s.args || []).join(' ')}` : s.url}
                </div>

                {st && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 10.5 }}>
                    {st.ok ? (
                      <>
                        <span style={{ color: '#10B981', fontWeight: 600 }}>✓ {st.tools} tools</span>
                        {st.resources > 0 && <span style={{ color: '#38bdf8' }}>· {st.resources} resources</span>}
                        {st.templates > 0 && <span style={{ color: '#c084fc' }}>· {st.templates} templates</span>}
                        {st.prompts > 0 && <span style={{ color: '#f59e0b' }}>· {st.prompts} prompts</span>}
                        {st.latencyMs != null && <span style={{ color: '#94a3b8' }}>· {st.latencyMs}ms</span>}
                      </>
                    ) : (
                      <span style={{ color: '#EF4444', fontWeight: 500 }}>✕ {st.error}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Ping button */}
              <button
                className="icon-btn"
                onClick={() => pingServer(s)}
                disabled={ping?.checking}
                title="Ping server health"
                style={{ color: '#94a3b8' }}
              >
                <Activity size={12} className={ping?.checking ? 'spin' : ''} />
              </button>

              {/* Remove button */}
              <button className="icon-btn" onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`} title="Remove server">
                <Trash2 size={12} />
              </button>
            </div>

            {/* Expandable Tools List & Inspector */}
            {isExp && st?.toolNames?.length > 0 && (
              <div style={{ marginTop: 8, paddingLeft: 24, width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>Discovered Tools:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px' }}>
                  {st.toolNames.map(t => (
                    <div
                      key={t}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(56,189,248,0.1)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56,189,248,0.2)',
                      }}
                    >
                      <span>{t}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openToolTester(s.id, t)
                        }}
                        title={`Test tool ${t}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          color: '#10B981',
                        }}
                      >
                        <Play size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Interactive Tool Test Runner Modal/Panel */}
      {activeTestTool && (
        <div style={{
          marginTop: 10,
          padding: 10,
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Play size={12} /> Test Tool: <code>mcp__{activeTestTool.serverId}__{activeTestTool.toolName}</code>
            </div>
            <button className="small-btn" onClick={() => setActiveTestTool(null)} style={{ padding: '1px 6px', fontSize: 10 }}>
              Close
            </button>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginBottom: 6 }}>
            {activeTestTool.schema.description || 'No description provided.'}
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 2 }}>Arguments (JSON):</div>
          <textarea
            value={testArgsJson}
            onChange={e => setTestArgsJson(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.5)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: 6,
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, gap: 6 }}>
            <button className="small-btn" onClick={executeTest} disabled={testingTool} style={{ fontSize: 11 }}>
              <Play size={11} /> {testingTool ? 'Executing…' : 'Run Tool Test'}
            </button>
          </div>

          {testResult && (
            <div style={{ marginTop: 8, fontSize: 10.5 }}>
              <div style={{ fontWeight: 600, color: testResult.success ? '#10B981' : '#EF4444', marginBottom: 2 }}>
                {testResult.success ? `✓ Execution Success (${testResult.latencyMs}ms)` : `✕ Failed`}
              </div>
              <pre style={{
                maxHeight: 140,
                overflow: 'auto',
                background: 'rgba(0,0,0,0.6)',
                padding: 6,
                borderRadius: 4,
                fontSize: 10,
                color: '#cbd5e1',
                margin: 0,
              }}>
                {testResult.text || testResult.error || JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Popular Presets */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={11} color="#ff6b35" /> Popular MCP Connector Presets:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredPresets.map(preset => {
            const isAdded = servers.some(s => s.id === preset.id || s.url === preset.url)
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
                    {preset.transport === 'stdio' && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                        local
                      </span>
                    )}
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
                  onClick={() => preset.transport === 'stdio' ? addLocal(preset) : add(preset.name, preset.url)}
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

      {/* Custom Add Row: Remote HTTP / SSE */}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Server size={12} color="#38bdf8" /> Add Remote Streamable HTTP / SSE Connector
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
      </div>

      {/* Local (stdio) server — desktop only */}
      {hasStdio && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #94a3b8)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TerminalSquare size={12} color="#a78bfa" /> Add Custom Local (stdio) Process
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={localName} onChange={e => setLocalName(e.target.value)} placeholder="Name (e.g. SQLite)" style={{ flex: '1 1 120px' }} />
            <input value={localCmd} onChange={e => setLocalCmd(e.target.value)} placeholder="Command (e.g. npx)" style={{ flex: '1 1 120px' }} />
            <input value={localArgs} onChange={e => setLocalArgs(e.target.value)} placeholder='Args (e.g. -y @modelcontextprotocol/server-sqlite --db-path mydb.db)' style={{ flex: '2 1 220px' }} />
            <button className="small-btn" onClick={() => addLocal()} disabled={!localCmd.trim()}>
              <Plus size={12} /> Add local
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
            The process runs on your local machine and communicates via JSON-RPC 2.0 over stdin/stdout.
          </div>
        </div>
      )}

      {servers.length > 0 && (
        <button
          className="small-btn"
          onClick={connect}
          disabled={busy}
          style={{
            marginTop: 14,
            width: '100%',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(56,189,248,0.2) 0%, rgba(99,102,241,0.2) 100%)',
            border: '1px solid rgba(56,189,248,0.3)',
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={13} className={busy ? 'spin' : ''} /> {busy ? 'Connecting & Discovering Capabilities…' : 'Connect & Discover All Capabilities'}
        </button>
      )}
    </section>
  )
}
