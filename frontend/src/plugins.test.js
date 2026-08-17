import { describe, it, expect } from 'vitest'
import { parsePlugin, exportPlugin, collectContributions } from './plugins'

describe('plugin bundles', () => {
  const good = {
    name: 'Research Pack',
    version: '2.1.0',
    description: 'Adds a researcher agent + an MCP server',
    agents: [{ id: 'agent_x', name: 'X', role: 'x', system: 'be x', tools: ['web_search'] }],
    mcpServers: [{ id: 'srv1', name: 'Srv', url: 'https://example.com/mcp' }],
  }

  it('parses and normalises a valid bundle', () => {
    const p = parsePlugin(good)
    expect(p.name).toBe('Research Pack')
    expect(p.id).toMatch(/^plugin_/)
    expect(p.enabled).toBe(true)
    expect(p.agents).toHaveLength(1)
    expect(p.skills).toEqual([])
  })

  it('rejects a bundle with no name', () => {
    expect(() => parsePlugin({ agents: [{ id: 'a' }] })).toThrow(/name/i)
  })

  it('rejects a bundle that contributes nothing', () => {
    expect(() => parsePlugin({ name: 'Empty' })).toThrow(/contributes nothing/i)
  })

  it('round-trips export → parse', () => {
    const p = parsePlugin(good)
    const again = parsePlugin(exportPlugin(p))
    expect(again.name).toBe(p.name)
    expect(again.agents).toEqual(p.agents)
    expect(again.mcpServers).toEqual(p.mcpServers)
  })

  it('collectContributions returns only enabled plugins, tagged by id', () => {
    const plugins = [
      { id: 'p1', enabled: true, agents: [{ id: 'a1' }] },
      { id: 'p2', enabled: false, agents: [{ id: 'a2' }] },
      { id: 'p3', enabled: true, agents: [{ id: 'a3' }] },
    ]
    const agents = collectContributions(plugins, 'agents')
    expect(agents.map(a => a.id)).toEqual(['a1', 'a3'])
    expect(agents[0]._plugin).toBe('p1')
  })

  it('collectContributions is empty for a missing kind', () => {
    expect(collectContributions([{ id: 'p', enabled: true }], 'skills')).toEqual([])
  })
})
