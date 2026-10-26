/**
 * conceptGraphTool — Exposes the cross-session concept graph to the agent.
 * Allows querying synthesized insights, ego networks, and causal paths.
 */

import {
  queryConceptGraph,
  getEgoNetwork,
  findPaths,
  synthesizeInsight,
  nightlyConceptGraphBuild,
  getGraphStats,
  exportGraphForViz,
  processConversation,
  upsertNode,
  upsertEdge,
  NODE_TYPES,
  EDGE_TYPES,
} from '../conceptGraph'

export const conceptGraphTool = {
  schema: {
    description:
      'Query and interact with the persistent cross-session concept graph. ' +
      'The graph synthesizes entities, concepts, decisions, and relationships from conversation history. ' +
      'Use for: recalling synthesized insights (not raw memories), finding causal paths, exploring topic neighborhoods, and getting high-level summaries.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['query', 'ego_network', 'find_paths', 'synthesize', 'stats', 'export_viz', 'nightly_build', 'add_node', 'add_edge'],
          description: 'What to do',
        },
        // For query
        query: { type: 'string', description: 'Search query for nodes' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        types: { type: 'array', items: { type: 'string' }, description: 'Filter by node types: entity, concept, topic, decision, preference, artifact, goal' },
        minConfidence: { type: 'number', description: 'Minimum confidence 0-1 (default 0.3)' },
        includeEdges: { type: 'boolean', description: 'Include connecting edges (default true)' },
        // For ego_network
        nodeId: { type: 'string', description: 'Center node ID' },
        depth: { type: 'number', description: 'Hops to traverse (1-3, default 2)' },
        // For find_paths
        sourceId: { type: 'string', description: 'Source node ID' },
        targetId: { type: 'string', description: 'Target node ID' },
        maxDepth: { type: 'number', description: 'Max path length (default 4)' },
        // For synthesize
        topic: { type: 'string', description: 'Topic to synthesize insight for' },
        // For add_node
        node: { type: 'object', description: 'Node data: { type, label, properties?, sourceConversationId?, confidence? }' },
        // For add_edge
        edge: { type: 'object', description: 'Edge data: { sourceId, targetId, type, weight?, properties?, evidence? }' },
      },
      required: ['action'],
    },
  },

  async execute(args = {}) {
    const { action } = args

    switch (action) {
      case 'query': {
        const { query, limit = 20, types, minConfidence = 0.3, includeEdges = true } = args
        if (!query) return { success: false, error: 'query required for query action' }
        const results = await queryConceptGraph(query, { limit, types, minConfidence, includeEdges })
        return { success: true, results, count: results.length }
      }

      case 'ego_network': {
        const { nodeId, depth = 2 } = args
        if (!nodeId) return { success: false, error: 'nodeId required for ego_network' }
        const network = await getEgoNetwork(nodeId, depth)
        return { success: true, ...network }
      }

      case 'find_paths': {
        const { sourceId, targetId, maxDepth = 4 } = args
        if (!sourceId || !targetId) return { success: false, error: 'sourceId and targetId required' }
        const paths = await findPaths(sourceId, targetId, maxDepth)
        return { success: true, paths, count: paths.length }
      }

      case 'synthesize': {
        const { topic } = args
        if (!topic) return { success: false, error: 'topic required for synthesize' }
        const insight = await synthesizeInsight(topic)
        return { success: true, ...insight }
      }

      case 'stats': {
        const stats = await getGraphStats()
        return { success: true, ...stats }
      }

      case 'export_viz': {
        const viz = await exportGraphForViz()
        return { success: true, ...viz }
      }

      case 'nightly_build': {
        const result = await nightlyConceptGraphBuild()
        return { success: true, ...result }
      }

      case 'add_node': {
        const { node } = args
        if (!node || !node.type || !node.label) {
          return { success: false, error: 'node with type and label required' }
        }
        const id = await upsertNode(node)
        return { success: true, nodeId: id }
      }

      case 'add_edge': {
        const { edge } = args
        if (!edge || !edge.sourceId || !edge.targetId || !edge.type) {
          return { success: false, error: 'edge with sourceId, targetId, type required' }
        }
        const id = await upsertEdge(edge)
        return { success: true, edgeId: id }
      }

      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
