/**
 * mcpAdvanced.js — Advanced MCP (Model Context Protocol) 2025/2026 Capability Suite.
 *
 * Provides:
 * 1. Multi-part and Multimodal Content Normalization (text, image, audio, embedded resource).
 * 2. URI Template matching & parameter substitution for dynamic resources (RFC 6570 subset).
 * 3. Fast schema compaction to minimize prompt token overhead.
 * 4. Dynamic MCP tool search & inspection for on-demand agent capability discovery.
 */

/**
 * Normalizes multi-part MCP tool call results into human/agent friendly markdown and structured payloads.
 *
 * @param {object} result - JSON-RPC result from tools/call
 * @returns {{ text: string, images: Array<{ mimeType: string, data: string }>, resources: Array<any>, structured: any }}
 */
export function normalizeMcpCallResult(result) {
  if (!result) return { text: '', images: [], resources: [], structured: null }

  const contents = Array.isArray(result.content) ? result.content : []
  const textParts = []
  const images = []
  const resources = []

  for (const item of contents) {
    if (!item) continue
    if (item.type === 'text') {
      if (item.text) textParts.push(item.text)
    } else if (item.type === 'image') {
      // item.data is base64, item.mimeType is e.g. 'image/png'
      if (item.data) {
        images.push({ mimeType: item.mimeType || 'image/png', data: item.data })
        textParts.push(`![MCP Image](data:${item.mimeType || 'image/png'};base64,${item.data.slice(0, 32)}...)`)
      }
    } else if (item.type === 'resource') {
      if (item.resource) {
        resources.push(item.resource)
        const resText = item.resource.text || (item.resource.blob ? `[Binary Resource: ${item.resource.uri}]` : '')
        if (resText) textParts.push(resText)
      }
    } else if (typeof item === 'string') {
      textParts.push(item)
    }
  }

  // If there's structured content or text representation was empty
  let text = textParts.join('\n\n').trim()
  if (!text && result.structuredContent) {
    try {
      text = typeof result.structuredContent === 'string'
        ? result.structuredContent
        : JSON.stringify(result.structuredContent, null, 2)
    } catch {
      text = String(result.structuredContent)
    }
  }

  return {
    text: text || (result.isError ? 'Tool execution failed' : 'Success (no output)'),
    images,
    resources,
    structured: result.structuredContent || null,
  }
}

/**
 * Expands a URI template with provided variables (e.g. "db://tables/{name}/schema" + { name: "users" } -> "db://tables/users/schema").
 *
 * @param {string} template - URI Template string
 * @param {object} vars - Key/value pairs
 * @returns {string} Expanded URI
 */
export function expandUriTemplate(template = '', vars = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return vars[key] !== undefined ? encodeURIComponent(String(vars[key])) : match
  })
}

/**
 * Compacts tool parameter schemas to reduce system prompt token consumption.
 * Strips superfluous empty descriptions, removes extra whitespaces, and optimizes schema properties.
 *
 * @param {object} schema - JSON Schema object
 * @returns {object} Compacted schema
 */
export function compactToolSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const clone = JSON.parse(JSON.stringify(schema))

  function clean(obj) {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      obj.forEach(clean)
      return
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim().replace(/\s+/g, ' ')
        if (!obj[key] && key === 'description') delete obj[key]
      } else if (typeof obj[key] === 'object') {
        clean(obj[key])
      }
    }
  }

  clean(clone)
  return clone
}

/**
 * Dynamically searches discovered MCP tools across all connected servers by keyword or intent.
 *
 * @param {Array<{ name: string, description: string, serverId: string, parameters: any }>} tools
 * @param {string} query
 * @param {number} limit
 * @returns {Array<any>}
 */
export function searchMcpTools(tools = [], query = '', limit = 10) {
  if (!Array.isArray(tools) || !tools.length) return []
  const q = String(query || '').toLowerCase().trim()
  if (!q) return tools.slice(0, limit)

  const terms = q.split(/\s+/).filter(Boolean)

  const scored = tools.map(t => {
    const name = String(t.name || '').toLowerCase()
    const desc = String(t.description || '').toLowerCase()
    const server = String(t.serverId || '').toLowerCase()

    let score = 0
    for (const term of terms) {
      if (name.includes(term)) score += 10
      if (desc.includes(term)) score += 5
      if (server.includes(term)) score += 3
    }

    return { ...t, _score: score }
  })

  return scored
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest)
}
