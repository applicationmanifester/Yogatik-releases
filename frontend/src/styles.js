/**
 * Response Styles — a persistent tone/format profile applied to EVERY reply,
 * independent of Skills (which are task bundles that also scope tools). One
 * active style at a time; stored locally. Mirrors the "Styles" feature heavy
 * chat users rely on to keep a consistent voice.
 */
import { getSetting, setSetting } from './db'
import { getScoped, setScoped, clearScoped } from './chatScope'

const KEY = 'custom_styles'
const ACTIVE = 'active_style'

export const BUILT_IN_STYLES = [
  { id: 'default', name: 'Default', description: 'Balanced, natural responses.', system: '' },
  {
    id: 'concise', name: 'Concise',
    description: 'Short and direct — minimal words.',
    system: 'Answer as briefly as possible. Lead with the answer, cut all filler and preamble, and prefer one tight paragraph or a short list. No restating the question, no summary of what you did.',
  },
  {
    id: 'formal', name: 'Formal',
    description: 'Professional, polished prose.',
    system: 'Write in a professional, polished register suitable for business or academic contexts. Use complete sentences and precise vocabulary, avoid slang and contractions, and keep the tone measured and objective.',
  },
  {
    id: 'explanatory', name: 'Explanatory',
    description: 'Teaches with context and examples.',
    system: 'Explain thoroughly for a curious learner. Define key terms, give the reasoning and context behind the answer, and include a concrete example or analogy. Build from fundamentals, but stay on point.',
  },
  {
    id: 'eli5', name: 'Simple (ELI5)',
    description: 'Plain language anyone can follow.',
    system: 'Explain in the simplest possible terms, as if to a smart 12-year-old. Use everyday words, short sentences, and vivid analogies. Avoid jargon; if a technical term is unavoidable, define it immediately.',
  },
  {
    id: 'bullet', name: 'Bullet Points',
    description: 'Structured, scannable lists.',
    system: 'Structure answers as scannable bullet points with short bold labels where useful. Prefer lists and headings over long prose. Keep each bullet to one idea.',
  },
]

async function storedStyles() { return (await getSetting(KEY, [])) || [] }

export async function getStyles() {
  const stored = await storedStyles()
  const ids = new Set(stored.map(s => s.id))
  const builtins = BUILT_IN_STYLES.filter(s => !ids.has(s.id)).map(s => ({ ...s, builtin: true }))
  return [...builtins, ...stored]
}

const slug = (s) => String(s || 'style').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'style'

/** Create or update a custom style (matched by id). */
export async function upsertStyle(style) {
  const list = await storedStyles()
  const id = style.id || `st_${slug(style.name)}_${Date.now().toString(36)}`
  const clean = {
    id,
    name: (style.name || 'Untitled style').trim(),
    description: (style.description || '').trim(),
    system: (style.system || '').trim(),
  }
  await setSetting(KEY, [...list.filter(s => s.id !== id), clean])
  return clean
}

export async function deleteStyle(id) {
  await setSetting(KEY, (await storedStyles()).filter(s => s.id !== id))
  if ((await getActiveStyleId()) === id) await setActiveStyle('default')
}

// Per chat, inheriting the global default (see chatScope.js).
export async function getActiveStyleId(conversationId) {
  return (await getScoped(ACTIVE, conversationId, 'default')) || 'default'
}
export async function setActiveStyle(id, conversationId) {
  return setScoped(ACTIVE, conversationId, id || 'default')
}
/** Drop this chat's binding so it follows the global default again. */
export async function inheritActiveStyle(conversationId) {
  return clearScoped(ACTIVE, conversationId)
}

export async function getActiveStyle(conversationId) {
  const id = await getActiveStyleId(conversationId)
  return (await getStyles()).find(s => s.id === id) || null
}

/** The system-prompt fragment for the active style ('' for Default/none). */
export async function getActiveStyleBlock(conversationId) {
  const s = await getActiveStyle(conversationId)
  if (!s?.system) return ''
  return `\n\nRESPONSE STYLE — "${s.name}":\n${s.system}`
}
