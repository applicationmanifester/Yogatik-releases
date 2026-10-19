// @vitest-environment jsdom
//
// The gallery is ONLY worth testing against the real registry: its entire
// contract is "every card is derived from mcpRegistry.js's KNOWN_MCP_SERVERS",
// so a snapshot taken against fake catalog data would be testing a different
// component than the one users get. What IS stubbed is the mcp.js data layer
// (no network, no IndexedDB): installs must drive setMcpServers +
// refreshMcpTools and nothing else, and token-required cards must NOT hit the
// write path — routing to the existing Bearer-token row is the whole point.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import React from 'react'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// A stand-in for the mcp.js settings store — setMcpServers "persists" into it
// so later installs read back what earlier installs wrote, the way Dexie does.
const store = { persisted: [] }

vi.mock('../mcp', () => ({
  getMcpServers: vi.fn(async () => store.persisted),
  setMcpServers: vi.fn(async (list) => { store.persisted = list }),
  refreshMcpTools: vi.fn(async () => []),
}))

const { getMcpServers, setMcpServers, refreshMcpTools } = await import('../mcp')
const { McpMarketplace } = await import('./McpMarketplace')
const { KNOWN_MCP_SERVERS } = await import('../mcpRegistry')
const { McpServers } = await import('./McpServers')

/** Two configured servers, both known presets: Stripe enabled, Brave added
 * through the old preset row but switched off afterwards. */
const CONFIGURED_MATCH = [
  { id: 'stripe', name: 'Stripe MCP', url: 'https://mcp.stripe.com/', token: 'sk', enabled: true },
  { id: 'brave_search', name: 'Brave Search MCP', url: 'https://api.search.brave.com/mcp', enabled: false },
]

beforeEach(() => {
  // Clear call history but NOT the factory implementations — installs from an
  // earlier test must not leak counts into a later one's "never called" pins.
  vi.clearAllMocks()
  store.persisted = []
})
afterEach(() => {
  cleanup()
  delete window.__YOGATIK_MCP_STDIO__
})

const card = (id) => screen.getByTestId(`mcp-card-${id}`)
const stateOf = (id) => screen.getByTestId(`mcp-state-${id}`).textContent

describe('catalog is derived from the registry, not duplicated', () => {
  it('renders a card for every KNOWN_MCP_SERVERS entry (with the stdio bridge, that is all of them)', () => {
    window.__YOGATIK_MCP_STDIO__ = {}
    render(<McpMarketplace servers={[]} />)
    for (const preset of KNOWN_MCP_SERVERS) {
      expect(screen.getByText(preset.name)).toBeTruthy()
    }
    // The registry's own one-line "what it gives" text is what the card shows.
    for (const preset of KNOWN_MCP_SERVERS) {
      expect(card(preset.id).textContent).toContain(preset.desc)
    }
  })

  it('hides desktop-only stdio presets in a browser (no stdio bridge)', () => {
    render(<McpMarketplace servers={[]} />)
    for (const preset of KNOWN_MCP_SERVERS.filter(p => p.desktopOnly)) {
      expect(screen.queryByText(preset.name)).toBeNull()
    }
    expect(screen.getByText('GitHub Copilot MCP')).toBeTruthy()
  })

  it('the component carries no second catalog of its own', () => {
    const src = fs.readFileSync(path.join(HERE, 'McpMarketplace.jsx'), 'utf8')
    expect(src).toMatch(/import \{ KNOWN_MCP_SERVERS \} from '\.\.\/mcpRegistry'/)
    // A drifted second list would be exactly how the preset gallery and the
    // auto-connector ever disagree — no preset domain may appear here.
    expect(src).not.toMatch(/mcp\.stripe|mcp\.cloudflare|githubcopilot\.com|api\.search\.brave|localhost:3001/)
  })
})

describe('card state matches the configured, enabled servers', () => {
  it('labels each card from what mcp.js holds', () => {
    render(<McpMarketplace servers={CONFIGURED_MATCH} />)
    expect(stateOf('stripe')).toBe('Connected')
    expect(stateOf('brave_search')).toBe('Disabled')
    // Token-required and never configured → its state IS the token decision.
    expect(stateOf('github_copilot')).toBe('Needs token')
    expect(stateOf('local_desktop')).toBe('Not configured')
    // ...and the action button follows the state, not the reverse.
    const btnText = (id) => screen.getByTestId(`mcp-install-${id}`).textContent
    expect(btnText('stripe')).toContain('Connected')
    expect(btnText('brave_search')).toContain('Enable')
    expect(btnText('github_copilot')).toContain('Add token')
    expect(btnText('local_desktop')).toContain('Install')
  })

  it('a connected server whose refresh failed shows the health dot with the error', () => {
    render(
      <McpMarketplace
        servers={CONFIGURED_MATCH}
        status={[{ id: 'stripe', ok: false, error: '401 unauthorized' }]}
      />,
    )
    const dot = screen.getByTestId('mcp-health-stripe')
    expect(dot.getAttribute('title')).toContain('401 unauthorized')
    // No status reported → no dot pretending otherwise.
    expect(screen.queryByTestId('mcp-health-brave_search')).toBeNull()
  })

  it('a successful refresh shows the latency on the dot', () => {
    render(
      <McpMarketplace
        servers={CONFIGURED_MATCH}
        status={[{ id: 'stripe', ok: true, latencyMs: 12 }]}
      />,
    )
    expect(screen.getByTestId('mcp-health-stripe').getAttribute('title')).toContain('12ms')
  })
})

describe('install — one click through the SAME mcp.js path the page already uses', () => {
  it('persists then connects: setMcpServers → refreshMcpTools, in that order', async () => {
    const onChanged = vi.fn()
    render(<McpMarketplace servers={[]} onChanged={onChanged} />)
    fireEvent.click(screen.getByTestId('mcp-install-local_desktop'))
    await waitFor(() => expect(refreshMcpTools).toHaveBeenCalledTimes(1))
    expect(setMcpServers).toHaveBeenCalledTimes(1)
    expect(setMcpServers.mock.calls[0][0]).toEqual([
      { id: 'local_desktop', name: 'Local Desktop MCP Bridge', url: 'http://localhost:3001/mcp', enabled: true },
    ])
    // Connect strictly AFTER the write landed — connecting a config the store
    // does not hold would silently drop the server on the next boot.
    expect(setMcpServers.mock.invocationCallOrder[0]).toBeLessThan(refreshMcpTools.mock.invocationCallOrder[0])
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledWith(setMcpServers.mock.calls[0][0], [])
  })

  it('re-enables a disabled server in place instead of adding a second entry — token-required ones included', async () => {
    // Re-connecting an already-configured (but switched-off) connector needs
    // no NEW credential, exactly mcpRegistry.js's toEnable philosophy — so
    // even a token server's Enable click runs the write path, never the
    // token-reroute.
    store.persisted = CONFIGURED_MATCH
    render(<McpMarketplace servers={CONFIGURED_MATCH} />)
    fireEvent.click(screen.getByTestId('mcp-install-brave_search'))
    await waitFor(() => expect(refreshMcpTools).toHaveBeenCalledTimes(1))
    const written = setMcpServers.mock.calls[0][0]
    expect(written).toHaveLength(2)
    expect(written.find(s => s.id === 'brave_search').enabled).toBe(true)
    expect(written.find(s => s.id === 'stripe')).toBe(CONFIGURED_MATCH[0]) // untouched row keeps its identity
  })

  it('installs a stdio preset in exactly the shape addLocal() writes (desktop bridge present)', async () => {
    window.__YOGATIK_MCP_STDIO__ = {}
    render(<McpMarketplace servers={[]} />)
    fireEvent.click(screen.getByTestId('mcp-install-sqlite_mcp'))
    await waitFor(() => expect(refreshMcpTools).toHaveBeenCalledTimes(1))
    expect(setMcpServers).toHaveBeenCalledWith([{
      id: 'sqlite_mcp',
      name: 'SQLite MCP (Local)',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './workspace.db'],
      enabled: true,
    }])
  })

  it('routes token-required installs to the existing token row — the write path is never touched', async () => {
    const onNeedsToken = vi.fn()
    const onChanged = vi.fn()
    store.persisted = CONFIGURED_MATCH
    render(<McpMarketplace servers={CONFIGURED_MATCH} onChanged={onChanged} onNeedsToken={onNeedsToken} />)
    fireEvent.click(screen.getByTestId('mcp-install-github_copilot'))
    await waitFor(() => expect(onNeedsToken).toHaveBeenCalledTimes(1))
    expect(onNeedsToken.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 'github_copilot' }))
    // No credential was typed, so nothing may have been persisted or connected.
    expect(getMcpServers).not.toHaveBeenCalled()
    expect(setMcpServers).not.toHaveBeenCalled()
    expect(refreshMcpTools).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('filter tabs + search', () => {
  it('Connected shows only what is actually connected', () => {
    window.__YOGATIK_MCP_STDIO__ = {}
    render(<McpMarketplace servers={CONFIGURED_MATCH} />)
    fireEvent.click(screen.getByTestId('mcp-tab-connected'))
    expect(screen.queryByTestId('mcp-card-stripe')).toBeTruthy()
    expect(screen.queryByTestId('mcp-card-github_copilot')).toBeNull()
    expect(screen.queryByTestId('mcp-card-brave_search')).toBeNull() // disabled ≠ connected
    expect(screen.queryByTestId('mcp-card-sqlite_mcp')).toBeNull()
  })

  it('Needs token shows exactly the token-required catalog', () => {
    window.__YOGATIK_MCP_STDIO__ = {}
    render(<McpMarketplace servers={CONFIGURED_MATCH} />)
    fireEvent.click(screen.getByTestId('mcp-tab-token'))
    expect(screen.queryByTestId('mcp-card-stripe')).toBeTruthy()        // needsToken, shown regardless of connect state
    expect(screen.queryByTestId('mcp-card-github_copilot')).toBeTruthy()
    expect(screen.queryByTestId('mcp-card-local_desktop')).toBeNull()   // takes no token
    expect(screen.queryByTestId('mcp-card-sqlite_mcp')).toBeNull()      // stdio takes no token
  })

  it('the search box narrows by name/description and can be cleared from the empty state', () => {
    render(<McpMarketplace servers={[]} />)
    fireEvent.change(screen.getByTestId('mcp-marketplace-search'), { target: { value: 'stripe' } })
    expect(screen.queryByTestId('mcp-card-stripe')).toBeTruthy()
    expect(screen.queryByTestId('mcp-card-github_copilot')).toBeNull()
    // A term matching nothing shows an honest empty state, not a blank wall…
    fireEvent.change(screen.getByTestId('mcp-marketplace-search'), { target: { value: 'zzzz' } })
    expect(screen.getByText(/No connectors match/)).toBeTruthy()
    // …whose one button resets BOTH filters.
    fireEvent.click(screen.getByText('Show all connectors'))
    expect(screen.queryByTestId('mcp-card-github_copilot')).toBeTruthy()
    expect(screen.queryByTestId('mcp-tab-all').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('mounted through the real host (McpServers.jsx, behind the toggle)', () => {
  it('the gallery stays closed until "Browse connectors" — discovery must not crowd the power-user list', async () => {
    render(<McpServers />)
    // Closed: no gallery region, no cloned discovery cards.
    expect(screen.queryByRole('region', { name: 'MCP connector gallery' })).toBeNull()
    const toggle = screen.getByTestId('browse-connectors')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    // The gallery card renders inside the region — but the host's OWN preset
    // row shows the same connector one screen away, so scope the assertion.
    const region = screen.getByRole('region', { name: 'MCP connector gallery' })
    expect(within(region).queryByText('GitHub Copilot MCP')).toBeTruthy()
    // Web build without the bridge: the stdio registry entries stay hidden
    // inside the host too, not only in the standalone gallery.
    expect(screen.queryByText('SQLite MCP (Local)')).toBeNull()
  })

  it('the host wires the gallery to mcp.js persistence and its own token field', () => {
    const src = fs.readFileSync(path.join(HERE, 'McpServers.jsx'), 'utf8')
    expect(src).toMatch(/import \{ McpMarketplace \} from '\.\/McpMarketplace'/)
    expect(src).toMatch(/<McpMarketplace\b/)
    expect(src).toMatch(/data-testid="browse-connectors"/)
    // Token routing pre-fills the EXISTING Bearer-token input — no second form.
    expect(src).toMatch(/openTokenFor/)
    expect(src).toMatch(/ref=\{tokenRef\}/)
    // And App.jsx stays out of it: the mount lives in the MCP dashboard page.
    const app = fs.readFileSync(path.join(HERE, '..', 'App.jsx'), 'utf8')
    expect(app).not.toMatch(/McpMarketplace/)
  })
})
