/**
 * Pack sharing — one downloadable file bundling a set of skills, workflows and
 * agents: the marketplace-packaging first step. The three lazy-collected
 * collections the Skills & Agents panels already manage export as a single
 * `{ format: 'yogatik-pack', v: 1, … }` JSON file and import back with a
 * reviewable per-item result (added / replaced / skipped + reason), reusing
 * chatExport.downloadBlob for the file plumbing.
 *
 * Deliberately narrow by design: a pack can only ever contain skills,
 * workflows and agents — never conversations, documents or settings — and
 * import re-validates every item through the same shape cleaners the stores
 * use on save, dropping anything else instead of trusting it.
 */
import { getSkills, upsertSkill } from './skills'
import { getWorkflows, upsertWorkflow } from './workflows'
import { getAgents, upsertAgent } from './agents'
import { downloadBlob } from './chatExport'

export const PACK_FORMAT = 'yogatik-pack'
export const PACK_VERSION = 1
export const MAX_PACK_ITEMS = 50

// The ONLY collections a pack may carry, and exactly how each is read, saved
// and cleaned. Anything a pack claims outside this list is rejected outright.
const COLLECTIONS = [
  { key: 'skills', read: getSkills, write: upsertSkill, clean: cleanSkill },
  { key: 'workflows', read: getWorkflows, write: upsertWorkflow, clean: cleanWorkflow },
  { key: 'agents', read: getAgents, write: upsertAgent, clean: cleanAgent },
]
const PACK_KEYS = ['format', 'v', 'exportedAt', 'skills', 'workflows', 'agents']

// ─── Item shapes (mirror the cleaners each store's upsert applies on save) ───

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const strList = (v) => (Array.isArray(v) ? v.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [])
const maybeId = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** `{ ...(id ? { id } : {}) }` — ids ride along in the pack so import decides. */
const withId = (id, base) => (id ? { ...base, id } : base)

/** Skill = { id?, name, description, system, tools[], starters[] } — name + text `system` required. */
function cleanSkill(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('malformed skill')
  const id = maybeId(raw.id)
  const name = str(raw.name).trim()
  if (!name) throw new Error('malformed skill: missing name')
  if (typeof raw.system !== 'string') throw new Error('malformed skill: system text is required')
  return withId(id, {
    name,
    description: str(raw.description).trim(),
    system: raw.system,
    tools: strList(raw.tools),
    starters: strList(raw.starters),
  })
}

/** Workflow = { id?, name, steps: [{ prompt }] } — needs a name and ≥1 non-empty step. */
function cleanWorkflow(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('malformed workflow')
  const id = maybeId(raw.id)
  const name = str(raw.name).trim()
  if (!name) throw new Error('malformed workflow: missing name')
  const steps = strList((Array.isArray(raw.steps) ? raw.steps : []).map(s => s?.prompt))
  if (!steps.length) throw new Error('malformed workflow: no step has a prompt')
  return withId(id, { name, steps: steps.map(prompt => ({ prompt })) })
}

/** Agent = { id?, name, role?, description?, system, tools[], model?, provider?, canDelegate?, subAgents[] }. */
function cleanAgent(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('malformed agent')
  const id = maybeId(raw.id)
  const name = str(raw.name).trim()
  if (!name) throw new Error('malformed agent: missing name')
  if (typeof raw.system !== 'string') throw new Error('malformed agent: system text is required')
  return withId(id, {
    name,
    role: str(raw.role).trim(),
    description: str(raw.description).trim(),
    system: raw.system,
    tools: strList(raw.tools),
    model: (typeof raw.model === 'string' && raw.model) || null,
    provider: (typeof raw.provider === 'string' && raw.provider) || null,
    canDelegate: !!raw.canDelegate,
    subAgents: strList(raw.subAgents),
  })
}

// Whole-pack validation — used on import (and by exportPack before it hands a
// pack back), so a malformed file throws a human message, never a TypeError.
const listField = (pack, key) => {
  const v = pack[key]
  if (v == null) return []
  if (!Array.isArray(v)) throw new Error(`Pack field "${key}" must be a list.`)
  return v
}

/**
 * Validate the pack envelope and return the per-collection item lists.
 * Rejects: non-objects, a wrong `format` field, newer versions, ANY key beyond
 * the six above (so a `conversations`/`settings` grab can never ride inside a
 * pack), non-list collection fields, empty packs and packs over MAX_PACK_ITEMS.
 */
export function assertPackEnvelope(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Not a Yogatik pack file.')
  if (pack.format !== PACK_FORMAT) throw new Error('Not a Yogatik pack file (unknown "format" field).')
  if (pack.v == null) throw new Error('Not a valid Yogatik pack (missing version).')
  if (pack.v > PACK_VERSION) throw new Error('This pack was made by a newer version of Yogatik.')
  if (pack.v !== PACK_VERSION) throw new Error('Not a valid Yogatik pack (unsupported version).')
  for (const key of Object.keys(pack)) {
    if (PACK_KEYS.includes(key)) continue
    throw new Error(`Unknown collection in pack: "${key}" — packs can only share skills, workflows and agents.`)
  }
  const lists = {}
  for (const { key } of COLLECTIONS) lists[key] = listField(pack, key)
  const total = COLLECTIONS.reduce((n, { key }) => n + lists[key].length, 0)
  if (!total) throw new Error('This pack contains no skills, workflows or agents.')
  if (total > MAX_PACK_ITEMS) throw new Error(`Pack has too many items (${total} > ${MAX_PACK_ITEMS}).`)
  return { ...lists, exportedAt: str(pack.exportedAt) || null }
}

/** Item references in a pack, any collection — counting without the envelope. */
export function packItemCount(pack) {
  if (!pack || typeof pack !== 'object') return 0
  return COLLECTIONS.reduce((n, { key }) => n + (Array.isArray(pack[key]) ? pack[key].length : 0), 0)
}

// ─── Export ───

/**
 * Bundle selected items into one pack. Ids are KEPT (the receiving app, not the
 * pack, decides what collides); unknown fields (`builtin`, plugin markers, …)
 * are stripped; invalid items — only possible from odd plugin contributions —
 * fail loudly with their name rather than export half a payload.
 */
export async function exportPack({ skillIds, workflowIds, agentIds } = {}) {
  const [skills, workflows, agents] = await Promise.all([getSkills(), getWorkflows(), getAgents()])
  const select = (items, ids) => {
    if (!Array.isArray(ids) || !ids.length) return []
    const want = new Set(ids.map(String))
    return items.filter(i => i && want.has(String(i.id)))
  }
  const picked = {
    skills: select(skills, skillIds),
    workflows: select(workflows, workflowIds),
    agents: select(agents, agentIds),
  }
  const total = COLLECTIONS.reduce((n, { key }) => n + picked[key].length, 0)
  if (!total) throw new Error('Nothing selected to export — tick at least one skill, workflow or agent.')
  if (total > MAX_PACK_ITEMS) throw new Error(`Select at most ${MAX_PACK_ITEMS} items in one pack (picked ${total}).`)
  const pack = {
    format: PACK_FORMAT,
    v: PACK_VERSION,
    exportedAt: new Date().toISOString(),
    skills: [], workflows: [], agents: [],
  }
  for (const { key, clean } of COLLECTIONS) {
    for (const item of picked[key]) {
      try { pack[key].push(clean(item)) }
      catch (e) { throw new Error(`Cannot export "${item.name || 'unnamed item'}": ${e.message}. Deselect it and retry.`) }
    }
  }
  return pack
}

/** Download this pack — same file plumbing as the chat exporters. */
export function downloadPack(pack, filename = `yogatik-pack-${new Date().toISOString().slice(0, 10)}.yogatik-pack.json`) {
  downloadBlob(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }), filename)
}

/** Read a picked file into a pack — envelope-validated, per-item checks happen at import. */
export async function readFilePack(file) {
  if (!file) throw new Error('No pack file selected.')
  let pack
  try { pack = JSON.parse(await file.text()) }
  catch { throw new Error('This is not a JSON pack file.') }
  assertPackEnvelope(pack)
  return pack
}

// ─── Import (plan → commit, so the UI can review before anything is written) ───

const countRows = (rows) => ({
  added: rows.filter(r => r.added).length,
  replaced: rows.filter(r => r.replaced).length,
  skipped: rows.filter(r => r.skipped).length,
})

/**
 * Build the per-item plan WITHOUT writing: reads the three stores, flags each
 * row added/replaced/skipped(+reason). Collision with anything visible (stored
 * items, presets, catalog entries) defaults to skipped; `overwrite: true` turns
 * those into replaces. Rejections land as skipped rows so the rest still
 * carries a reviewable picture.
 */
async function planImport(pack, { overwrite = false } = {}) {
  const lists = assertPackEnvelope(pack)
  const existing = {}
  for (const { key, read } of COLLECTIONS) {
    existing[key] = new Map()
    for (const item of await read()) if (item?.id != null) existing[key].set(String(item.id), item)
  }
  const claimed = new Set()   // ids already staged by an earlier row of THIS pack
  const rows = []
  for (const { key, clean } of COLLECTIONS) {
    for (const raw of lists[key]) {
      const row = { collection: key, id: maybeId(raw?.id), name: str(raw?.name).trim() || '(untitled)' }
      let item
      try { item = clean(raw) }
      catch (e) {
        rows.push({ ...row, status: 'skip', added: false, replaced: false, skipped: true, reason: e.message })
        continue
      }
      row.id = item.id ?? row.id
      if (item.id && claimed.has(item.id)) {
        rows.push({ ...row, status: 'skip', added: false, replaced: false, skipped: true, reason: 'duplicate id inside the pack (first copy wins)' })
        continue
      }
      if (item.id && existing[key].has(item.id)) {
        if (overwrite) {
          claimed.add(item.id)
          rows.push({ ...row, status: 'replace', added: false, replaced: true, skipped: false, reason: `Replaces the existing ${key.slice(0, -1)} of the same id.`, item })
        } else {
          rows.push({ ...row, status: 'skip', added: false, replaced: false, skipped: true, reason: `Skipped: an ${key === 'skills' ? 'skill' : key === 'agents' ? 'agent' : 'workflow'} with the id "${item.id}" already exists — enable Overwrite to replace it.` })
        }
        continue
      }
      if (item.id) claimed.add(item.id)
      rows.push({ ...row, status: 'add', added: true, replaced: false, skipped: false, item })
    }
  }
  return { ok: true, total: rows.length, ...countRows(rows), items: rows }
}

/** Preview only — the same per-item rows importPack will commit, nothing written. */
export function previewPack(pack, opts) {
  return planImport(pack, opts)
}

/**
 * Commit a validated pack. Only skills/workflows/agents are ever touched, and
 * only rows planned as 'add'/'replace' are written (one store upsert each —
 * identical semantics to the panels' own edit flow). Returns the final per-item
 * result; a failed write degrades its row to skipped with the reason.
 */
export async function importPack(pack, opts) {
  const plan = await planImport(pack, opts)
  for (const { key, write } of COLLECTIONS) {
    for (const row of plan.items) {
      if (row.collection !== key || !row.item) continue
      try { await write(row.item) }
      catch (e) {
        Object.assign(row, { status: 'skip', added: false, replaced: false, skipped: true, reason: `Could not save item: ${e?.message || e}`, item: null })
      }
    }
  }
  Object.assign(plan, countRows(plan.items))
  return plan
}
