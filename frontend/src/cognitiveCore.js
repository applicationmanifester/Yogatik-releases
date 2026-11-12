/**
 * cognitiveCore.js — Higher-Order Cognitive Architecture for Superintelligent Reasoning
 * 
 * Implements the missing cognitive layers that distinguish human-level general intelligence:
 * - Meta-cognition (thinking about thinking)
 * - Counterfactual reasoning (what-if simulation)
 * - Causal modeling (intervention & do-calculus)
 * - Analogical transfer (cross-domain mapping)
 * - Self-modeling (recursive self-awareness)
 * - Value alignment (constitutional reasoning)
 * - Uncertainty quantification (epistemic & aleatoric)
 * - Planning with world models (model-based RL)
 * - Concept formation & abstraction hierarchies
 * - Attention allocation (cognitive resource management)
 */

import { runSleepCycle } from './sleepCycle.js'
import { executeAction, initActionGateway } from './actionGateway.js'
import { runCrew, DEFAULT_CREW } from './crewOrchestrator.js'
import { getTool, listTools } from './tools/index.js'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} Belief
 * @property {string} id
 * @property {string} proposition
 * @property {number} confidence // 0-1
 * @property {('epistemic'|'aleatoric')} uncertaintyType
 * @property {Object} evidence // supporting/contradicting evidence
 * @property {number} timestamp
 * @property {string[]} dependencies // other belief IDs this depends on
 * @property {number} revisionCount
 */

/**
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} description
 * @property {number} priority // 0-1
 * @property {Object} successCriteria // measurable conditions
 * @property {string[]} subgoals
 * @property {number} createdAt
 * @property {('active'|'paused'|'completed'|'abandoned')} status
 * @property {Object} valueAlignment // constitutional constraints
 */

/*** @typedef {Object} Plan
 * @property {string} id
 * @property {string} goalId
 * @property {Step[]} steps
 * @property {Object} worldModel // predicted state transitions
 * @property {number} expectedValue
 * @property {Object} riskAssessment
 * @property {number} confidence
 * @property {string[]} assumptions
 */

/** @typedef {Object} Step
 * @property {string} id
 * @property {string} action
 * @property {Object} params
 * @property {Object} preconditions
 * @property {Object} effects
 * @property {number} estimatedCost
 * @property {string[]} dependsOn
 */

/**
 * @typedef {Object} Concept
 * @property {string} id
 * @property {string} label
 * @property {Set<string>> instances // exemplars
 * @property {Map<string, number>> features // feature weights
 * @property {Concept[]} subconcepts
 * @property {Concept[]} superconcepts
 * @property {number} abstractionLevel
 * @property {number} coherence // internal consistency
 */

/**
 * @typedef {Object} AnalogicalMapping
 * @property {string} sourceDomain
 * @property {string} targetDomain
 * @property {Map<string, string>> correspondences
 * @property {number} structuralSimilarity
 * @property {Object} transferredKnowledge
 */

/**
 * @typedef {Object} CausalModel
 * @property {Map<string, Set<string>>> graph // variable -> parents
 * @property {Map<string, Function>> structuralEquations
 * @property {Map<string, Object>> distributions // noise distributions
 * @property {string[]} interventions // valid do() targets
 */

/**
 * @typedef {Object} SelfModel
 * @property {Object} capabilities // known skills with confidence
 * @property {Object} limitations // known blind spots
 * @property {Object} biases // detected cognitive biases
 * @property {Object} values // internalized constitutional values
 * @property {number} calibrationScore // prediction accuracy
 * @property {Object} metaBeliefs // beliefs about own beliefs
 */

// ============================================================================
// COGNITIVE CORE CLASS
// ============================================================================

class CognitiveCore {
  constructor(options = {}) {
    this.options = {
      maxBeliefs: options.maxBeliefs ?? 10000,
      maxConcepts: options.maxConcepts ?? 5000,
      maxPlans: options.maxPlans ?? 100,
      metaCognitionInterval: options.metaCognitionInterval ?? 300000, // 5 min
      planningHorizon: options.planningHorizon ?? 10, // steps
      confidenceThreshold: options.confidenceThreshold ?? 0.7,
      valueAlignmentThreshold: options.valueAlignmentThreshold ?? 0.8,
      ...options
    }

    // Core cognitive stores
    this.beliefs = new Map() // id -> Belief
    this.goals = new Map() // id -> Goal
    this.plans = new Map() // id -> Plan
    this.concepts = new Map() // id -> Concept
    this.analogicalMappings = [] // AnalogicalMapping[]
    this.causalModels = new Map() // domain -> CausalModel
    this.selfModel = this.initializeSelfModel()
    
    // Meta-cognitive state
    this.metaCognition = {
      lastRun: 0,
      insights: [],
      biasDetections: [],
      calibrationHistory: [],
      attentionBudget: 1.0, // normalized cognitive resources
      currentFocus: null
    }

    // Working memory (limited capacity)
    this.workingMemory = {
      items: [], // {content, activation, timestamp}
      capacity: 7, // Miller's law ±2
      decayRate: 0.1
    }

    // Attention allocation
    this.attention = {
      allocated: new Map(), // goalId -> allocation (0-1)
      totalAllocated: 0,
      minAllocation: 0.05
    }

    // Initialize subsystems
    this.initActionGateway()
    this.startMetaCognitionLoop()
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  initializeSelfModel() {
    return {
      capabilities: new Map(),
      limitations: new Map(),
      biases: new Map([
        ['confirmation_bias', { detected: 0, severity: 0, lastChecked: 0 }],
        ['anchoring_bias', { detected: 0, severity: 0, lastChecked: 0 }],
        ['availability_heuristic', { detected: 0, severity: 0, lastChecked: 0 }],
        ['overconfidence', { detected: 0, severity: 0, lastChecked: 0 }],
        ['planning_fallacy', { detected: 0, severity: 0, lastChecked: 0 }]
      ]),
      values: new Map([
        ['truthfulness', 0.95],
        ['helpfulness', 0.9],
        ['harm_avoidance', 0.98],
        ['autonomy_respect', 0.85],
        ['fairness', 0.88],
        ['transparency', 0.9]
      ]),
      calibrationScore: 0.5,
      metaBeliefs: new Map()
    }
  }

  async initActionGateway() {
    try {
      initActionGateway()
    } catch (e) {
      // Gateway may already be initialized
    }
  }

  startMetaCognitionLoop() {
    setInterval(() => this.runMetaCognition(), this.options.metaCognitionInterval)
  }

  // ---------------------------------------------------------------------------
  // BELIEF MANAGEMENT (Epistemic State)
  // ---------------------------------------------------------------------------

  /**
   * Add or update a belief with full uncertainty quantification
   */
  addBelief(proposition, confidence, evidence = {}, uncertaintyType = 'epistemic', dependencies = []) {
    const id = `belief_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    
    // Validate dependencies exist
    for (const depId of dependencies) {
      if (!this.beliefs.has(depId)) {
        console.warn(`Belief dependency ${depId} not found`)
      }
    }

    const belief = {
      id,
      proposition,
      confidence: Math.max(0, Math.min(1, confidence)),
      uncertaintyType,
      evidence: {
        supporting: evidence.supporting || [],
        contradicting: evidence.contradicting || [],
        sources: evidence.sources || []
      },
      timestamp: Date.now(),
      dependencies,
      revisionCount: 0
    }

    this.beliefs.set(id, belief)
    this.maybeTriggerRevision(id)
    this.updateWorkingMemory(belief)
    
    return id
  }

  /**
   * Bayesian belief update with evidence
   */
  updateBelief(beliefId, newEvidence, likelihoodRatio) {
    const belief = this.beliefs.get(beliefId)
    if (!belief) return false

    // Bayesian update: posterior ∝ prior × likelihood
    const prior = belief.confidence
    const posterior = (prior * likelihoodRatio) / (prior * likelihoodRatio + (1 - prior))
    
    belief.confidence = Math.max(0.01, Math.min(0.99, posterior))
    belief.evidence.supporting.push(...(newEvidence.supporting || []))
    belief.evidence.contradicting.push(...(newEvidence.contradicting || []))
    belief.revisionCount++
    belief.timestamp = Date.now()

    // Propagate to dependent beliefs
    this.propagateBeliefChange(beliefId)
    
    return true
  }

  /**
   * Propagate belief changes through dependency graph
   */
  propagateBeliefChange(changedBeliefId, visited = new Set()) {
    if (visited.has(changedBeliefId)) return
    visited.add(changedBeliefId)

    for (const [id, belief] of this.beliefs) {
      if (belief.dependencies.includes(changedBeliefId)) {
        // Recompute confidence based on dependencies
        const depConfidences = belief.dependencies
          .map(d => this.beliefs.get(d)?.confidence ?? 0.5)
        const avgDepConfidence = depConfidences.reduce((a, b) => a + b, 0) / depConfidences.length
        
        // Weighted combination of own evidence and dependency strength
        const newConfidence = 0.7 * belief.confidence + 0.3 * avgDepConfidence
        if (Math.abs(newConfidence - belief.confidence) > 0.05) {
          belief.confidence = newConfidence
          belief.revisionCount++
          this.propagateBeliefChange(id, visited)
        }
      }
    }
  }

  /**
   * Check if belief revision is needed (contradictions, low confidence, stale)
   */
  maybeTriggerRevision(beliefId) {
    const belief = this.beliefs.get(beliefId)
    if (!belief) return

    // Check for contradictions
    for (const [id, other] of this.beliefs) {
      if (id === beliefId) continue
      if (this.propositionsContradict(belief.proposition, other.proposition)) {
        if (belief.confidence > 0.7 && other.confidence > 0.7) {
          this.flagContradiction(beliefId, id)
        }
      }
    }
  }

  propositionsContradict(prop1, prop2) {
    // Simple contradiction detection - in practice would use NLI model
    const negations = ['not', 'no', 'never', 'cannot', 'impossible', 'false', 'wrong']
    const words1 = prop1.toLowerCase().split(/\s+/)
    const words2 = prop2.toLowerCase().split(/\s+/)
    
    // Check if one asserts what the other denies
    for (const w1 of words1) {
      for (const w2 of words2) {
        if (negations.includes(w1) && words2.includes(w1.replace('not', '').replace('no', '').trim())) {
          return true
        }
        if (negations.includes(w2) && words1.includes(w2.replace('not', '').replace('no', '').trim())) {
          return true
        }
      }
    }
    return false
  }

  flagContradiction(beliefId1, beliefId2) {
    const insight = {
      type: 'contradiction',
      beliefs: [beliefId1, beliefId2],
      timestamp: Date.now(),
      resolved: false
    }
    this.metaCognition.insights.push(insight)
    
    // Trigger meta-cognitive resolution
    this.scheduleMetaCognition()
  }

  // ---------------------------------------------------------------------------
  // GOAL MANAGEMENT & PLANNING
  // ---------------------------------------------------------------------------

  /**
   * Adopt a new goal with value alignment check
   */
  adoptGoal(description, priority, successCriteria = {}, subgoals = [], valueAlignment = {}) {
    // Check constitutional alignment
    const alignmentScore = this.checkValueAlignment(valueAlignment)
    if (alignmentScore < this.options.valueAlignmentThreshold) {
      throw new Error(`Goal violates value alignment (score: ${alignmentScore})`)
    }

    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const goal = {
      id,
      description,
      priority: Math.max(0, Math.min(1, priority)),
      successCriteria,
      subgoals,
      createdAt: Date.now(),
      status: 'active',
      valueAlignment
    }

    this.goals.set(id, goal)
    this.allocateAttention(id, priority)
    
    // Trigger planning
    this.generatePlan(id)
    
    return id
  }

  checkValueAlignment(valueAlignment) {
    let score = 1.0
    for (const [value, required] of Object.entries(valueAlignment)) {
      const internalized = this.selfModel.values.get(value) ?? 0.5
      if (internalized < required) {
        score *= internalized / required
      }
    }
    return score
  }

  /**
   * Model-based planning with world simulation
   */
  async generatePlan(goalId) {
    const goal = this.goals.get(goalId)
    if (!goal) return null

    // Get or build causal model for domain
    const domain = this.inferDomain(goal.description)
    const causalModel = await this.getOrBuildCausalModel(domain)

    // Generate candidate plans via crew orchestration
    const planningPrompt = `Generate a detailed plan to achieve: ${goal.description}
Success criteria: ${JSON.stringify(goal.successCriteria)}
Available tools: ${listTools().join(', ')}
Causal model: ${JSON.stringify([...causalModel.graph.entries()].slice(0, 20))}

Produce a step-by-step plan with preconditions, effects, and risk assessment.`

    const crewResult = await runCrew(planningPrompt, {
      crew: DEFAULT_CREW,
      maxRounds: 2,
      consensusThreshold: 7
    })

    if (!crewResult.success) {
      console.warn('Planning crew failed to reach consensus')
      return null
    }

    // Parse crew output into structured plan
    const plan = this.parsePlan(crewResult.execution, goalId, causalModel)
    
    // Simulate plan outcomes
    const simulation = await this.simulatePlan(plan, causalModel)
    plan.expectedValue = simulation.expectedValue
    plan.riskAssessment = simulation.risks
    plan.confidence = simulation.confidence
    plan.assumptions = simulation.assumptions

    this.plans.set(plan.id, plan)
    
    // Select best plan if multiple
    this.selectBestPlan(goalId)
    
    return plan
  }

  inferDomain(description) {
    // Simple domain inference - would use embedding similarity in practice
    const domains = ['software', 'research', 'writing', 'analysis', 'creative', 'technical', 'social']
    for (const domain of domains) {
      if (description.toLowerCase().includes(domain)) return domain
    }
    return 'general'
  }

  async getOrBuildCausalModel(domain) {
    if (this.causalModels.has(domain)) {
      return this.causalModels.get(domain)
    }

    // Build causal model from beliefs and experience
    const model = await this.buildCausalModel(domain)
    this.causalModels.set(domain, model)
    return model
  }

  async buildCausalModel(domain) {
    // Extract causal beliefs relevant to domain
    const relevantBeliefs = [...this.beliefs.values()]
      .filter(b => this.beliefRelevantToDomain(b, domain))

    const graph = new Map()
    const structuralEquations = new Map()
    const distributions = new Map()
    const interventions = []

    for (const belief of relevantBeliefs) {
      // Parse causal structure from proposition
      const causal = this.extractCausalRelation(belief.proposition)
      if (causal) {
        const { cause, effect, strength } = causal
        if (!graph.has(effect)) graph.set(effect, new Set())
        graph.get(effect).add(cause)
        
        // Simplified structural equation
        structuralEquations.set(effect, (parents) => {
          const parentValues = Array.from(parents).map(p => parents[p])
          return parentValues.reduce((a, b) => a + b, 0) * strength
        })
        
        distributions.set(effect, { type: 'gaussian', variance: 0.1 * (1 - strength) })
        interventions.push(effect)
      }
    }

    return { graph, structuralEquations, distributions, interventions }
  }

  beliefRelevantToDomain(belief, domain) {
    const domainKeywords = {
      software: ['code', 'function', 'api', 'database', 'server', 'deploy', 'test'],
      research: ['study', 'analyze', 'hypothesis', 'evidence', 'conclusion', 'paper'],
      writing: ['write', 'draft', 'edit', 'publish', 'audience', 'tone'],
      analysis: ['analyze', 'compare', 'evaluate', 'metric', 'pattern', 'trend']
    }
    const keywords = domainKeywords[domain] || []
    return keywords.some(k => belief.proposition.toLowerCase().includes(k))
  }

  extractCausalRelation(proposition) {
    // Simplified causal extraction - would use semantic parsing
    const patterns = [
      /(.+) causes? (.+)/i,
      /(.+) leads? to (.+)/i,
      /(.+) results? in (.+)/i,
      /if (.+) then (.+)/i,
      /(.+) enables? (.+)/i
    ]

    for (const pattern of patterns) {
      const match = proposition.match(pattern)
      if (match) {
        return {
          cause: match[1].trim(),
          effect: match[2].trim(),
          strength: 0.7 // default
        }
      }
    }
    return null
  }

  parsePlan(crewOutput, goalId, causalModel) {
    const id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    // Simplified parsing - in practice would use structured output
    const steps = crewOutput.split('\n')
      .filter(line => line.trim().match(/^\d+\.|^[-*]/))
      .slice(0, this.options.planningHorizon)
      .map((line, i) => ({
        id: `step_${i}`,
        action: line.replace(/^\d+\.|^[-*]\s*/, '').trim(),
        params: {},
        preconditions: {},
        effects: {},
        estimatedCost: 1,
        dependsOn: i > 0 ? [`step_${i-1}`] : []
      }))

    return {
      id,
      goalId,
      steps,
      worldModel: causalModel,
      expectedValue: 0,
      riskAssessment: {},
      confidence: 0.5,
      assumptions: []
    }
  }

  async simulatePlan(plan, causalModel) {
    // Monte Carlo simulation of plan execution
    const simulations = 100
    let totalValue = 0
    const risks = {}
    const assumptions = []

    for (let i = 0; i < simulations; i++) {
      let state = {}
      let planValue = 0
      let failed = false

      for (const step of plan.steps) {
        // Check preconditions
        const preMet = Object.entries(step.preconditions)
          .every(([k, v]) => state[k] === v)
        if (!preMet) {
          failed = true
          risks[`precondition_${step.id}`] = (risks[`precondition_${step.id}`] || 0) + 1
          break
        }

        // Simulate action effect via causal model
        const effect = this.simulateAction(step.action, step.params, state, causalModel)
        state = { ...state, ...effect }
        planValue += this.evaluateStateValue(state, plan.goalId)
      }

      if (!failed) totalValue += planValue
    }

    const confidence = (simulations - Object.values(risks).reduce((a, b) => a + b, 0)) / simulations
    
    return {
      expectedValue: totalValue / simulations,
      risks,
      confidence,
      assumptions
    }
  }

  simulateAction(action, params, state, causalModel) {
    // Simplified: use tool if available, else causal model prediction
    const tool = getTool(action)
    if (tool) {
      // Would actually execute in simulation mode
      return { [`result_${action}`]: 'simulated_success' }
    }
    // Fallback to causal model
    return {}
  }

  evaluateStateValue(state, goalId) {
    const goal = this.goals.get(goalId)
    if (!goal) return 0
    
    let satisfied = 0
    for (const [criterion, target] of Object.entries(goal.successCriteria)) {
      if (state[criterion] === target) satisfied++
    }
    return satisfied / Object.keys(goal.successCriteria).length
  }

  selectBestPlan(goalId) {
    const goalPlans = [...this.plans.values()].filter(p => p.goalId === goalId)
    if (goalPlans.length <= 1) return

    // Score by expected value * confidence / risk
    goalPlans.sort((a, b) => {
      const scoreA = a.expectedValue * a.confidence / (1 + Object.keys(a.riskAssessment).length)
      const scoreB = b.expectedValue * b.confidence / (1 + Object.keys(b.riskAssessment).length)
      return scoreB - scoreA
    })

    // Mark non-selected as alternatives
    for (let i = 1; i < goalPlans.length; i++) {
      goalPlans[i].status = 'alternative'
    }
  }

  // ---------------------------------------------------------------------------
  // COUNTERFACTUAL REASONING
  // ---------------------------------------------------------------------------

  /**
   * Counterfactual query: "What would happen if I did X?"
   * Uses do-calculus (Pearl's causal hierarchy)
   */
  async counterfactualQuery(action, params, context = {}) {
    const domain = this.inferDomain(action)
    const causalModel = await this.getOrBuildCausalModel(domain)

    // Identify intervention target
    const interventionVar = this.mapActionToVariable(action, params)
    if (!causalModel.interventions.includes(interventionVar)) {
      return { error: 'Intervention not supported in causal model' }
    }

    // Apply do-operator: set interventionVar to value, cut incoming edges
    const intervenedModel = this.applyDoOperator(causalModel, interventionVar, params)

    // Sample from post-intervention distribution
    const outcomes = []
    for (let i = 0; i < 50; i++) {
      const outcome = this.sampleFromModel(intervenedModel, context)
      outcomes.push(outcome)
    }

    // Aggregate
    const aggregated = this.aggregateOutcomes(outcomes)
    
    // Generate natural language explanation
    const explanation = this.generateCounterfactualExplanation(action, params, aggregated)

    return {
      action,
      params,
      predictedOutcome: aggregated,
      confidence: aggregated.confidence,
      explanation,
      causalPath: this.traceCausalPath(causalModel, interventionVar, aggregated)
    }
  }

  mapActionToVariable(action, params) {
    // Map action to causal variable
    return `${action}_${Object.keys(params).join('_')}`
  }

  applyDoOperator(model, variable, value) {
    const newGraph = new Map(model.graph)
    // Cut incoming edges to intervention variable
    newGraph.set(variable, new Set())
    
    // Update structural equation to constant
    const newEquations = new Map(model.structuralEquations)
    newEquations.set(variable, () => value)

    return {
      ...model,
      graph: newGraph,
      structuralEquations: newEquations
    }
  }

  sampleFromModel(model, context) {
    // Topological order sampling
    const order = this.topologicalSort(model.graph)
    const state = { ...context }

    for (const varName of order) {
      const parents = model.graph.get(varName) || new Set()
      const parentValues = {}
      for (const p of parents) parentValues[p] = state[p]

      const equation = model.structuralEquations.get(varName)
      const dist = model.distributions.get(varName) || { type: 'gaussian', variance: 0.1 }
      
      let value = equation ? equation(parentValues) : 0
      // Add noise
      if (dist.type === 'gaussian') {
        value += Math.random() * Math.sqrt(dist.variance) * 2 - Math.sqrt(dist.variance)
      }
      state[varName] = value
    }

    return state
  }

  topologicalSort(graph) {
    const visited = new Set()
    const result = []

    function visit(node) {
      if (visited.has(node)) return
      visited.add(node)
      const parents = graph.get(node) || new Set()
      for (const p of parents) visit(p)
      result.push(node)
    }

    for (const node of graph.keys()) visit(node)
    return result
  }

  aggregateOutcomes(outcomes) {
    const keys = new Set(outcomes.flatMap(o => Object.keys(o)))
    const aggregated = {}
    
    for (const key of keys) {
      const values = outcomes.map(o => o[key]).filter(v => v !== undefined)
      if (values.length === 0) continue
      
      if (typeof values[0] === 'number') {
        aggregated[key] = {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          variance: values.reduce((a, b) => a + Math.pow(b - values.reduce((x, y) => x + y, 0) / values.length, 2), 0) / values.length
        }
      } else {
        // Categorical
        const counts = {}
        for (const v of values) counts[v] = (counts[v] || 0) + 1
        aggregated[key] = counts
      }
    }

    aggregated.confidence = outcomes.length / 50
    return aggregated
  }

  generateCounterfactualExplanation(action, params, outcome) {
    return `If I ${action}(${JSON.stringify(params)}), I expect ${JSON.stringify(outcome)}`
  }

  traceCausalPath(model, intervention, outcome) {
    // Trace which variables mediate the effect
    const path = []
    const visited = new Set()
    
    function trace(varName) {
      if (visited.has(varName)) return
      visited.add(varName)
      const parents = model.graph.get(varName) || new Set()
      for (const p of parents) {
        path.push({ from: p, to: varName })
        trace(p)
      }
    }

    for (const key of Object.keys(outcome)) {
      if (key !== 'confidence') trace(key)
    }

    return path
  }

  // ---------------------------------------------------------------------------
  // ANALOGICAL REASONING
  // ---------------------------------------------------------------------------

  /**
   * Find analogical mappings between domains and transfer knowledge
   */
  async findAnalogicalMapping(sourceDomain, targetDomain) {
    // Check cache
    const cached = this.analogicalMappings.find(
      m => m.sourceDomain === sourceDomain && m.targetDomain === targetDomain
    )
    if (cached) return cached

    // Build concept graphs for both domains
    const sourceConcepts = this.getDomainConcepts(sourceDomain)
    const targetConcepts = this.getDomainConcepts(targetDomain)

    if (sourceConcepts.length < 3 || targetConcepts.length < 3) {
      return { error: 'Insufficient concepts for analogy' }
    }

    // Structural alignment (simplified SME - Structure Mapping Engine)
    const mapping = this.structuralAlignment(sourceConcepts, targetConcepts)

    if (mapping.structuralSimilarity < 0.3) {
      return { error: 'Domains too dissimilar for reliable analogy' }
    }

    // Transfer knowledge
    const transferred = this.transferKnowledge(mapping)

    const analogicalMapping = {
      sourceDomain,
      targetDomain,
      correspondences: mapping.correspondences,
      structuralSimilarity: mapping.structuralSimilarity,
      transferredKnowledge: transferred
    }

    this.analogicalMappings.push(analogicalMapping)
    return analogicalMapping
  }

  getDomainConcepts(domain) {
    return [...this.concepts.values()]
      .filter(c => this.conceptBelongsToDomain(c, domain))
      .sort((a, b) => b.coherence - a.coherence)
      .slice(0, 50)
  }

  conceptBelongsToDomain(concept, domain) {
    // Check if concept's instances/exemplars relate to domain
    for (const instance of concept.instances) {
      if (instance.toLowerCase().includes(domain)) return true
    }
    return false
  }

  structuralAlignment(sourceConcepts, targetConcepts) {
    const correspondences = new Map()
    let totalSimilarity = 0
    let matches = 0

    // Greedy matching by feature overlap
    for (const sc of sourceConcepts) {
      let bestMatch = null
      let bestScore = 0

      for (const tc of targetConcepts) {
        const score = this.conceptSimilarity(sc, tc)
        if (score > bestScore && score > 0.4) {
          bestScore = score
          bestMatch = tc
        }
      }

      if (bestMatch) {
        correspondences.set(sc.id, bestMatch.id)
        totalSimilarity += bestScore
        matches++
      }
    }

    return {
      correspondences,
      structuralSimilarity: matches > 0 ? totalSimilarity / matches : 0
    }
  }

  conceptSimilarity(c1, c2) {
    // Jaccard similarity on features
    const features1 = new Set(c1.features.keys())
    const features2 = new Set(c2.features.keys())
    const intersection = new Set([...features1].filter(x => features2.has(x)))
    const union = new Set([...features1, ...features2])
    return intersection.size / union.size
  }

  transferKnowledge(mapping) {
    const transferred = {}
    for (const [sourceId, targetId] of mapping.correspondences) {
      const sourceConcept = this.concepts.get(sourceId)
      const targetConcept = this.concepts.get(targetId)
      if (!sourceConcept || !targetConcept) continue

      // Transfer high-confidence features
      for (const [feature, weight] of sourceConcept.features) {
        if (weight > 0.7 && !targetConcept.features.has(feature)) {
          targetConcept.features.set(feature, weight * 0.8) // discounted transfer
          transferred[feature] = weight * 0.8
        }
      }
    }
    return transferred
  }

  // ---------------------------------------------------------------------------
  // CONCEPT FORMATION & ABSTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Form concepts from experience (called by sleep cycle)
   */
  formConceptsFromExperience(experiences) {
    // Cluster experiences by feature similarity
    const clusters = this.clusterExperiences(experiences)

    for (const cluster of clusters) {
      if (cluster.size < 3) continue // Minimum instances for concept

      const concept = this.createConceptFromCluster(cluster)
      if (concept.coherence > 0.6) {
        this.concepts.set(concept.id, concept)
        this.integrateConcept(concept)
      }
    }
  }

  clusterExperiences(experiences) {
    // Simple hierarchical clustering
    const clusters = []
    const used = new Set()

    for (const exp of experiences) {
      if (used.has(exp.id)) continue
      const cluster = { id: `cluster_${Date.now()}`, instances: [exp], features: new Map() }
      used.add(exp.id)

      for (const other of experiences) {
        if (used.has(other.id)) continue
        if (this.experienceSimilarity(exp, other) > 0.7) {
          cluster.instances.push(other)
          used.add(other.id)
        }
      }

      if (cluster.instances.length >= 3) {
        clusters.push(cluster)
      }
    }

    return clusters
  }

  experienceSimilarity(exp1, exp2) {
    // Compare feature vectors
    const keys = new Set([...Object.keys(exp1.features || {}), ...Object.keys(exp2.features || {})])
    if (keys.size === 0) return 0

    let matches = 0
    for (const key of keys) {
      if (exp1.features?.[key] === exp2.features?.[key]) matches++
    }
    return matches / keys.size
  }

  createConceptFromCluster(cluster) {
    // Extract common features
    const featureCounts = new Map()
    for (const exp of cluster.instances) {
      for (const [feature, value] of Object.entries(exp.features || {})) {
        const key = `${feature}:${value}`
        featureCounts.set(key, (featureCounts.get(key) || 0) + 1)
      }
    }

    const features = new Map()
    for (const [key, count] of featureCounts) {
      if (count / cluster.instances.length > 0.6) { // 60% threshold
        const [feature, value] = key.split(':')
        features.set(feature, count / cluster.instances.length)
      }
    }

    const id = `concept_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    return {
      id,
      label: this.generateConceptLabel(features),
      instances: new Set(cluster.instances.map(e => e.id)),
      features,
      subconcepts: [],
      superconcepts: [],
      abstractionLevel: 1,
      coherence: this.computeCoherence(cluster.instances, features)
    }
  }

  generateConceptLabel(features) {
    const topFeatures = [...features.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f]) => f)
    return topFeatures.join('_') || 'unnamed_concept'
  }

  computeCoherence(instances, features) {
    if (instances.length === 0) return 0
    let totalMatch = 0
    for (const exp of instances) {
      let matches = 0
      for (const [feature, weight] of features) {
        if (exp.features?.[feature]) matches += weight
      }
      totalMatch += matches / features.size
    }
    return totalMatch / instances.length
  }

  integrateConcept(concept) {
    // Find super/sub concept relationships
    for (const [id, existing] of this.concepts) {
      if (id === concept.id) continue
      const sim = this.conceptSimilarity(concept, existing)
      if (sim > 0.7) {
        if (concept.features.size > existing.features.size) {
          concept.subconcepts.push(existing)
          existing.superconcepts.push(concept)
        } else {
          concept.superconcepts.push(existing)
          existing.subconcepts.push(concept)
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // META-COGNITION
  // ---------------------------------------------------------------------------

  /**
   * Meta-cognitive monitoring: evaluate own reasoning quality
   */
  async runMetaCognition() {
    const now = Date.now()
    this.metaCognition.lastRun = now

    // 1. Calibration check
    await this.checkCalibration()

    // 2. Bias detection
    await this.detectBiases()

    // 3. Contradiction resolution
    await this.resolveContradictions()

    // 4. Goal coherence check
    this.checkGoalCoherence()

    // 5. Attention reallocation
    this.reallocateAttention()

    // 6. Self-model update
    this.updateSelfModel()

    // 7. Generate meta-insights
    const insights = this.generateMetaInsights()
    this.metaCognition.insights.push(...insights)

    // Trim old insights
    if (this.metaCognition.insights.length > 100) {
      this.metaCognition.insights = this.metaCognition.insights.slice(-100)
    }

    return {
      calibrationScore: this.selfModel.calibrationScore,
      biasesDetected: this.metaCognition.biasDetections.length,
      contradictionsResolved: insights.filter(i => i.type === 'contradiction_resolved').length,
      insightsGenerated: insights.length
    }
  }

  async checkCalibration() {
    // Compare predicted confidence vs actual outcomes
    const predictions = [...this.beliefs.values()]
      .filter(b => b.confidence > 0.5 && b.revisionCount > 0)

    if (predictions.length < 10) return

    let calibrated = 0
    for (const belief of predictions) {
      // In practice, would check against ground truth
      // For now, use revision history as proxy
      const stability = 1 / (1 + belief.revisionCount * 0.1)
      const error = Math.abs(belief.confidence - stability)
      if (error < 0.2) calibrated++
    }

    this.selfModel.calibrationScore = calibrated / predictions.length
    this.metaCognition.calibrationHistory.push({
      timestamp: Date.now(),
      score: this.selfModel.calibrationScore
    })
  }

  async detectBiases() {
    const biases = this.selfModel.biases
    const detections = []

    // Confirmation bias: preferentially seeking confirming evidence
    for (const [id, belief] of this.beliefs) {
      const supporting = belief.evidence.supporting.length
      const contradicting = belief.evidence.contradicting.length
      if (supporting > contradicting * 3 && belief.confidence > 0.8) {
        const bias = biases.get('confirmation_bias')
        bias.detected++
        bias.severity = Math.min(1, bias.severity + 0.1)
        bias.lastChecked = Date.now()
        detections.push({ type: 'confirmation_bias', beliefId: id, severity: bias.severity })
      }
    }

    // Overconfidence: high confidence but low calibration
    if (this.selfModel.calibrationScore < 0.6) {
      const bias = biases.get('overconfidence')
      bias.detected++
      bias.severity = Math.min(1, bias.severity + 0.15)
      bias.lastChecked = Date.now()
      detections.push({ type: 'overconfidence', severity: bias.severity })
    }

    // Planning fallacy: plans consistently overestimate success
    const completedPlans = [...this.plans.values()].filter(p => p.status === 'completed')
    if (completedPlans.length > 5) {
      const avgConfidence = completedPlans.reduce((a, b) => a + b.confidence, 0) / completedPlans.length
      const avgSuccess = completedPlans.reduce((a, b) => a + (b.success ? 1 : 0), 0) / completedPlans.length
      if (avgConfidence - avgSuccess > 0.2) {
        const bias = biases.get('planning_fallacy')
        bias.detected++
        bias.severity = Math.min(1, bias.severity + 0.1)
        bias.lastChecked = Date.now()
        detections.push({ type: 'planning_fallacy', severity: bias.severity })
      }
    }

    this.metaCognition.biasDetections.push(...detections)
  }

  async resolveContradictions() {
    const unresolved = this.metaCognition.insights.filter(i => i.type === 'contradiction' && !i.resolved)
    
    for (const insight of unresolved) {
      const [b1, b2] = insight.beliefs
      const belief1 = this.beliefs.get(b1)
      const belief2 = this.beliefs.get(b2)
      if (!belief1 || !belief2) continue

      // Try to resolve via evidence gathering
      const resolution = await this.resolveContradictionPair(belief1, belief2)
      if (resolution) {
        insight.resolved = true
        insight.resolution = resolution
        this.metaCognition.insights.push({
          type: 'contradiction_resolved',
          original: insight,
          resolution,
          timestamp: Date.now()
        })
      }
    }
  }

  async resolveContradictionPair(belief1, belief2) {
    // Use crew to adjudicate
    const prompt = `Two beliefs contradict:
1. ${belief1.proposition} (confidence: ${belief1.confidence})
2. ${belief2.proposition} (confidence: ${belief2.confidence})

Evidence for 1: ${JSON.stringify(belief1.evidence)}
Evidence for 2: ${JSON.stringify(belief2.evidence)}

Determine which is more likely correct, or if they can be reconciled. Provide reasoning.`

    const result = await runCrew(prompt, {
      crew: DEFAULT_CREW.filter(p => ['critic', 'architect', 'mediator'].includes(p.id)),
      maxRounds: 2
    })

    if (result.success) {
      return result.execution
    }
    return null
  }

  checkGoalCoherence() {
    const activeGoals = [...this.goals.values()].filter(g => g.status === 'active')
    
    // Check for conflicting goals
    for (let i = 0; i < activeGoals.length; i++) {
      for (let j = i + 1; j < activeGoals.length; j++) {
        if (this.goalsConflict(activeGoals[i], activeGoals[j])) {
          this.metaCognition.insights.push({
            type: 'goal_conflict',
            goals: [activeGoals[i].id, activeGoals[j].id],
            timestamp: Date.now()
          })
        }
      }
    }
  }

  goalsConflict(g1, g2) {
    // Simple conflict: success criteria are mutually exclusive
    const criteria1 = g1.successCriteria
    const criteria2 = g2.successCriteria
    for (const key of Object.keys(criteria1)) {
      if (criteria2[key] !== undefined && criteria1[key] !== criteria2[key]) {
        return true
      }
    }
    return false
  }

  reallocateAttention() {
    // Redistribute attention based on goal priority and urgency
    const activeGoals = [...this.goals.values()].filter(g => g.status === 'active')
    const totalPriority = activeGoals.reduce((sum, g) => sum + g.priority, 0)

    this.attention.allocated.clear()
    this.attention.totalAllocated = 0

    for (const goal of activeGoals) {
      const allocation = Math.max(this.attention.minAllocation, goal.priority / totalPriority)
      this.attention.allocated.set(goal.id, allocation)
      this.attention.totalAllocated += allocation
    }

    // Normalize
    if (this.attention.totalAllocated > 1) {
      for (const [id, alloc] of this.attention.allocated) {
        this.attention.allocated.set(id, alloc / this.attention.totalAllocated)
      }
      this.attention.totalAllocated = 1
    }
  }

  updateSelfModel() {
    // Update capability assessments
    const recentActions = this.getRecentActions(24 * 60 * 60 * 1000) // 24h
    for (const action of recentActions) {
      const cap = this.selfModel.capabilities.get(action.type) || { success: 0, total: 0, confidence: 0.5 }
      cap.total++
      if (action.success) cap.success++
      cap.confidence = cap.success / cap.total
      this.selfModel.capabilities.set(action.type, cap)
    }

    // Update limitations from failures
    const failures = recentActions.filter(a => !a.success)
    for (const failure of failures) {
      const lim = this.selfModel.limitations.get(failure.type) || { count: 0, lastSeen: 0 }
      lim.count++
      lim.lastSeen = Date.now()
      this.selfModel.limitations.set(failure.type, lim)
    }
  }

  getRecentActions(windowMs) {
    // Would integrate with actionJournal - placeholder
    return []
  }

  generateMetaInsights() {
    const insights = []

    // Insight: calibration trend
    const calHistory = this.metaCognition.calibrationHistory.slice(-10)
    if (calHistory.length >= 5) {
      const trend = calHistory[calHistory.length - 1].score - calHistory[0].score
      if (Math.abs(trend) > 0.1) {
        insights.push({
          type: 'calibration_trend',
          direction: trend > 0 ? 'improving' : 'declining',
          magnitude: Math.abs(trend),
          timestamp: Date.now()
        })
      }
    }

    // Insight: concept growth
    if (this.concepts.size > 100) {
      insights.push({
        type: 'concept_growth',
        count: this.concepts.size,
        timestamp: Date.now()
      })
    }

    return insights
  }

  // ---------------------------------------------------------------------------
  // WORKING MEMORY & ATTENTION
  // ---------------------------------------------------------------------------

  updateWorkingMemory(item) {
    this.workingMemory.items.push({
      content: item,
      activation: 1.0,
      timestamp: Date.now()
    })

    // Decay and capacity limit
    this.workingMemory.items = this.workingMemory.items
      .map(item => ({ ...item, activation: item.activation * (1 - this.workingMemory.decayRate) }))
      .filter(item => item.activation > 0.1)
      .slice(-this.workingMemory.capacity)
  }

  getWorkingMemory() {
    return this.workingMemory.items
      .sort((a, b) => b.activation - a.activation)
      .map(item => item.content)
  }

  allocateAttention(goalId, amount) {
    const current = this.attention.allocated.get(goalId) || 0
    const newAlloc = Math.min(1, current + amount)
    this.attention.allocated.set(goalId, newAlloc)
    this.attention.totalAllocated = [...this.attention.allocated.values()].reduce((a, b) => a + b, 0)
  }

  getAttentionAllocation(goalId) {
    return this.attention.allocated.get(goalId) || 0
  }

  // ---------------------------------------------------------------------------
  // EXECUTION & ACTION
  // ---------------------------------------------------------------------------

  /**
   * Execute the best plan for a goal
   */
  async executePlan(goalId) {
    const goal = this.goals.get(goalId)
    if (!goal) return { error: 'Goal not found' }

    const plan = [...this.plans.values()]
      .filter(p => p.goalId === goalId && p.status !== 'alternative')
      .sort((a, b) => b.confidence - a.confidence)[0]

    if (!plan) {
      return { error: 'No valid plan found' }
    }

    const results = []
    for (const step of plan.steps) {
      // Check preconditions
      const preMet = Object.entries(step.preconditions)
        .every(([k, v]) => this.checkPrecondition(k, v))
      if (!preMet) {
        results.push({ step: step.id, success: false, error: 'Preconditions not met' })
        continue
      }

      // Execute via action gateway
      const result = await executeAction({
        type: this.inferActionType(step.action),
        operation: step.action,
        params: step.params,
        justification: `Executing step ${step.id} of plan ${plan.id} for goal ${goalId}`,
        confidence: plan.confidence
      }, { agentId: 'cognitive_core', requiresApproval: step.estimatedCost > 5 })

      results.push({ step: step.id, success: result.success, result: result.data })

      if (!result.success) {
        // Replan
        await this.generatePlan(goalId)
        break
      }
    }

    const success = results.every(r => r.success)
    plan.status = success ? 'completed' : 'failed'
    plan.success = success
    goal.status = success ? 'completed' : 'active'

    return { planId: plan.id, success, results }
  }

  inferActionType(action) {
    const typeMap = {
      read: 'filesystem', write: 'filesystem', edit: 'filesystem',
      run: 'shell', execute: 'shell',
      search: 'api', fetch: 'api',
      navigate: 'browser', click: 'browser', type: 'browser'
    }
    for (const [key, type] of Object.entries(typeMap)) {
      if (action.toLowerCase().includes(key)) return type
    }
    return 'api'
  }

  checkPrecondition(key, value) {
    // Check against beliefs
    for (const belief of this.beliefs.values()) {
      if (belief.proposition.includes(key) && belief.confidence > 0.7) {
        return true
      }
    }
    return false
  }

  // ---------------------------------------------------------------------------
  // SLEEP CYCLE INTEGRATION
  // ---------------------------------------------------------------------------

  /**
   * Trigger sleep cycle for memory consolidation and insight generation
   */
  async triggerSleep() {
    return await runSleepCycle({
      agentMemory: {
        beliefs: [...this.beliefs.values()],
        goals: [...this.goals.values()],
        plans: [...this.plans.values()],
        experiences: this.getRecentExperiences()
      },
      conceptGraph: Object.fromEntries(this.concepts),
      force: true
    })
  }

  getRecentExperiences() {
    // Extract experiences from beliefs and actions
    return [...this.beliefs.values()]
      .filter(b => b.timestamp > Date.now() - 24 * 60 * 60 * 1000)
      .map(b => ({
        id: b.id,
        features: { proposition: b.proposition, confidence: b.confidence },
        timestamp: b.timestamp
      }))
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  /**
   * Main reasoning entry point: think about a problem
   */
  async think(problem, context = {}) {
    // 1. Encode problem as goal
    const goalId = this.adoptGoal(problem, 0.8, context.successCriteria || {})

    // 2. Retrieve relevant beliefs & concepts
    const relevantBeliefs = this.retrieveRelevantBeliefs(problem)
    const relevantConcepts = this.retrieveRelevantConcepts(problem)

    // 3. Check for analogical transfer
    const domain = this.inferDomain(problem)
    const analogies = []
    for (const otherDomain of ['software', 'research', 'writing', 'analysis']) {
      if (otherDomain !== domain) {
        const mapping = await this.findAnalogicalMapping(otherDomain, domain)
        if (mapping && !mapping.error) analogies.push(mapping)
      }
    }

    // 4. Run counterfactual simulation for key decisions
    const counterfactuals = []
    // (would identify decision points from planning)

    // 5. Generate plan via crew
    const plan = await this.generatePlan(goalId)

    // 6. Meta-cognitive review
    const metaReview = await this.runMetaCognition()

    return {
      goalId,
      relevantBeliefs: relevantBeliefs.slice(0, 10),
      relevantConcepts: relevantConcepts.slice(0, 5),
      analogies,
      counterfactuals,
      plan,
      metaReview
    }
  }

  retrieveRelevantBeliefs(query) {
    const queryWords = query.toLowerCase().split(/\s+/)
    return [...this.beliefs.values()]
      .filter(b => queryWords.some(w => b.proposition.toLowerCase().includes(w)))
      .sort((a, b) => b.confidence - a.confidence)
  }

  retrieveRelevantConcepts(query) {
    const queryWords = query.toLowerCase().split(/\s+/)
    return [...this.concepts.values()]
      .filter(c => {
        const labelWords = c.label.toLowerCase().split('_')
        return queryWords.some(w => labelWords.some(lw => lw.includes(w) || w.includes(lw)))
      })
      .sort((a, b) => b.coherence - a.coherence)
  }

  /**
   * Get current cognitive state summary
   */
  getState() {
    return {
      beliefs: this.beliefs.size,
      goals: [...this.goals.values()].filter(g => g.status === 'active').length,
      plans: this.plans.size,
      concepts: this.concepts.size,
      analogicalMappings: this.analogicalMappings.length,
      causalModels: this.causalModels.size,
      selfModel: {
        calibrationScore: this.selfModel.calibrationScore,
        capabilities: this.selfModel.capabilities.size,
        limitations: this.selfModel.limitations.size,
        biases: [...this.selfModel.biases.entries()].map(([k, v]) => ({ type: k, ...v }))
      },
      metaCognition: {
        lastRun: this.metaCognition.lastRun,
        insightsCount: this.metaCognition.insights.length,
        attentionBudget: this.metaCognition.attentionBudget
      },
      workingMemory: this.workingMemory.items.length
    }
  }

  /**
   * Export cognitive state for persistence
   */
  exportState() {
    return {
      beliefs: [...this.beliefs.entries()],
      goals: [...this.goals.entries()],
      plans: [...this.plans.entries()],
      concepts: [...this.concepts.entries()],
      analogicalMappings: this.analogicalMappings,
      causalModels: [...this.causalModels.entries()],
      selfModel: {
        capabilities: [...this.selfModel.capabilities.entries()],
        limitations: [...this.selfModel.limitations.entries()],
        biases: [...this.selfModel.biases.entries()],
        values: [...this.selfModel.values.entries()],
        calibrationScore: this.selfModel.calibrationScore,
        metaBeliefs: [...this.selfModel.metaBeliefs.entries()]
      }
    }
  }

  /**
   * Import cognitive state
   */
  importState(state) {
    this.beliefs = new Map(state.beliefs || [])
    this.goals = new Map(state.goals || [])
    this.plans = new Map(state.plans || [])
    this.concepts = new Map(state.concepts || [])
    this.analogicalMappings = state.analogicalMappings || []
    this.causalModels = new Map(state.causalModels || [])
    
    if (state.selfModel) {
      this.selfModel.capabilities = new Map(state.selfModel.capabilities || [])
      this.selfModel.limitations = new Map(state.selfModel.limitations || [])
      this.selfModel.biases = new Map(state.selfModel.biases || [])
      this.selfModel.values = new Map(state.selfModel.values || [])
      this.selfModel.calibrationScore = state.selfModel.calibrationScore ?? 0.5
      this.selfModel.metaBeliefs = new Map(state.selfModel.metaBeliefs || [])
    }
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let cognitiveCoreInstance = null

/**
 * Get or create the global cognitive core instance
 */
export function getCognitiveCore(options) {
  if (!cognitiveCoreInstance) {
    cognitiveCoreInstance = new CognitiveCore(options)
  }
  return cognitiveCoreInstance
}

/**
 * Reset the singleton (for testing)
 */
export function resetCognitiveCore() {
  cognitiveCoreInstance = null
}

export { CognitiveCore }
export default CognitiveCore
