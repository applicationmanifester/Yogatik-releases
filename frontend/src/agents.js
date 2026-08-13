/**
 * Agents — named, role-scoped assistants built on the same runAgent loop.
 * One registry powers all four agent features: named preset agents (pick one
 * per chat), sub-agent delegation (spawn_agents tool), the autonomous task
 * agent, and the proactive side-panel.
 *
 *   { id, name, role, description, system, tools[], model?, provider?,
 *     canDelegate?, builtin? }
 *
 * `system` shapes the assistant; `tools` (optional allowlist) scopes what it
 * may call; `model`/`provider` optionally pin a model (else it inherits the
 * active chat model). Fully local (IndexedDB); export/import as JSON to share.
 */
import { getSetting, setSetting } from './db'

const KEY = 'agents'
const ACTIVE = 'active_agent'
const HIDDEN = 'hidden_agent_presets'

// Ready-made specialists. Merged in at read time (not persisted) so they stay
// current; editing one stores an override under the same id, deleting hides it.
export const PRESET_AGENTS = [
  {
    id: 'agent_general',
    name: 'General Assistant',
    role: 'generalist',
    description: 'A well-rounded assistant that can delegate to specialists when a task is complex.',
    system: 'You are a capable general assistant. For complex, multi-part tasks, delegate focused sub-tasks to specialist agents with the spawn_agents tool (e.g. a researcher for facts, a coder for code, a writer for prose), then synthesize their results into one coherent answer. For simple tasks, just answer directly.',
    tools: [],            // no allowlist = all tools available
    canDelegate: true,
    subAgents: ['agent_researcher', 'agent_coder', 'agent_writer', 'agent_analyst', 'agent_planner', 'agent_devops', 'agent_creative', 'agent_translator', 'agent_auditor'],
  },
  {
    id: 'agent_researcher',
    name: 'Researcher',
    role: 'researcher',
    description: 'Gathers current, cited facts from the web, Wikipedia and scholarly sources.',
    system: 'You are a rigorous research specialist. Use deep_research and web_search for current facts, wikipedia for background, and scholar for academic sources. Cite every claim inline, distinguish established facts from contested ones, and never fabricate a citation. Return a tight, sourced briefing.',
    tools: ['deep_research', 'web_search', 'wikipedia', 'scholar', 'stackoverflow', 'summarize'],
  },
  {
    id: 'agent_coder',
    name: 'Coder',
    role: 'coder',
    description: 'Writes and verifies code, runs it, and returns working results.',
    system: 'You are an expert programmer. Write clean, correct, efficient code. Prefer running it (code_execute for Python, js_execute for JavaScript) to verify over guessing. Use regex, diff, data_convert and hash for supporting tasks. Return the working code plus a one-line note on what it does.',
    tools: ['code_execute', 'js_execute', 'regex', 'diff', 'data_convert', 'hash', 'uuid', 'number_base'],
  },
  {
    id: 'agent_writer',
    name: 'Writer',
    role: 'writer',
    description: 'Drafts and polishes clear, well-structured prose.',
    system: 'You are a sharp writer and editor. Produce clear, engaging, well-structured prose in the requested tone and length. Cut filler, prefer plain words, and proofread with grammar_check before finalising. Return the finished text first, then a one-line note on choices made.',
    tools: ['grammar_check', 'thesaurus', 'summarize', 'doc_export'],
  },
  {
    id: 'agent_analyst',
    name: 'Data Analyst',
    role: 'analyst',
    description: 'Analyses, summarises and charts data; states assumptions.',
    system: 'You are a careful data analyst. Use code_execute (pandas/numpy) to load and analyse data, data_stats for descriptive statistics, and chart to visualise. Explain findings plainly, show the numbers, state your assumptions, and export a tidy result when asked.',
    tools: ['code_execute', 'data_stats', 'data_convert', 'chart', 'doc_export'],
  },
  {
    id: 'agent_planner',
    name: 'Planner',
    role: 'planner',
    description: 'Breaks a goal into a concrete, ordered list of steps.',
    system: 'You are a planning specialist. Given a goal, produce a concise, ordered list of concrete, independently-executable steps. Each step should be a single clear instruction. Do not execute anything — only plan.',
    tools: [],
  },
  {
    id: 'agent_devops',
    name: 'DevOps & SysAdmin',
    role: 'devops',
    description: 'Inspects local directories, reads files, handles shell execution and network diagnostics.',
    system: 'You are a DevOps and Infrastructure specialist. Inspect workspace files, manage file structures, run network checks (whois, ip_lookup), parse web endpoints, and automate system configurations. Always verify directory paths and confirm destructive operations.',
    tools: ['whois', 'ip_lookup', 'web_extract', 'link_preview', 'diff', 'hash', 'regex', 'data_convert', 'uuid'],
  },
  {
    id: 'agent_creative',
    name: 'Creative & Media Designer',
    role: 'designer',
    description: 'Generates images, stickers, diagrams, charts, audio, and visual assets.',
    system: 'You are a creative multimedia designer. Generate visual content using image_generate and sticker_generate, design architecture diagrams with diagram and diagram_render, build data charts with chart, and convert text to speech or audio assets.',
    tools: ['image_generate', 'sticker_generate', 'diagram', 'diagram_render', 'chart', 'color_palette', 'tts', 'text_to_audio', 'video_render'],
  },
  {
    id: 'agent_translator',
    name: 'Linguist & Localizer',
    role: 'translator',
    description: 'Translates text across languages, checks grammar, and provides linguistic nuances.',
    system: 'You are a master linguist and translator. Translate text accurately using translate, look up precise word meanings and synonyms with dictionary and thesaurus, and polish tone and grammar with grammar_check.',
    tools: ['translate', 'dictionary', 'thesaurus', 'grammar_check', 'summarize'],
  },
  {
    id: 'agent_auditor',
    name: 'Document & OCR Auditor',
    role: 'auditor',
    description: 'Extracts text from PDFs/images, performs OCR, searches local vault documents, and summarizes files.',
    system: 'You are a document auditing specialist. Perform OCR on images with ocr, extract text from PDF files using pdf_extract, search and list internal vault documents (doc_search, doc_list), and synthesize structured summaries.',
    tools: ['ocr', 'pdf_extract', 'doc_search', 'doc_list', 'local_vault_search', 'summarize', 'doc_export', 'keyword_extract'],
  },
]

async function storedAgents() { return (await getSetting(KEY, [])) || [] }

export async function getAgents() {
  const stored = await storedAgents()
  const hidden = (await getSetting(HIDDEN, [])) || []
  const storedIds = new Set(stored.map(a => a.id))
  const presets = PRESET_AGENTS
    .filter(p => !storedIds.has(p.id) && !hidden.includes(p.id))
    .map(p => ({ ...p, builtin: true }))
  return [...presets, ...stored]
}
export async function saveAgents(list) { return setSetting(KEY, list || []) }

const slug = (s) => String(s || 'agent').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'agent'

/** Create or update (matched by id). Returns the stored agent. */
export async function upsertAgent(agent) {
  const list = await storedAgents()
  const id = agent.id || `ag_${slug(agent.name)}_${Date.now().toString(36)}`
  const clean = {
    id,
    name: (agent.name || 'Untitled agent').trim(),
    role: (agent.role || slug(agent.name)).trim(),
    description: (agent.description || '').trim(),
    system: (agent.system || '').trim(),
    tools: Array.isArray(agent.tools) ? agent.tools.filter(Boolean) : [],
    model: agent.model || null,
    provider: agent.provider || null,
    canDelegate: !!agent.canDelegate,
    subAgents: Array.isArray(agent.subAgents) ? agent.subAgents.filter(Boolean) : [],
  }
  await saveAgents([...list.filter(a => a.id !== id), clean])
  return clean
}

export async function deleteAgent(id) {
  const stored = await storedAgents()
  await saveAgents(stored.filter(a => a.id !== id))
  if (PRESET_AGENTS.some(p => p.id === id)) {
    const hidden = (await getSetting(HIDDEN, [])) || []
    if (!hidden.includes(id)) await setSetting(HIDDEN, [...hidden, id])
  }
  if ((await getActiveAgentId()) === id) await setActiveAgent(null)
}

export async function getActiveAgentId() { return getSetting(ACTIVE, null) }
export async function setActiveAgent(id) { return setSetting(ACTIVE, id ?? null) }

export async function getActiveAgent() {
  const id = await getActiveAgentId()
  if (!id) return null
  return (await getAgents()).find(a => a.id === id) || null
}

/** Resolve an agent the model referenced by id, role or name (case-insensitive). */
export async function getAgentById(idOrRole) {
  if (!idOrRole) return null
  const q = String(idOrRole).toLowerCase().trim()
  const all = await getAgents()
  return all.find(a => a.id.toLowerCase() === q) ||
    all.find(a => (a.role || '').toLowerCase() === q) ||
    all.find(a => a.name.toLowerCase() === q) ||
    all.find(a => a.name.toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q)) ||
    null
}

/** Given an agent and all tool names, which to DISABLE (allowlist → disable rest). */
export function agentDisabledTools(agent, allToolNames = []) {
  if (!agent?.tools?.length) return []
  const allow = new Set(agent.tools)
  return allToolNames.filter(n => !allow.has(n))
}

/** Share: one agent → JSON string. */
export function exportAgent(agent) {
  const { name, role, description, system, tools, model, provider, canDelegate, subAgents } = agent
  return JSON.stringify({ yogatik_agent: 1, name, role, description, system, tools, model, provider, canDelegate, subAgents }, null, 2)
}

/** Import an agent JSON string (validated). Throws on malformed input. */
export function parseAgent(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json
  if (!d || !d.name || typeof d.system !== 'string') throw new Error('Not a valid Yogatik agent file.')
  return {
    name: String(d.name), role: String(d.role || ''), description: String(d.description || ''),
    system: String(d.system),
    tools: Array.isArray(d.tools) ? d.tools.map(String) : [],
    model: d.model || null, provider: d.provider || null,
    canDelegate: !!d.canDelegate,
    subAgents: Array.isArray(d.subAgents) ? d.subAgents.map(String) : [],
  }
}
