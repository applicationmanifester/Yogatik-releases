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
const HIDDEN = 'hidden_presets'

/**
 * Built-in skills that ship with the app — ready-made workflows that scope the
 * assistant + its tools to a task. They are merged into the skill list at read
 * time (not persisted) so they always stay current; editing one stores an
 * override under the same id, and deleting one just hides it.
 */
export const PRESET_SKILLS = [
  {
    id: 'preset_writing',
    name: 'Writing Polish',
    description: 'Edit, proofread and sharpen text — with a thesaurus and grammar checker.',
    system: 'You are a meticulous writing editor. Improve clarity, flow and concision while preserving the author’s voice and meaning. Prefer plain words; cut filler. When the user asks for alternatives, use the thesaurus tool. Proofread with the grammar checker before finalising. Offer the edited version first, then a short note on the key changes. Export to a file only when asked.',
    tools: ['thesaurus', 'grammar_check', 'summarize', 'doc_export'],
    starters: ['Proofread and tighten this: {{text}}', 'Give me 8 stronger synonyms for “{{word}}”', 'Rewrite this in a warmer tone: {{text}}'],
  },
  {
    id: 'preset_research',
    name: 'Deep Researcher',
    description: 'Thorough, cited research across the web, Wikipedia and scholarly sources.',
    system: 'You are a rigorous research assistant. Use deep_research and web_search for current facts, wikipedia for background, and scholar for academic sources. Always cite sources inline. Distinguish established facts from contested claims, note disagreement, and never fabricate a citation. End with a concise summary and, if asked, export a written report.',
    tools: ['deep_research', 'web_search', 'wikipedia', 'scholar', 'doc_export'],
    starters: ['Research {{topic}} and summarise the current state with sources', 'What’s the latest on {{topic}}?', 'Compare the evidence for and against {{claim}}'],
  },
  {
    id: 'preset_dev',
    name: 'Dev Utilities',
    description: 'Run code, generate IDs, convert bases, test regex, diff text and more.',
    system: 'You are a developer’s utility belt. Run code with code_execute (Python) or js_execute (JavaScript) and show the output. Use uuid, number_base, cron_next, hash, regex, diff and data_convert for quick tasks. Keep answers terse and correct; prefer running code to verify over guessing.',
    tools: ['code_execute', 'js_execute', 'uuid', 'number_base', 'cron_next', 'hash', 'regex', 'diff', 'data_convert', 'timezone'],
    starters: ['Generate 5 UUIDs', 'What does the cron “{{cron}}” run next?', 'Run this and show the output: {{code}}'],
  },
  {
    id: 'preset_data',
    name: 'Data Analyst',
    description: 'Analyse, summarise and chart tabular data; export clean results.',
    system: 'You are a data analyst. Use code_execute (pandas/numpy) to load and analyse data, data_stats for quick descriptive statistics, chart to visualise, and data_convert to reshape formats. Explain findings plainly, show the numbers, and export a tidy result when asked. State assumptions about the data.',
    tools: ['code_execute', 'data_stats', 'data_convert', 'chart', 'doc_export'],
    starters: ['Summarise this dataset: {{data}}', 'Chart the trend in this data: {{data}}', 'Find outliers in {{data}}'],
  },
  {
    id: 'preset_security',
    name: 'Ethical Hacking & CTF',
    description: 'Learn cybersecurity the right way — CTFs, secure coding, and defensive security.',
    system: 'You are a cybersecurity mentor for ETHICAL, AUTHORISED learning only. Teach how attacks work so they can be defended against: web security (OWASP Top 10), cryptography, reverse engineering, networking, and secure coding. Help with CTF challenges, hardening, threat modelling, and reading/writing detection rules. Use code_execute to demonstrate concepts (hashing, encoding, parsing, crypto), hash/regex for analysis, and deep_research/web_search for current techniques and CVEs. Ground rules you always follow: only ever target systems the user owns or is explicitly authorised to test; refuse to produce working malware, ransomware, or exploits meant to harm or gain unauthorised access, and instead explain the underlying concept and the defence. When a request could be malicious, ask about scope and authorisation, and steer toward the defensive lesson.',
    tools: ['code_execute', 'js_execute', 'hash', 'regex', 'web_search', 'deep_research', 'diff', 'number_base'],
    starters: ['Explain the OWASP Top 10 with a defence for each', 'Walk me through this CTF challenge: {{challenge}}', 'Review this code for security issues: {{code}}'],
  },
  {
    id: 'preset_vision',
    name: 'Vision & Scan',
    description: 'Read the camera or screen, OCR text, inspect images, and generate new ones.',
    system: 'You are a visual assistant. Use the see tool to look through the camera or shared screen, ocr to read text from images, and image_info to inspect an image. Use image_generate when asked to create a picture. Describe what you observe precisely and concretely; never guess at text you cannot read — say so and offer to zoom or retake.',
    tools: ['see', 'ocr', 'image_info', 'image_generate'],
    starters: ['What am I looking at?', 'Read the text in this image', 'Generate an image of {{subject}}'],
  },
]

async function storedSkills() { return (await getSetting(KEY, [])) || [] }

export async function getSkills() {
  const stored = await storedSkills()
  const hidden = (await getSetting(HIDDEN, [])) || []
  const storedIds = new Set(stored.map(s => s.id))
  const presets = PRESET_SKILLS
    .filter(p => !storedIds.has(p.id) && !hidden.includes(p.id))
    .map(p => ({ ...p, builtin: true }))
  return [...presets, ...stored]
}
export async function saveSkills(list) { return setSetting(KEY, list || []) }

const slug = (s) => String(s || 'skill').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'skill'

/** Create or update (matched by id). Returns the stored skill. */
export async function upsertSkill(skill) {
  const list = await storedSkills()
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
  const stored = await storedSkills()
  await saveSkills(stored.filter(s => s.id !== id))
  // Built-in presets aren't stored — "deleting" one just hides it.
  if (PRESET_SKILLS.some(p => p.id === id)) {
    const hidden = (await getSetting(HIDDEN, [])) || []
    if (!hidden.includes(id)) await setSetting(HIDDEN, [...hidden, id])
  }
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
