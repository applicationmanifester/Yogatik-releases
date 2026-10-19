/**
 * McpMarketplace.jsx — the discovery half of the MCP page, built ON TOP of the
 * curated registry instead of beside it.
 *
 * The raw "Popular MCP Connector Presets" row above this gallery is a
 * power-user list. This component is the browsable view of the SAME list —
 * every card is DERIVED from mcpRegistry.js's KNOWN_MCP_SERVERS (imported, so
 * a preset added to the registry appears here with no component change) — and
 * the codebase's "two copies, only one wired" rule applies the other way
 * around this time: no component-local server list may exist here. The only
 * things this file adds per card are SHAPES, not servers: badge, transport
 * chip, token-needed flag, and the install flow.
 *
 * Install — and the token trap, deliberately NOT automated:
 *   - A connector with no token required installs in one click: written into
 *     the mcp.js config store via setMcpServers, then refreshMcpTools()
 *     connects everything — the exact persistence path McpServers.jsx itself
 *     uses, never a parallel one (a registry entry already connects at boot;
 *     writing the config anywhere else would fork the server of truth).
 *   - A token-needed connector is deliberately ABSENT from that one-click
 *     path. Connecting with no credential would 401-and-look-installed, or
 *     worse "succeed" against nothing real — the same conclusion
 *     mcpRegistry.js reached about Notion/Linear auto-connecting. So those
 *     cards route to the EXISTING Bearer-token row (onNeedsToken →
 *     McpServers.jsx's custom-add form, which is focused for the user) rather
 *     than growing a second token form here. Supplying the token stays a
 *     typed user decision.
 *
 * Filtering: All / Connected / Needs token tabs + a search box, with an empty
 * state that admits it found nothing instead of silently blanking.
 */
import React from 'react'
import { Store, Search, Key, Check, Plus, Power, Globe, TerminalSquare, RefreshCw } from 'lucide-react'
import { KNOWN_MCP_SERVERS } from '../mcpRegistry'
import { getMcpServers, setMcpServers, refreshMcpTools } from '../mcp'

/** Derive a card's install surface from what the user has configured, shared
 * by render and tests. `state` is one of:
 *   'not configured' | 'needs token' (unconfigured + token-required)
 *   'connected'      (configured AND enabled — the config store is the truth;
 *                     a failed ping shows through the health dot, not here)
 *   'disabled'       (configured but switched off — Enable re-runs the install)
 * Matching mirrors McpServers.jsx's isAdded logic (id, else URL) so a
 * connector added through the old preset row before this gallery existed
 * still reads as installed rather than offering a duplicate install. */
export function deriveMcpCardState(preset, servers = []) {
  const configured = servers.find(s => s.id === preset.id || (preset.url && s.url === preset.url))
  if (!configured) {
    return preset.needsToken
      ? { configured: null, state: 'needs token', action: 'token' }
      : { configured: null, state: 'not configured', action: 'install' }
  }
  if (configured.enabled === false) return { configured, state: 'disabled', action: 'enable' }
  return { configured, state: 'connected', action: 'none' }
}

const CHIPS = {
  'connected': { label: 'Connected', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  'needs token': { label: 'Needs token', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  'not configured': { label: 'Not configured', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  'disabled': { label: 'Disabled', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Connected' },
  { id: 'token', label: 'Needs token' },
]

/** The gallery. Props:
 *   servers      - result of mcp.js getMcpServers() as held by McpServers.jsx
 *                  (drives card states; the config store stays the only
 *                  server of truth at write time — see install()).
 *   status       - result of refreshMcpTools(), for the per-card health dot.
 *   onChanged    - (nextServers, nextStatus) after a write, so the configured
 *                  list above the gallery re-renders in step.
 *   onNeedsToken - token-required install: pre-fill + focus the existing
 *                  Bearer-token row in McpServers.jsx. */
export function McpMarketplace({ servers = [], status = [], onChanged, onNeedsToken }) {
  const [tab, setTab] = React.useState('all')
  const [query, setQuery] = React.useState('')
  const [busyId, setBusyId] = React.useState(null)
  const [installError, setInstallError] = React.useState(null)

  // Render-time read (McpServers.jsx's hasStdio is module scope) — same value
  // in the real app (the bridge exists before React renders) and injectable
  // per-test.
  const showLocal = typeof window !== 'undefined' && !!window.__YOGATIK_MCP_STDIO__

  const presets = KNOWN_MCP_SERVERS.filter(p => !p.desktopOnly || showLocal)
  const cards = presets.map(p => ({ preset: p, ...deriveMcpCardState(p, servers) }))

  const q = query.trim().toLowerCase()
  const tabPassed = c =>
    tab === 'all' ||
    (tab === 'token' && c.preset.needsToken) ||
    (tab === 'connected' && c.state === 'connected')
  const searchPassed = c =>
    !q ||
    c.preset.name.toLowerCase().includes(q) ||
    (c.preset.desc || '').toLowerCase().includes(q) ||
    (c.preset.badge || '').toLowerCase().includes(q)
  const visible = cards.filter(c => tabPassed(c) && searchPassed(c))

  const healthOf = (card) => {
    const st = status.find(x => x.id === card.configured?.id)
    if (!st) return null
    if (st.ok === false) return { tone: 'bad', title: st.error || 'Connection failed' }
    if (st.latencyMs != null) return { tone: 'ok', title: `Connected in ${st.latencyMs}ms` }
    return { tone: 'ok', title: 'Reachable' }
  }

  /** One-click install for no-token connectors; re-enable for switched-off
   * ones. Only a token-required connector NOT YET configured is rerouted —
   * a configured-but-off one needs no NEW credential, so Enable runs the
   * write path instead of re-asking for a token it already stores. */
  const install = async (preset) => {
    const configured = servers.find(s => s.id === preset.id || (preset.url && s.url === preset.url))
    if (preset.needsToken && !configured) {
      // No credential yet = a typed user decision: hand off to the existing
      // Bearer-token row (onNeedsToken in McpServers.jsx), write nothing.
      onNeedsToken?.(preset)
      return
    }
    setInstallError(null)
    setBusyId(preset.id)
    try {
      // Read the FRESHEST persisted list, not the servers prop (stale by up to
      // a render), merge by the same id/URL rule the cards showed, and write
      // the whole list back — one config store, one writer.
      const cur = await getMcpServers()
      const existing = cur.find(s => s.id === preset.id || (preset.url && s.url === preset.url))
      // stdio presets persist exactly the shape addLocal() writes; http ones
      // the shape add() writes (transport defaults to http at connect time).
      const next = existing
        ? cur.map(s => (s === existing ? { ...s, enabled: true } : s))
        : [
            ...cur,
            preset.transport === 'stdio'
              ? { id: preset.id, name: preset.name, transport: 'stdio', command: preset.command, args: preset.args || [], enabled: true }
              : { id: preset.id, name: preset.name, url: preset.url, enabled: true },
          ]
      await setMcpServers(next)
      const st = await refreshMcpTools()
      onChanged?.(next, st)
    } catch (e) {
      setInstallError(e?.message || String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      role="region"
      aria-label="MCP connector gallery"
      style={{
        marginTop: 10,
        marginBottom: 12,
        padding: 10,
        border: '1px solid rgba(56,189,248,0.25)',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Store size={13} color="#ff6b35" />
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>Connector gallery</span>
        <span className="personalise-hint" style={{ marginLeft: 'auto', fontSize: 10 }}>
          {visible.length}/{presets.length} connectors
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            data-testid={`mcp-tab-${t.id}`}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 10.5,
              padding: '3px 9px',
              borderRadius: 999,
              cursor: 'pointer',
              fontWeight: 600,
              border: `1px solid ${tab === t.id ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.1)'}`,
              background: tab === t.id ? 'rgba(56,189,248,0.15)' : 'transparent',
              color: tab === t.id ? '#38bdf8' : '#94a3b8',
            }}
          >
            {t.label} ({cards.filter(c => t.id === 'all' || (t.id === 'token' && c.preset.needsToken) || (t.id === 'connected' && c.state === 'connected')).length})
          </button>
        ))}
        <div style={{ position: 'relative', marginLeft: 'auto', flex: '1 1 140px', maxWidth: 220 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--text-muted, #94a3b8)' }} />
          <input
            type="text"
            data-testid="mcp-marketplace-search"
            aria-label="Search connectors"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search connectors…"
            style={{ width: '100%', paddingLeft: 26, fontSize: 11, height: 28 }}
          />
        </div>
      </div>

      {installError && (
        <div role="alert" style={{ marginBottom: 8, fontSize: 10.5, color: '#EF4444', fontWeight: 500 }}>
          Install failed: {installError}
        </div>
      )}

      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(card => {
          const { preset } = card
          const chip = CHIPS[card.state]
          const dot = healthOf(card)
          const running = busyId === preset.id
          return (
            <div
              key={preset.id}
              role="listitem"
              data-testid={`mcp-card-${preset.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {preset.transport === 'stdio'
                  ? <TerminalSquare size={13} color="#a78bfa" aria-hidden="true" />
                  : <Globe size={13} color="#38BDF8" aria-hidden="true" />}
                <span style={{ fontSize: 12, fontWeight: 600 }}>{preset.name}</span>
                {preset.badge && (
                  <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'rgba(56,189,248,0.12)', color: '#38bdf8', fontWeight: 600 }}>
                    {preset.badge}
                  </span>
                )}
                {preset.needsToken && (
                  <span style={{ fontSize: 9, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Key size={9} /> token needed
                  </span>
                )}
                <span
                  data-testid={`mcp-state-${preset.id}`}
                  style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, color: chip.color, background: chip.bg, fontWeight: 600 }}
                >
                  {chip.label}
                </span>
                {dot && (
                  <span
                    data-testid={`mcp-health-${preset.id}`}
                    title={dot.title}
                    aria-label={dot.title}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: dot.tone === 'ok' ? '#10B981' : '#EF4444',
                      display: 'inline-block',
                    }}
                  />
                )}
                <button
                  type="button"
                  data-testid={`mcp-install-${preset.id}`}
                  className="small-btn"
                  onClick={() => install(preset)}
                  disabled={running}
                  style={{
                    marginLeft: 'auto',
                    flexShrink: 0,
                    fontSize: 11,
                    padding: '3px 8px',
                    opacity: card.action === 'none' ? 1 : undefined,
                  }}
                >
                  {running ? (
                    <><RefreshCw size={11} className="spin" /> Installing…</>
                  ) : card.action === 'none' ? (
                    <><Check size={11} /> Connected</>
                  ) : card.action === 'token' ? (
                    <><Key size={11} /> Add token</>
                  ) : card.action === 'enable' ? (
                    <><Power size={11} /> Enable</>
                  ) : (
                    <><Plus size={11} /> Install</>
                  )}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', overflowWrap: 'anywhere' }}>
                {preset.desc}
              </div>
            </div>
          )
        })}
      </div>

      {visible.length === 0 && (
        <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
          No connectors match{q ? ` "${query}"` : ''} on this filter.
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="small-btn"
              onClick={() => { setTab('all'); setQuery('') }}
              style={{ padding: '3px 10px', fontSize: 11 }}
            >
              <Search size={11} /> Show all connectors
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>
        <Key size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />
        Token-required connectors open the Bearer-token field above — a credential is typed, never guessed.
      </div>
    </div>
  )
}
