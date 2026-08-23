/**
 * doc_search — retrieval over files the user uploaded (stored in IndexedDB).
 * Chunks are indexed with BM25 at query time; indexes are memoised per document.
 */

import { getDocuments, getSetting } from '../db'
import { buildIndex, search } from '../retrieval'
import { resolveFeatures } from '../features'
import { semanticRerank, setSemanticConsent } from '../semantic'

/** Is the opt-in on-device semantic re-ranker enabled? */
async function semanticOn() {
  const on = resolveFeatures(await getSetting('chat_prefs', {}))?.semanticSearch === true
  setSemanticConsent(on) // mirror consent so the model may load when used
  return on
}

const indexCache = new Map() // docId -> { index, chunks, updatedAt }

function indexFor(doc) {
  const cached = indexCache.get(doc.id)
  if (cached && cached.updatedAt === doc.createdAt) return cached
  const entry = { index: buildIndex(doc.chunks), chunks: doc.chunks, updatedAt: doc.createdAt }
  indexCache.set(doc.id, entry)
  return entry
}

export function invalidateDocIndex(id) {
  if (id == null) indexCache.clear()
  else indexCache.delete(id)
}

export const docSearchTool = {
  schema: {
    description:
      'Search the documents the user has uploaded in this app (PDF, text, markdown, CSV, JSON). ' +
      'Use whenever the user refers to "the document", "my file", "the PDF", "the attachment", or asks a question ' +
      'that the uploaded material would answer. Returns the most relevant passages with their document names.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for in the documents' },
        document: { type: 'string', description: 'Optional: restrict to a document by name' },
        top_k: { type: 'number', description: 'Passages to return (1-10, default 5)' },
      },
      required: ['query'],
    },
  },

  async execute({ query, document, top_k = 5 }) {
    const k = Math.min(Math.max(1, top_k | 0), 10)
    // Scope retrieval to the active project so unrelated files cannot answer.
    let docs = await getDocuments(await getSetting('active_project', null))
    if (!docs.length) return { error: 'No documents uploaded yet. Ask the user to attach a file first.' }
    if (document) {
      const needle = document.toLowerCase()
      const filtered = docs.filter(d => d.name.toLowerCase().includes(needle))
      if (filtered.length) docs = filtered
    }

    // Pull a wider BM25 shortlist when semantic re-ranking is on, so the model
    // has room to reorder by meaning; otherwise just the top k.
    const semantic = await semanticOn()
    const shortlist = semantic ? Math.max(k * 4, 12) : k

    let hits = []
    for (const doc of docs) {
      const { index, chunks } = indexFor(doc)
      for (const { i, score } of search(index, query, shortlist)) {
        hits.push({ score, document: doc.name, passage: chunks[i], chunk: i + 1, of: chunks.length })
      }
    }

    if (!hits.length) {
      return {
        query,
        passages: [],
        note: `No passage matched. Available documents: ${docs.map(d => d.name).join(', ')}.`,
      }
    }

    hits.sort((a, b) => b.score - a.score)
    if (semantic) {
      // semanticRerank falls back to BM25 order on any failure.
      hits = await semanticRerank(query, hits.map(h => ({ ...h, text: h.passage })), k)
    }
    return {
      success: true,
      tool: 'doc_search',
      query,
      retrieval: semantic ? 'hybrid (BM25 + semantic)' : 'BM25',
      documents_searched: docs.map(d => d.name),
      passages: hits.slice(0, k).map(({ score, semanticScore, text, ...rest }) => rest),
    }
  },
}

export const docListTool = {
  schema: {
    description: 'List the documents the user has uploaded, with sizes. Use to check what material is available.',
    parameters: { type: 'object', properties: {} },
  },
  async execute() {
    const docs = await getDocuments()
    return {
      success: true,
      count: docs.length,
      documents: docs.map(d => ({
        // A document row saved before chunking (or by an older schema) has no
        // chunks array; `.length` on it threw and took out the whole listing.
        name: d.name, type: d.type, chars: d.chars, chunks: d.chunks?.length || 0,
        added: new Date(d.createdAt).toISOString(),
      })),
    }
  },
}

export const localVaultTool = {
  schema: {
    description:
      'Search 100% locally across all stored user documents, notes, and past conversation history in IndexedDB. ' +
      'Runs completely offline on-device without any cloud APIs or internet connection.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query to search across local personal vault' },
        top_k: { type: 'number', description: 'Number of passages to return (1-10, default 5)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, top_k = 5 }) {
    const { searchLocalVault } = await import('../retrieval')
    return searchLocalVault(query, top_k)
  },
}
