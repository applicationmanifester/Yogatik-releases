/**
 * Plugins / extensions — installable bundles that add capability without code
 * changes. One plugin can contribute any of:
 *   - agents      → merged into the Agents registry (agents.js)
 *   - skills      → merged into the Skills registry (skills.js)
 *   - mcpServers  → merged into the MCP server list (mcp.js)
 *   - starters    → suggested prompts
 *
 * Bundles are plain JSON: install / enable / disable / uninstall / import /
 * export & share. Nothing here runs arbitrary code — a plugin composes existing,
 * sandboxed building blocks (agents reference real registered tools; MCP servers
 * are the same vetted transports), so installing one can't execute native code.
 * Contributions are read at registry-read time from ENABLED plugins only.
 */
import { getSetting, setSetting } from './db'

const KEY = 'plugins'

export async function getPlugins() { return (await getSetting(KEY, [])) || [] }
async function savePlugins(list) { return setSetting(KEY, list || []) }

const slug = (s) => String(s || 'plugin').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'plugin'

/** Validate + normalise a plugin bundle (from JSON or an object). Throws if malformed. */
export function parsePlugin(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json
  if (!d || !d.name || typeof d.name !== 'string') throw new Error('Not a valid Yogatik plugin (missing name).')
  const arr = (v) => (Array.isArray(v) ? v : [])
  const contributions = arr(d.agents).length + arr(d.skills).length + arr(d.mcpServers).length
  if (contributions === 0) throw new Error('Plugin contributes nothing (no agents, skills or mcpServers).')
  return {
    id: d.id || `plugin_${slug(d.name)}_${Date.now().toString(36)}`,
    name: d.name.trim(),
    version: String(d.version || '1.0.0'),
    description: String(d.description || '').trim(),
    author: String(d.author || '').trim(),
    agents: arr(d.agents),
    skills: arr(d.skills),
    mcpServers: arr(d.mcpServers),
    starters: arr(d.starters).map(String),
    enabled: d.enabled !== false,
  }
}

/** Install (or replace by id) a plugin bundle. Returns the stored plugin. */
export async function installPlugin(bundle) {
  const plugin = parsePlugin(bundle)
  const list = await getPlugins()
  await savePlugins([...list.filter(p => p.id !== plugin.id), plugin])
  return plugin
}

export async function uninstallPlugin(id) {
  const list = await getPlugins()
  await savePlugins(list.filter(p => p.id !== id))
}

export async function setPluginEnabled(id, on) {
  const list = await getPlugins()
  await savePlugins(list.map(p => (p.id === id ? { ...p, enabled: !!on } : p)))
}

export function exportPlugin(plugin) {
  const { name, version, description, author, agents, skills, mcpServers, starters } = plugin
  return JSON.stringify({ yogatik_plugin: 1, name, version, description, author, agents, skills, mcpServers, starters }, null, 2)
}

/** Pure: collect one kind of contribution from the enabled plugins in a list. */
export function collectContributions(plugins, kind) {
  const out = []
  for (const p of plugins || []) {
    if (p.enabled === false) continue
    for (const item of (p[kind] || [])) out.push({ ...item, _plugin: p.id })
  }
  return out
}

/** Enabled plugins' agents / skills / mcpServers (merged into the registries). */
export async function pluginAgents() { return collectContributions(await getPlugins(), 'agents') }
export async function pluginSkills() { return collectContributions(await getPlugins(), 'skills') }
export async function pluginMcpServers() { return collectContributions(await getPlugins(), 'mcpServers') }
