import { describe, it, expect } from 'vitest'
import { KNOWN_MCP_SERVERS, detectMcpNeed } from './mcpRegistry'

describe('KNOWN_MCP_SERVERS', () => {
  it('gives every entry a stable id and name', () => {
    for (const s of KNOWN_MCP_SERVERS) {
      expect(typeof s.id).toBe('string')
      expect(s.id.length).toBeGreaterThan(0)
      expect(typeof s.name).toBe('string')
    }
  })

  it('deliberately ships an empty keyword list for servers this app already covers natively', () => {
    // local_desktop (fs_*/terminal_run), git_mcp (git_status/git_diff/git_run)
    // and memory_mcp (memory4.js) all duplicate a built-in capability — auto-
    // suggesting a competing external server for them would be confusing, so
    // they must never be keyword-detectable even though they are still listed
    // (and addable by hand) as presets.
    for (const id of ['local_desktop', 'git_mcp', 'memory_mcp']) {
      const s = KNOWN_MCP_SERVERS.find(k => k.id === id)
      expect(s).toBeTruthy()
      expect(s.keywords).toEqual([])
    }
  })
})

describe('detectMcpNeed — auto-reconnect (already configured, currently disabled)', () => {
  it('reconnects a configured-but-disabled KNOWN preset whose keyword appears in the message', () => {
    const configured = [{ id: 'stripe', name: 'Stripe MCP', url: 'https://mcp.stripe.com/', enabled: false }]
    const need = detectMcpNeed('can you look up this customer in stripe', configured)
    expect(need.toEnable.map(s => s.id)).toEqual(['stripe'])
    expect(need.suggestions).toEqual([])
  })

  it('does not touch an already-ENABLED server, even if it matches — nothing to reconnect', () => {
    const configured = [{ id: 'stripe', name: 'Stripe MCP', url: 'https://mcp.stripe.com/', enabled: true }]
    const need = detectMcpNeed('check our stripe invoices', configured)
    expect(need.toEnable).toEqual([])
  })

  it('does not reconnect a disabled server whose keywords do not match the message', () => {
    const configured = [{ id: 'stripe', name: 'Stripe MCP', url: 'https://mcp.stripe.com/', enabled: false }]
    const need = detectMcpNeed('what is the weather in Tokyo', configured)
    expect(need.toEnable).toEqual([])
  })

  it('never reconnects a disabled KNOWN preset with a deliberate empty keyword list, even by guessing from its name', () => {
    // If it fell back to name-derived keywords here it would match "local" on
    // almost any message — exactly what the empty list exists to prevent.
    const configured = [{ id: 'git_mcp', name: 'Git MCP (Local)', enabled: false }]
    const need = detectMcpNeed('show me the git log for this repo', configured)
    expect(need.toEnable).toEqual([])
  })

  it('reconnects a disabled CUSTOM server (not one of the presets) by matching its own name', () => {
    const configured = [{ id: 'company_jira', name: 'Company Jira', url: 'https://jira.example.com/mcp', enabled: false }]
    const need = detectMcpNeed('can you file a jira ticket for this bug', configured)
    expect(need.toEnable.map(s => s.id)).toEqual(['company_jira'])
  })

  it('matches as a whole word, not as a substring of an unrelated word', () => {
    // "Form" (>=4 chars, survives the length/stopword filter) must not fire
    // just because the message contains "format" — "form" is a substring of
    // it, not the same word.
    const configured = [{ id: 'custom_form', name: 'Form MCP', url: 'https://x/mcp', enabled: false }]
    const need = detectMcpNeed('please format this digit as currency', configured)
    expect(need.toEnable).toEqual([])
  })

  it('ignores short/generic tokens from a custom server name (never matches on stray words like "the")', () => {
    const configured = [{ id: 'custom1', name: 'The API MCP Server', url: 'https://x/mcp', enabled: false }]
    const need = detectMcpNeed('the weather today is nice', configured)
    expect(need.toEnable).toEqual([])
  })
})

describe('detectMcpNeed — suggestions (not configured at all)', () => {
  it('suggests a KNOWN server that is not configured and whose keyword matches', () => {
    const need = detectMcpNeed('open a pull request on github for this fix', [])
    expect(need.suggestions.map(s => s.id)).toContain('github_copilot')
    expect(need.toEnable).toEqual([])
  })

  it('never suggests a server that is already configured, even under a different enabled state', () => {
    const configured = [{ id: 'github_copilot', name: 'GitHub Copilot MCP', url: 'https://api.githubcopilot.com/mcp/', enabled: true }]
    const need = detectMcpNeed('open a pull request on github', configured)
    expect(need.suggestions).toEqual([])
  })

  it('never suggests a server the user configured under a different id but the same url', () => {
    const configured = [{ id: 'my_stripe', name: 'My Stripe', url: 'https://mcp.stripe.com/', enabled: true }]
    const need = detectMcpNeed('check our stripe invoices', configured)
    expect(need.suggestions).toEqual([])
  })

  it('never suggests a preset with a deliberate empty keyword list (local_desktop/git_mcp/memory_mcp)', () => {
    const need = detectMcpNeed('remember this fact about me forever, and check git log', [])
    expect(need.suggestions.find(s => s.id === 'memory_mcp')).toBeUndefined()
    expect(need.suggestions.find(s => s.id === 'git_mcp')).toBeUndefined()
  })

  it('returns nothing for an empty or whitespace-only message', () => {
    expect(detectMcpNeed('', [{ id: 'stripe', enabled: false, name: 'Stripe MCP' }])).toEqual({ toEnable: [], suggestions: [] })
    expect(detectMcpNeed('   ', [])).toEqual({ toEnable: [], suggestions: [] })
  })

  it('returns nothing for an ordinary message matching no known keyword', () => {
    const need = detectMcpNeed('write me a short poem about autumn', [])
    expect(need.toEnable).toEqual([])
    expect(need.suggestions).toEqual([])
  })
})
