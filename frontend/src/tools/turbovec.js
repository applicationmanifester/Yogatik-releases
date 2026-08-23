/**
 * TurboVec Browser-Native Vector Tool
 * 
 * Exposes TurboQuant vector indexing and similarity search to LLM agents and the chat UI.
 * Allows instant online document/code indexing with 8x–32x memory compression.
 */

import { TurboVecIndex } from '../turbovec'
import { embed, isSemanticCached } from '../semantic'

// Multi-index registry (namespace -> TurboVecIndex)
const INDICES = new Map()

/**
 * Generate a deterministic high-dimensional bag-of-words pseudo-embedding (384-dim)
 * when transformer model is offline/unloaded so indexing and search work seamlessly in pure JS.
 */
function createFastHashEmbedding(text, dim = 384) {
  const vec = new Float32Array(dim)
  const tokens = String(text).toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (!tokens.length) return vec

  for (const token of tokens) {
    let h1 = 0x811c9dc5
    let h2 = 0x27d4eb2f
    for (let i = 0; i < token.length; i++) {
      const code = token.charCodeAt(i)
      h1 = Math.imul(h1 ^ code, 0x01000193)
      h2 = Math.imul(h2 ^ code, 0x5bd1e995)
    }
    const idx1 = Math.abs(h1) % dim
    const idx2 = Math.abs(h2) % dim
    vec[idx1] += 1.0
    vec[idx2] += 0.5
  }

  // L2 normalize
  let normSq = 0
  for (let i = 0; i < dim; i++) normSq += vec[i] * vec[i]
  const norm = Math.sqrt(normSq)
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm
  }
  return vec
}

/**
 * Get or create an index instance
 */
export function getTurboIndex(name = 'default', { dim = 384, bits = 4 } = {}) {
  const key = String(name || 'default').trim()
  if (!INDICES.has(key)) {
    INDICES.set(key, new TurboVecIndex({ dim, bits, name: key }))
  }
  return INDICES.get(key)
}

/**
 * Embed an array of texts using Transformers.js if available, otherwise fast hash embeddings.
 */
async function getVectorsForTexts(texts, dim = 384) {
  try {
    if (await isSemanticCached()) {
      const embedded = await embed(texts)
      return embedded.map(v => new Float32Array(v))
    }
  } catch {
    // Fall back to fast hash embeddings
  }
  return texts.map(t => createFastHashEmbedding(t, dim))
}

export const turbovecTool = {
  schema: {
    name: 'turbovec',
    description: 'TurboQuant vector database and RAG search engine. Index and search high-dimensional vectors, documents, and code snippets with up to 32x memory compression.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['index', 'search', 'stats', 'delete', 'clear', 'list_indices'],
          description: 'Operation to perform: index items, search Top-K nearest neighbors, inspect stats, delete by ID, or clear index.',
        },
        indexName: {
          type: 'string',
          description: 'Namespace/name of the index (e.g. "default", "codebase", "notes", "rag_docs"). Defaults to "default".',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique identifier for the item' },
              text: { type: 'string', description: 'Text content to index' },
              vector: { type: 'array', items: { type: 'number' }, description: 'Optional raw vector array' },
              metadata: { type: 'object', description: 'Custom metadata properties' },
            },
            required: ['text'],
          },
          description: 'List of documents or vector records to insert during an "index" action.',
        },
        query: {
          type: 'string',
          description: 'Text query for similarity search.',
        },
        queryVector: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional raw query vector for direct vector search.',
        },
        topK: {
          type: 'number',
          description: 'Maximum number of nearest neighbor results to return. Default is 5.',
        },
        bits: {
          type: 'number',
          enum: [1, 2, 4, 8],
          description: 'TurboQuant quantization bit precision (1, 2, 4, or 8 bits). Default is 4.',
        },
        id: {
          type: 'string',
          description: 'Vector ID to delete when action is "delete".',
        },
      },
      required: ['action'],
    },
  },

  async execute({
    action,
    indexName = 'default',
    items = [],
    query = '',
    queryVector = null,
    topK = 5,
    bits = 4,
    id = null,
  }) {
    const validBits = [1, 2, 4, 8].includes(Number(bits)) ? Number(bits) : 4
    const index = getTurboIndex(indexName, { dim: 384, bits: validBits })

    switch (action) {
      case 'index': {
        if (!Array.isArray(items) || items.length === 0) {
          return { success: false, error: 'Please provide an array of items with text or vector to index.' }
        }

        const textsToEmbed = []
        const textIndices = []

        items.forEach((item, idx) => {
          if (!item.vector && item.text) {
            textsToEmbed.push(item.text)
            textIndices.push(idx)
          }
        })

        let generatedVectors = []
        if (textsToEmbed.length > 0) {
          generatedVectors = await getVectorsForTexts(textsToEmbed, index.dim)
        }

        let addedCount = 0
        let gIdx = 0
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const itemId = item.id || `doc_${Date.now()}_${i}`
          let vec = item.vector ? new Float32Array(item.vector) : null

          if (!vec && textIndices.includes(i)) {
            vec = generatedVectors[gIdx++]
          }

          if (vec) {
            index.addVector(itemId, vec, {
              text: item.text || '',
              metadata: item.metadata || {},
            })
            addedCount++
          }
        }

        return {
          success: true,
          action: 'index',
          indexName,
          indexedCount: addedCount,
          totalVectors: index.size,
          stats: index.getStats(),
        }
      }

      case 'search': {
        if (!query && (!queryVector || queryVector.length === 0)) {
          return { success: false, error: 'Please provide either a text "query" or a "queryVector" to search.' }
        }

        if (index.size === 0) {
          return {
            success: true,
            action: 'search',
            indexName,
            results: [],
            message: `Index "${indexName}" is empty. Index documents before searching.`,
          }
        }

        let qVec = queryVector ? new Float32Array(queryVector) : null
        if (!qVec && query) {
          const vecs = await getVectorsForTexts([query], index.dim)
          qVec = vecs[0]
        }

        const results = index.search(qVec, { topK: Number(topK) || 5 })

        return {
          success: true,
          action: 'search',
          indexName,
          query: query || null,
          totalFound: results.length,
          results,
        }
      }

      case 'stats': {
        return {
          success: true,
          action: 'stats',
          indexName,
          stats: index.getStats(),
        }
      }

      case 'list_indices': {
        const list = []
        for (const [name, idx] of INDICES.entries()) {
          list.push(idx.getStats())
        }
        return {
          success: true,
          action: 'list_indices',
          count: list.length,
          indices: list,
        }
      }

      case 'delete': {
        if (!id) return { success: false, error: 'Please specify an "id" to delete.' }
        const deleted = index.delete(id)
        return {
          success: true,
          action: 'delete',
          id,
          deleted,
          remaining: index.size,
        }
      }

      case 'clear': {
        index.clear()
        return {
          success: true,
          action: 'clear',
          indexName,
          message: `Index "${indexName}" cleared.`,
          remaining: index.size,
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Supported actions: index, search, stats, list_indices, delete, clear.`,
        }
    }
  },
}
