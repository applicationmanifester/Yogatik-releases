/**
 * Semantica — Graph-Native Infrastructure for Context and Accountable AI Systems.
 * Provides Context Graphs, Causal Decision Intelligence, Multi-hop Traversal,
 * Policy Compliance Gates, and W3C PROV-O Audit Trails.
 */

// In-memory singletons for active session
class ContextGraph {
  constructor() {
    this.nodes = new Map()
    this.edges = []
    this.history = [] // List of mutations with timestamps
  }

  addNode(id, type = 'Entity', properties = {}) {
    const node = {
      id: String(id),
      type: String(type),
      properties: { ...properties },
      createdAt: properties.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.nodes.set(node.id, node)
    this.history.push({ action: 'add_node', node: { ...node }, timestamp: node.updatedAt })
    return node
  }

  addEdge(source, target, edgeType = 'relates_to', properties = {}, weight = 1.0) {
    const sId = String(source)
    const tId = String(target)
    if (!this.nodes.has(sId)) this.addNode(sId, 'Entity', { name: sId })
    if (!this.nodes.has(tId)) this.addNode(tId, 'Entity', { name: tId })

    const edge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      source: sId,
      target: tId,
      edgeType: String(edgeType),
      properties: { ...properties },
      weight: typeof weight === 'number' ? weight : 1.0,
      createdAt: properties.createdAt || new Date().toISOString(),
    }
    this.edges.push(edge)
    this.history.push({ action: 'add_edge', edge: { ...edge }, timestamp: edge.createdAt })
    return edge
  }

  getNeighbors(nodeId, hops = 1) {
    const targetId = String(nodeId)
    if (!this.nodes.has(targetId)) return { root: null, neighbors: [], paths: [] }

    const visited = new Set([targetId])
    let currentLevel = [targetId]
    const neighbors = []
    const paths = []

    for (let h = 0; h < hops; h++) {
      const nextLevel = []
      for (const curr of currentLevel) {
        for (const edge of this.edges) {
          let neighborId = null
          let direction = 'out'
          if (edge.source === curr && !visited.has(edge.target)) {
            neighborId = edge.target
            direction = 'out'
          } else if (edge.target === curr && !visited.has(edge.source)) {
            neighborId = edge.source
            direction = 'in'
          }

          if (neighborId) {
            visited.add(neighborId)
            nextLevel.push(neighborId)
            const nNode = this.nodes.get(neighborId)
            if (nNode) {
              neighbors.push({ ...nNode, hop: h + 1, edgeType: edge.edgeType, direction })
              paths.push({ from: curr, to: neighborId, relationship: edge.edgeType, weight: edge.weight })
            }
          }
        }
      }
      currentLevel = nextLevel
      if (currentLevel.length === 0) break
    }

    return {
      root: this.nodes.get(targetId),
      totalNeighbors: neighbors.length,
      neighbors,
      paths,
    }
  }

  detectConflicts(subject, predicate, object) {
    const conflicts = []
    const sId = String(subject)
    const pred = String(predicate).toLowerCase()
    const obj = String(object)

    for (const edge of this.edges) {
      if (edge.source === sId && edge.edgeType.toLowerCase() === pred) {
        if (edge.target !== obj) {
          conflicts.push({
            existing: { source: edge.source, relationship: edge.edgeType, target: edge.target },
            incoming: { source: sId, relationship: pred, target: obj },
            type: 'MUTUALLY_EXCLUSIVE_OR_DIVERGENT',
          })
        }
      }
    }
    return conflicts
  }

  stateAt(isoTimestamp) {
    const targetTime = new Date(isoTimestamp).getTime()
    const snapshotNodes = new Map()
    const snapshotEdges = []

    for (const item of this.history) {
      if (new Date(item.timestamp).getTime() <= targetTime) {
        if (item.action === 'add_node') {
          snapshotNodes.set(item.node.id, item.node)
        } else if (item.action === 'add_edge') {
          snapshotEdges.push(item.edge)
        }
      }
    }

    return {
      timestamp: isoTimestamp,
      nodeCount: snapshotNodes.size,
      edgeCount: snapshotEdges.length,
      nodes: Array.from(snapshotNodes.values()),
      edges: snapshotEdges,
    }
  }
}

class DecisionManager {
  constructor(contextGraph) {
    this.graph = contextGraph || new ContextGraph()
    this.decisions = new Map()
    this.causalEdges = []
  }

  recordDecision({ category = 'general', scenario = '', reasoning = '', outcome = '', confidence = 1.0, metadata = {} }) {
    const id = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const decision = {
      id,
      category: String(category),
      scenario: String(scenario),
      reasoning: String(reasoning),
      outcome: String(outcome),
      confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 1.0,
      metadata: { ...metadata },
      createdAt: new Date().toISOString(),
    }

    this.decisions.set(id, decision)
    // Add to context graph
    this.graph.addNode(id, 'Decision', {
      ...decision,
      name: `${category}: ${outcome}`,
    })

    return decision
  }

  addCausalRelationship(sourceId, targetId, relationshipType = 'CAUSED', metadata = {}) {
    const sId = String(sourceId)
    const tId = String(targetId)
    const validTypes = ['CAUSED', 'INFLUENCED', 'PRECEDENT_FOR']
    const relType = validTypes.includes(String(relationshipType).toUpperCase())
      ? String(relationshipType).toUpperCase()
      : 'INFLUENCED'

    const edge = {
      id: `causal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceId: sId,
      targetId: tId,
      relationshipType: relType,
      metadata: { ...metadata },
      createdAt: new Date().toISOString(),
    }

    this.causalEdges.push(edge)
    this.graph.addEdge(sId, tId, relType, metadata)
    return edge
  }

  traceDecisionChain(decisionId) {
    const targetId = String(decisionId)
    const decision = this.decisions.get(targetId)
    if (!decision) return { error: `Decision ${targetId} not found` }

    // Trace upstream ancestry (what caused/influenced this)
    const upstream = []
    const queueUp = [targetId]
    const visitedUp = new Set([targetId])

    while (queueUp.length > 0) {
      const curr = queueUp.shift()
      for (const edge of this.causalEdges) {
        if (edge.targetId === curr && !visitedUp.has(edge.sourceId)) {
          visitedUp.add(edge.sourceId)
          queueUp.push(edge.sourceId)
          const srcDec = this.decisions.get(edge.sourceId)
          if (srcDec) {
            upstream.push({
              decision: srcDec,
              relationship: edge.relationshipType,
              affectedTarget: curr,
            })
          }
        }
      }
    }

    // Trace downstream impact (what this decision caused/influenced)
    const downstream = []
    const queueDown = [targetId]
    const visitedDown = new Set([targetId])

    while (queueDown.length > 0) {
      const curr = queueDown.shift()
      for (const edge of this.causalEdges) {
        if (edge.sourceId === curr && !visitedDown.has(edge.targetId)) {
          visitedDown.add(edge.targetId)
          queueDown.push(edge.targetId)
          const tgtDec = this.decisions.get(edge.targetId)
          if (tgtDec) {
            downstream.push({
              decision: tgtDec,
              relationship: edge.relationshipType,
              sourceCause: curr,
            })
          }
        }
      }
    }

    return {
      rootDecision: decision,
      upstreamAncestry: upstream,
      downstreamImpact: downstream,
      totalUpstream: upstream.length,
      totalDownstream: downstream.length,
    }
  }

  findSimilarDecisions(query, maxResults = 5) {
    const qTokens = String(query).toLowerCase().match(/\b\w+\b/g) || []
    if (qTokens.length === 0) return []

    const scored = []
    for (const dec of this.decisions.values()) {
      const corpus = `${dec.category} ${dec.scenario} ${dec.reasoning} ${dec.outcome}`.toLowerCase()
      let matches = 0
      for (const t of qTokens) {
        if (corpus.includes(t)) matches++
      }
      const score = matches / Math.max(1, qTokens.length)
      if (score > 0) {
        scored.push({
          decision: dec,
          similarityScore: parseFloat(score.toFixed(3)),
        })
      }
    }

    return scored
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, maxResults)
  }

  checkDecisionRules(decisionObj, rules = []) {
    const defaultRules = [
      {
        name: 'minimum_confidence_threshold',
        check: (d) => (d.confidence ?? 1.0) >= 0.7,
        failureMsg: 'Confidence score is below regulatory minimum of 0.70',
        severity: 'HIGH',
      },
      {
        name: 'mandatory_reasoning_explanation',
        check: (d) => Boolean(d.reasoning && d.reasoning.trim().length >= 10),
        failureMsg: 'Reasoning string is missing or shorter than 10 characters',
        severity: 'CRITICAL',
      },
      {
        name: 'category_specified',
        check: (d) => Boolean(d.category && d.category.trim().length > 0),
        failureMsg: 'Decision category must be explicitly defined',
        severity: 'MEDIUM',
      },
    ]

    const allRules = [...defaultRules, ...(Array.isArray(rules) ? rules : [])]
    const passed = []
    const violations = []

    for (const rule of allRules) {
      try {
        if (rule.check(decisionObj)) {
          passed.push(rule.name)
        } else {
          violations.push({
            rule: rule.name,
            severity: rule.severity || 'MEDIUM',
            message: rule.failureMsg || 'Rule violation detected',
          })
        }
      } catch (err) {
        violations.push({
          rule: rule.name,
          severity: 'HIGH',
          message: `Rule evaluation error: ${err.message}`,
        })
      }
    }

    return {
      isCompliant: violations.length === 0,
      passedRules: passed,
      violations,
      totalChecked: allRules.length,
    }
  }

  exportAuditTrail(format = 'json') {
    const decisionsList = Array.from(this.decisions.values())
    const causalList = this.causalEdges

    if (format === 'csv') {
      const headers = ['id', 'category', 'scenario', 'reasoning', 'outcome', 'confidence', 'createdAt']
      const rows = decisionsList.map(d => [
        `"${d.id}"`,
        `"${(d.category || '').replace(/"/g, '""')}"`,
        `"${(d.scenario || '').replace(/"/g, '""')}"`,
        `"${(d.reasoning || '').replace(/"/g, '""')}"`,
        `"${(d.outcome || '').replace(/"/g, '""')}"`,
        d.confidence,
        `"${d.createdAt}"`,
      ].join(','))
      return [headers.join(','), ...rows].join('\n')
    }

    if (format === 'prov-o' || format === 'turtle') {
      let ttl = `@prefix prov: <http://www.w3.org/ns/prov#> .\n`
      ttl += `@prefix sem: <http://semantica.ai/schema#> .\n`
      ttl += `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n`

      for (const d of decisionsList) {
        ttl += `sem:${d.id} a prov:Activity ;\n`
        ttl += `    sem:category "${d.category}" ;\n`
        ttl += `    sem:scenario "${d.scenario.replace(/"/g, '\\"')}" ;\n`
        ttl += `    sem:reasoning "${d.reasoning.replace(/"/g, '\\"')}" ;\n`
        ttl += `    sem:outcome "${d.outcome}" ;\n`
        ttl += `    sem:confidence "${d.confidence}"^^xsd:float ;\n`
        ttl += `    prov:endedAtTime "${d.createdAt}"^^xsd:dateTime .\n\n`
      }

      for (const c of causalList) {
        const provRel = c.relationshipType === 'CAUSED' ? 'prov:wasGeneratedBy' : 'prov:wasInformedBy'
        ttl += `sem:${c.targetId} ${provRel} sem:${c.sourceId} ;\n`
        ttl += `    sem:relationshipType "${c.relationshipType}" .\n\n`
      }
      return ttl
    }

    if (format === 'markdown') {
      let md = `# Semantica Decision Audit Trail\n\n`
      md += `Generated: ${new Date().toISOString()}\nTotal Decisions: ${decisionsList.length} | Causal Links: ${causalList.length}\n\n`
      md += `## Decisions\n\n`
      for (const d of decisionsList) {
        md += `### [${d.category}] ${d.outcome} (\`${d.id}\`)\n`
        md += `- **Scenario:** ${d.scenario}\n`
        md += `- **Reasoning:** ${d.reasoning}\n`
        md += `- **Confidence:** ${(d.confidence * 100).toFixed(1)}%\n`
        md += `- **Timestamp:** ${d.createdAt}\n\n`
      }
      if (causalList.length > 0) {
        md += `## Causal Relationships\n\n`
        for (const c of causalList) {
          md += `- \`${c.sourceId}\` ➔ **${c.relationshipType}** ➔ \`${c.targetId}\`\n`
        }
      }
      return md
    }

    return {
      exportedAt: new Date().toISOString(),
      standards: 'W3C PROV-O & Graph-Native Context',
      decisionsCount: decisionsList.length,
      causalLinksCount: causalList.length,
      decisions: decisionsList,
      causalRelationships: causalList,
    }
  }
}

// Global singletons for active session
export const globalContextGraph = new ContextGraph()
export const globalDecisionManager = new DecisionManager(globalContextGraph)

// ─── AI Tool Wrappers ───

export const semanticaRecordDecisionTool = {
  name: 'semantica_record_decision',
  description: 'Record an auditable, structured AI decision in the Context Graph with reasoning, category, confidence, and metadata for compliance and precedent search.',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Decision domain/category (e.g. "security_triage", "underwriting", "code_architecture", "vendor_selection")' },
      scenario: { type: 'string', description: 'Context scenario and inputs evaluating this decision' },
      reasoning: { type: 'string', description: 'Detailed rationale and policy justification for this decision' },
      outcome: { type: 'string', description: 'Chosen result/action (e.g. "approved", "escalate_to_human", "quarantine")' },
      confidence: { type: 'number', description: 'Confidence score from 0.0 to 1.0 (default: 1.0)' },
      metadata: { type: 'object', description: 'Optional key-value metadata to attach to the decision' },
      causeDecisionId: { type: 'string', description: 'Optional upstream decision ID that caused or influenced this decision' },
      relationshipType: { type: 'string', enum: ['CAUSED', 'INFLUENCED', 'PRECEDENT_FOR'], description: 'Causal link type to upstream decision' },
    },
    required: ['category', 'scenario', 'reasoning', 'outcome'],
  },
  async execute(args = {}) {
    const { category, scenario, reasoning, outcome, confidence, metadata, causeDecisionId, relationshipType } = args
    const decision = globalDecisionManager.recordDecision({
      category,
      scenario,
      reasoning,
      outcome,
      confidence: typeof confidence === 'number' ? confidence : 0.95,
      metadata,
    })

    let causalLink = null
    if (causeDecisionId) {
      causalLink = globalDecisionManager.addCausalRelationship(
        causeDecisionId,
        decision.id,
        relationshipType || 'CAUSED'
      )
    }

    const policyCheck = globalDecisionManager.checkDecisionRules(decision)

    return {
      status: 'recorded',
      decision,
      causalLink,
      policyCompliance: policyCheck,
      provenanceStandard: 'W3C PROV-O',
    }
  },
}

export const semanticaTraceCausalChainTool = {
  name: 'semantica_trace_causal_chain',
  description: 'Trace the causal ancestry (upstream causes) and impact tree (downstream effects) of a specific AI decision node.',
  parameters: {
    type: 'object',
    properties: {
      decisionId: { type: 'string', description: 'The unique decision ID to trace' },
    },
    required: ['decisionId'],
  },
  async execute({ decisionId }) {
    return globalDecisionManager.traceDecisionChain(decisionId)
  },
}

export const semanticaFindPrecedentsTool = {
  name: 'semantica_find_precedents',
  description: 'Find past similar AI decisions and precedents matching a query scenario or context.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text or scenario keywords to find matching past decisions' },
      maxResults: { type: 'number', description: 'Maximum number of precedents to return (default: 5)' },
    },
    required: ['query'],
  },
  async execute({ query, maxResults = 5 }) {
    const precedents = globalDecisionManager.findSimilarDecisions(query, maxResults)
    return {
      query,
      count: precedents.length,
      precedents,
    }
  },
}

export const semanticaContextGraphTool = {
  name: 'semantica_context_graph',
  description: 'Inspect, query neighbors, detect semantic conflicts, or extract entity-relation triplets in the Context Graph.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['get_neighbors', 'detect_conflicts', 'state_at', 'add_relationship'], description: 'Graph operation to perform' },
      nodeId: { type: 'string', description: 'Node ID for neighborhood traversal or inspection' },
      hops: { type: 'number', description: 'Traversal depth hops (1-3, default: 1)' },
      subject: { type: 'string', description: 'Subject node for conflict check or relationship creation' },
      predicate: { type: 'string', description: 'Predicate/relation type' },
      object: { type: 'string', description: 'Target object node' },
      timestamp: { type: 'string', description: 'ISO timestamp for point-in-time state travel' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const { action, nodeId, hops = 1, subject, predicate, object, timestamp } = args
    if (action === 'get_neighbors') {
      if (!nodeId) return { error: 'nodeId required for get_neighbors' }
      return globalContextGraph.getNeighbors(nodeId, hops)
    }
    if (action === 'detect_conflicts') {
      if (!subject || !predicate || !object) return { error: 'subject, predicate, and object required for detect_conflicts' }
      const conflicts = globalContextGraph.detectConflicts(subject, predicate, object)
      return { hasConflict: conflicts.length > 0, conflicts }
    }
    if (action === 'add_relationship') {
      if (!subject || !predicate || !object) return { error: 'subject, predicate, and object required for add_relationship' }
      const edge = globalContextGraph.addEdge(subject, object, predicate)
      return { status: 'created', edge }
    }
    if (action === 'state_at') {
      const time = timestamp || new Date().toISOString()
      return globalContextGraph.stateAt(time)
    }
    return { error: `Unknown action ${action}` }
  },
}

export const semanticaAuditExportTool = {
  name: 'semantica_audit_export',
  description: 'Export regulator-ready audit trails of AI decisions and knowledge graphs in JSON, CSV, Markdown, or W3C PROV-O RDF/Turtle format.',
  parameters: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['json', 'csv', 'prov-o', 'turtle', 'markdown'], description: 'Export format (default: json)' },
    },
  },
  async execute({ format = 'json' } = {}) {
    const result = globalDecisionManager.exportAuditTrail(format)
    return {
      format,
      data: result,
    }
  },
}
