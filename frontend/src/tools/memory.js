/**
 * memory — persistent user memory in IndexedDB. Open, keyless, on-device.
 * Mirrors the "memory" feature of the major assistants: the model can save durable
 * facts/preferences and recall them in later sessions. Stored locally only, never
 * uploaded. The user owns it — it can be listed and deleted like any other data.
 */

import { getSetting, setSetting } from '../db'
import { resolveFeatures } from '../features'
import { semanticRerank } from '../semantic'

const KEY = 'user_memory'
const MAX = 200

async function load() { return (await getSetting(KEY, [])) || [] }
async function save(list) { return setSetting(KEY, list.slice(-MAX)) }

const norm = (s) => String(s || '').toLowerCase()

export const memoryTool = {
  schema: {
    description:
      'Durable, on-device memory across sessions. Save a fact or preference the user wants remembered, ' +
      'recall relevant memories, list them, or forget one. Only save things that are stable and useful ' +
      'later (names, preferences, ongoing projects) — not transient chatter. Everything stays in the browser.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['save', 'recall', 'list', 'forget'], description: 'What to do' },
        text: { type: 'string', description: 'For save: the fact to remember. For recall: what to look up.' },
        tag: { type: 'string', description: 'Optional category, e.g. "preference", "project".' },
        store: { type: 'string', enum: ['episodic', 'semantic', 'procedural', 'emotional'], description: 'Memory kind: episodic (dated events), semantic (stable facts, default), procedural (preferences), emotional (sentiment — stays on-device).' },
        importance: { type: 'number', description: 'Optional 0–1 salience hint for how strongly to weight this memory.' },
        id: { type: 'string', description: 'For forget: the memory id to delete.' },
      },
      required: ['action'],
    },
  },
  async execute({ action, text, tag, id, store, importance }) {
    try {
      const list = await load()

      if (action === 'save') {
        if (!text?.trim()) return { success: false, error: 'Nothing to save.' }
        // De-dupe near-identical memories.
        if (list.some(m => norm(m.text) === norm(text))) {
          return { success: true, tool: 'memory', note: 'Already remembered.', count: list.length }
        }
        // Random suffix: two saves in the same millisecond must not collide.
        const id = `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const entry = { id, text: text.trim(), tag: tag || undefined, at: Date.now() }
        list.push(entry)
        await save(list)
        // Also write to the structured four-store memory (memory4, db v5). The
        // flat store stays for backward-compatible recall; the structured store
        // is what the salience-ranked prompt block now draws from.
        try {
          const { remember } = await import('../memory4')
          await remember({ store: store || 'semantic', text, tag, importance: importance ?? 0.5 })
        } catch { /* db v5 unavailable — flat save still succeeded */ }
        return { success: true, tool: 'memory', saved: entry, store: store || 'semantic', count: list.length }
      }

      if (action === 'recall') {
        const q = norm(text)
        const terms = q.split(/\s+/).filter(Boolean)
        const scored = list
          .map(m => ({ ...m, text: m.text, score: terms.reduce((s, t) => s + (norm(m.text).includes(t) ? 1 : 0), 0) }))

        // Semantic recall (opt-in): re-rank by meaning so "what do I like to drink"
        // finds "prefers black coffee" even with no shared keyword. Falls back to
        // keyword order when the feature/model is unavailable.
        const semantic = resolveFeatures(await getSetting('chat_prefs', {}))?.semanticSearch === true
        let memories
        if (semantic && text && list.length) {
          memories = (await semanticRerank(text, scored, 10))
            .map(({ score, semanticScore, ...m }) => m)
        } else {
          memories = scored
            .filter(x => x.score > 0 || !terms.length)
            .sort((a, b) => b.score - a.score || b.at - a.at)
            .slice(0, 10)
            .map(({ score, ...m }) => m)
        }
        return { success: true, tool: 'memory', query: text || null, retrieval: semantic ? 'semantic+keyword' : 'keyword', memories, total: list.length }
      }

      if (action === 'list') {
        return { success: true, tool: 'memory', memories: list.slice().reverse(), total: list.length }
      }

      if (action === 'forget') {
        const next = list.filter(m => m.id !== id && norm(m.text) !== norm(text))
        await save(next)
        return { success: true, tool: 'memory', removed: list.length - next.length, count: next.length }
      }

      return { success: false, error: `Unknown action "${action}".` }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}
