/**
 * conceptGraph.js — Cross-Session Knowledge Synthesis & Concept Graph.
 * 
 * Builds a persistent graph of entities, concepts, and their relationships
 * extracted from conversation history. Enables the agent to "recall" synthesized
 * insights rather than just raw memories.
 * 
 * Nodes: Entities, concepts, topics, decisions, preferences
 * Edges: Co-occurrence, causal links, temporal sequences, hierarchical
 * 
 * Nightly job: entityExtractTool on conversation history → merge into graph
 * Query: conceptGraphQueryTool for synthesized insights
 */

import { db } from './db'

const GRAPH_STORE = 'concept_graph_nodes'
const EDGE_STORE = 'concept_graph_edges'
const EXTRACTION_LOG = 'concept_extraction_log'

/** Node types */
export const NODE_TYPES = {
  ENTITY: 'entity',        // Person, org, project, tool, technology
  CONCEPT: 'concept',      // Abstract idea, methodology, pattern
  TOPIC: 'topic',          // Discussion theme
  DECISION: 'decision',    // Explicit decision made
  PREFERENCE: 'preference', // User preference
  ARTIFACT: 'artifact',    // File, code, document created
  GOAL: 'goal',            // Stated objective
}

/** Edge types */
export const EDGE_TYPES = {
  CO_OCCURS: 'co_occurs',           // Appeared in same conversation
  CAUSES: 'causes',                 // Causal relationship
  RELATES_TO: 'relates_to',         // General semantic relation
  PART_OF: 'part_of',               // Hierarchical composition
  PRECEDES: 'precedes',             // Temporal sequence
  CONTRADICTS: 'contradicts',       // Conflicting information
  SUPPORTS: 'supports',             // Evidence supporting
  INSTANTIATES: 'instantiates',     // Concept → concrete example
}

/***
 * Adds or updates a node in the concept graph.
 * @param {object} node - { id?, type, label, properties?, sourceConversationId?, confidence? }
 * @returns {string} Node ID
 */
export async function upsertNode(node) {
  const dbInstance = await db
  const now = Date.now()
  
  const existing = node.id ? await dbInstance.table(GRAPH_STORE).get(node.id) : null
  
  const record = {
    id: node.id || `node_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: node.type || NODE_TYPES.CONCEPT,
    label: String(node.label || '').trim(),
    properties: node.properties || {},
    sourceConversationId: node.sourceConversationId || null,
    confidence: Math.max(0, Math.min(1, node.confidence || 0.7)),
    mentionCount: (existing?.mentionCount || 0) + 1,
    firstSeen: existing?.firstSeen || now,
    lastSeen: now,
    mergedFrom: existing?.mergedFrom ? [...existing.mergedFrom, node.id].filter(Boolean) : [],
  }

  await dbInstance.table(GRAPH_STORE).put(record)
  return record.id
}

/***
 * Adds or updates an edge in the concept graph.
 * @param {object} edge - { sourceId, targetId, type, weight?, properties?, evidence? }
 * @returns {string} Edge ID
 */
export async function upsertEdge(edge) {
  const dbInstance = await db
  const now = Date.now()
  
  // Create deterministic ID for deduplication
  const edgeKey = `${edge.sourceId}__${edge.type}__${edge.targetId}`
  const existing = await dbInstance.table(EDGE_STORE).where('key').equals(edgeKey).first()

  const record = {
    id: existing?.id || `edge_${now}_${Math.random().toString(36).slice(2, 8)}`,
    key: edgeKey,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    type: edge.type || EDGE_TYPES.RELATES_TO,
    weight: Math.max(0, Math.min(1, edge.weight || 0.5)),
    properties: edge.properties || {},
    evidence: edge.evidence || [],
    mentionCount: (existing?.mentionCount || 0) + 1,
    firstSeen: existing?.firstSeen || now,
    lastSeen: now,
  }

  await dbInstance.table(EDGE_STORE).put(record)
  return record.id
}

/***
 * Extracts entities and concepts from text using the entityExtractTool.
 * @param {string} text
 * @param {string} conversationId
 * @returns {Array<object>} Extracted entities with types
 */
export async function extractEntitiesFromText(text, conversationId) {
  if (!text || text.length < 50) return []

  try {
    const result = await entityExtractTool.execute({ text, maxEntities: 50 })
    if (!result.success || !result.entities) return []

    return result.entities.map(e => ({
      ...e,
      sourceConversationId: conversationId,
    }))
  } catch {
    return []
  }
}

/***
 * Processes a conversation's messages and updates the concept graph.
 * @param {string} conversationId
 * @param {Array<object>} messages - [{ role, content, createdAt }]
 * @returns {object} Stats about what was extracted/added
 */
export async function processConversation(conversationId, messages) {
  if (!messages?.length) return { nodes: 0, edges: 0 }

  // Combine all text for entity extraction
  const fullText = messages
    .filter(m => m.content && typeof m.content === 'string')
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n')

  const entities = await extractEntitiesFromText(fullText, conversationId)
  let nodesAdded = 0
  let edgesAdded = 0

  // Upsert nodes
  const nodeIdMap = new Map() // label+type -> nodeId
  for (const entity of entities) {
    const key = `${entity.type}:${entity.label.toLowerCase()}`
    let nodeId = nodeIdMap.get(key)
    
    if (!nodeId) {
      // Check if node already exists in graph
      const dbInstance = await db
      const existing = await dbInstance.table(GRAPH_STORE)
        .where('label').equalsIgnoreCase(entity.label)
        .and(n => n.type === entity.type)
        .first()
      nodeId = existing?.id
    }

    const savedId = await upsertNode({
      id: nodeId,
      type: entity.type,
      label: entity.label,
      properties: entity.properties || {},
      sourceConversationId: conversationId,
      confidence: entity.confidence || 0.7,
    })

    if (!nodeId) nodesAdded++
    nodeIdMap.set(key, savedId)
  }

  // Create co-occurrence edges between entities mentioned in same conversation
  const nodeIds = Array.from(nodeIdMap.values())
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      await upsertEdge({
        sourceId: nodeIds[i],
        targetId: nodeIds[j],
        type: EDGE_TYPES.CO_OCCURS,
        weight: 0.3,
        evidence: [{ conversationId, timestamp: Date.now() }],
      })
      edgesAdded++
    }
  }

  // Log extraction
  await dbInstance.table(EXTRACTION_LOG).add({
    conversationId,
    timestamp: Date.now(),
    messageCount: messages.length,
    entitiesExtracted: entities.length,
    nodesAdded,
    edgesAdded,
  })

  return { nodesAdded, edgesAdded, entitiesExtracted: entities.length }
}

/***
 * Queries the concept graph for nodes matching a query.
 * @param {string} query - Search query
 * @param {object} options - { limit, types, minConfidence, includeEdges }
 * @returns {Array<object>} Matching nodes with optional edge context
 */
export async function queryConceptGraph(query, options = {}) {
  const {
    limit = 20,
    types = null,
    minConfidence = 0.3,
    includeEdges = true,
  } = options

  const dbInstance = await db
  const q = query.toLowerCase().trim()

  // Simple keyword matching on labels (in production, use vector search)
  let nodes = await dbInstance.table(GRAPH_STORE)
    .filter(n => n.confidence >= minConfidence && n.label.toLowerCase().includes(q))
    .limit(limit)
    .toArray()

  if (types && types.length) {
    const typeSet = new Set(types)
    nodes = nodes.filter(n => typeSet.has(n.type))
  }

  // Sort by confidence * mentionCount (salience)
  nodes.sort((a, b) => (b.confidence * b.mentionCount) - (a.confidence * a.mentionCount))
  nodes = nodes.slice(0, limit)

  if (!includeEdges) return nodes

  // Fetch connecting edges
  const nodeIds = new Set(nodes.map(n => n.id))
  const edges = await dbInstance.table(EDGE_STORE)
    .filter(e => nodeIds.has(e.sourceId) || nodeIds.has(e.targetId))
    .toArray()

  // Build adjacency for each node
  const edgesByNode = new Map()
  for (const edge of edges) {
    if (!edgesByNode.has(edge.sourceId)) edgesByNode.set(edge.sourceId, [])
    if (!edgesByNode.has(edge.targetId)) edgesByNode.set(edge.targetId, [])
    edgesByNode.get(edge.sourceId).push({ ...edge, direction: 'out' })
    edgesByNode.get(edge.targetId).push({ ...edge, direction: 'in' })
  }

  return nodes.map(n => ({
    ...n,
    edges: edgesByNode.get(n.id) || [],
  }))
}

/***
 * Gets a subgraph around a central node (ego network).
 * @param {string} nodeId
 * @param {number} depth - Hops to traverse (1-3)
 * @returns {object} { nodes, edges }
 */
export async function getEgoNetwork(nodeId, depth = 2) {
  const dbInstance = await db
  const visited = new Set([nodeId])
  const frontier = new Set([nodeId])
  const allNodes = new Map()
  const allEdges = []

  const centerNode = await dbInstance.table(GRAPH_STORE).get(nodeId)
  if (centerNode) allNodes.set(nodeId, centerNode)

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set()
    
    for (const fid of frontier) {
      const edges = await dbInstance.table(EDGE_STORE)
        .filter(e => e.sourceId === fid || e.targetId === fid)
        .toArray()

      for (const edge of edges) {
        allEdges.push(edge)
        const neighborId = edge.sourceId === fid ? edge.targetId : edge.sourceId
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          nextFrontier.add(neighborId)
          const neighbor = await dbInstance.table(GRAPH_STORE).get(neighborId)
          if (neighbor) allNodes.set(neighborId, neighbor)
        }
      }
    }
    
    if (nextFrontier.size === 0) break
    frontier.clear()
    for (const id of nextFrontier) frontier.add(id)
  }

  return {
    nodes: Array.from(allNodes.values()),
    edges: allEdges,
  }
}

/***
 * Finds paths between two nodes (for causal reasoning).
 * @param {string} sourceId
 * @param {string} targetId
 * @param {number} maxDepth
 * @returns {Array<Array<object>>} Paths (arrays of edges)
 */
export async function findPaths(sourceId, targetId, maxDepth = 4) {
  const dbInstance = await db
  const paths = []
  
  async function dfs(currentId, targetId, path, depth, visited) {
    if (depth > maxDepth) return
    if (currentId === targetId) {
      paths.push([...path])
      return
    }

    const edges = await dbInstance.table(EDGE_STORE)
      .filter(e => e.sourceId === currentId)
      .toArray()

    for (const edge of edges) {
      if (visited.has(edge.targetId)) continue
      visited.add(edge.targetId)
      path.push(edge)
      await dfs(edge.targetId, targetId, path, depth + 1, visited)
      path.pop()
      visited.delete(edge.targetId)
    }
  }

  await dfs(sourceId, targetId, [], 0, new Set([sourceId]))
  return paths.sort((a, b) => a.length - b.length)
}

/***
 * Gets high-level synthesized insights for a topic.
 * @param {string} topic
 * @returns {object} Synthesized insight with supporting evidence
 */
export async function synthesizeInsight(topic) {
  const results = await queryConceptGraph(topic, { limit: 30, includeEdges: true })
  if (!results.length) return { insight: '', confidence: 0, evidence: [] }

  // Group by node type
  const byType = {}
  for (const n of results) {
    if (!byType[n.type]) byType[n.type] = []
    byType[n.type].push(n)
  }

  // Build insight summary
  const parts = []
  const evidence = []

  if (byType.DECISION?.length) {
    parts.push(`Decisions: ${byType.DECISION.map(d => d.label).join('; ')}`)
    evidence.push(...byType.DECISION.flatMap(d => d.edges))
  }
  if (byType.PREFERENCE?.length) {
    parts.push(`Preferences: ${byType.PREFERENCE.map(p => p.label).join('; ')}`)
  }
  if (byType.GOAL?.length) {
    parts.push(`Goals: ${byType.GOAL.map(g => g.label).join('; ')}`)
  }
  if (byType.ENTITY?.length) {
    parts.push(`Key entities: ${byType.ENTITY.slice(0, 5).map(e => e.label).join(', ')}`)
  }
  if (byType.CONCEPT?.length) {
    parts.push(`Related concepts: ${byType.CONCEPT.slice(0, 5).map(c => c.label).join(', ')}`)
  }

  return {
    topic,
    insight: parts.join(' | '),
    confidence: Math.min(0.9, results.reduce((sum, n) => sum + n.confidence, 0) / results.length),
    nodeCount: results.length,
    evidence: evidence.slice(0, 10),
    generatedAt: Date.now(),
  }
}

/***
 * Nightly batch job: processes all unprocessed conversations.
 * Called by schedulerTool.
 * @returns {object} Job stats
 */
export async function nightlyConceptGraphBuild() {
  const dbInstance = await db
  console.log('[ConceptGraph] Starting nightly build...')

  // Get all conversations
  const conversations = await dbInstance.table('conversations').toArray()
  let totalNodes = 0
  let totalEdges = 0
  let processed = 0

  for (const conv of conversations) {
    // Check if already processed recently
    const recentLog = await dbInstance.table(EXTRACTION_LOG)
      .where('conversationId').equals(conv.id)
      .reverse()
      .sortBy('timestamp')
      .then(logs => logs[0])

    if (recentLog && (Date.now() - recentLog.timestamp) < 24 * 60 * 60 * 1000) {
      continue // Skip if processed in last 24h
    }

    // Get messages
    const messages = await dbInstance.table('messages')
      .where('conversationId').equals(conv.id)
      .toArray()

    if (!messages.length) continue

    const stats = await processConversation(conv.id, messages)
    totalNodes += stats.nodesAdded
    totalEdges += stats.edgesAdded
    processed++
  }

  console.log(`[ConceptGraph] Nightly build complete: ${processed} conversations, ${totalNodes} nodes, ${totalEdges} edges added`)
  return { conversationsProcessed: processed, nodesAdded: totalNodes, edgesAdded: totalEdges }
}

/***
 * Gets graph statistics.
 * @returns {object} Stats
 */
export async function getGraphStats() {
  const dbInstance = await db
  const [nodeCount, edgeCount, typeCounts] = await Promise.all([
    dbInstance.table(GRAPH_STORE).count(),
    dbInstance.table(EDGE_STORE).count(),
    dbInstance.table(GRAPH_STORE).toArray().then(nodes => {
      const counts = {}
      for (const n of nodes) counts[n.type] = (counts[n.type] || 0) + 1
      return counts
    }),
  ])

  return { nodeCount, edgeCount, typeCounts, avgDegree: edgeCount * 2 / Math.max(1, nodeCount) }
}

/***
 * Exports graph for visualization (e.g., cytoscape.js, d3).
 * @returns {object} { elements: { nodes, edges } }
 */
export async function exportGraphForViz() {
  const dbInstance = await db
  const [nodes, edges] = await Promise.all([
    dbInstance.table(GRAPH_STORE).toArray(),
    dbInstance.table(EDGE_STORE).toArray(),
  ])

  return {
    elements: {
      nodes: nodes.map(n => ({
        data: { id: n.id, label: n.label, type: n.type, confidence: n.confidence, mentions: n.mentionCount },
        classes: n.type,
      })),
      edges: edges.map(e => ({
        data: { id: e.id, source: e.sourceId, target: e.targetId, type: e.type, weight: e.weight },
      })),
    },
  }
}
