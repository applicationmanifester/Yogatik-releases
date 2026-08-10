/**
 * Skills — saveable, shareable bundles that shape the assistant for a task:
 *   { id, name, description, system, tools[], starters[] }
 * `system` augments the system prompt; `tools` (optional allowlist) scopes which
 * tools the model may use; `starters` are example prompts (may use {{variables}}).
 * Fully local (IndexedDB); exportable/importable as JSON to share.
 */
import { getSetting, setSetting } from './db'

const KEY = 'skills'
const ACTIVE = 'active_skill'

export async function getSkills() { return (await getSetting(KEY, [])) || [] }
export async function saveSkills(list) { return setSetting(KEY, list || []) }

const slug = (s) => String(s || 'skill').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'skill'

/** Create or update (matched by id). Returns the stored skill. */
export async function upsertSkill(skill) {
  const list = await getSkills()
  const id = skill.id || `sk_${slug(skill.name)}_${Date.now().toString(36)}`
  const clean = {
    id,
    name: (skill.name || 'Untitled skill').trim(),
    description: (skill.description || '').trim(),
    system: (skill.system || '').trim(),
    tools: Array.isArray(skill.tools) ? skill.tools.filter(Boolean) : [],
    starters: Array.isArray(skill.starters) ? skill.starters.filter(Boolean) : [],
  }
  await saveSkills([...list.filter(s => s.id !== id), clean])
  return clean
}

export async function deleteSkill(id) {
  await saveSkills((await getSkills()).filter(s => s.id !== id))
  if ((await getActiveSkillId()) === id) await setActiveSkill(null)
}

export async function getActiveSkillId() { return getSetting(ACTIVE, null) }
export async function setActiveSkill(id) { return setSetting(ACTIVE, id ?? null) }

export async function getActiveSkill() {
  const id = await getActiveSkillId()
  if (!id) return null
  return (await getSkills()).find(s => s.id === id) || null
}

/** Given an active skill and the built-in tool names, which to DISABLE (allowlist). */
export function skillDisabledTools(skill, allToolNames = []) {
  if (!skill?.tools?.length) return []
  const allow = new Set(skill.tools)
  return allToolNames.filter(n => !allow.has(n))
}

/** Share: one skill → JSON string. */
export function exportSkill(skill) {
  const { name, description, system, tools, starters } = skill
  return JSON.stringify({ yogatik_skill: 1, name, description, system, tools, starters }, null, 2)
}

/** Import a skill JSON string (validated). Throws on malformed input. */
export function parseSkill(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json
  if (!d || !d.name || typeof d.system !== 'string') throw new Error('Not a valid Yogatik skill file.')
  return {
    name: String(d.name), description: String(d.description || ''), system: String(d.system),
    tools: Array.isArray(d.tools) ? d.tools.map(String) : [],
    starters: Array.isArray(d.starters) ? d.starters.map(String) : [],
  }
}
