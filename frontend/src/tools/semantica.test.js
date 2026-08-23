import { describe, it, expect, beforeEach } from 'vitest'
import {
  globalContextGraph,
  globalDecisionManager,
  semanticaRecordDecisionTool,
  semanticaTraceCausalChainTool,
  semanticaFindPrecedentsTool,
  semanticaContextGraphTool,
  semanticaAuditExportTool,
} from './semantica'

describe('Semantica Suite', () => {
  beforeEach(() => {
    globalContextGraph.nodes.clear()
    globalContextGraph.edges = []
    globalContextGraph.history = []
    globalDecisionManager.decisions.clear()
    globalDecisionManager.causalEdges = []
  })

  it('records an auditable decision and verifies policy compliance', async () => {
    const res = await semanticaRecordDecisionTool.execute({
      category: 'underwriting',
      scenario: 'Loan applicant #1092 with DTI 28% and 5yr history',
      reasoning: 'Stable employment and debt-to-income ratio meets prime tier threshold.',
      outcome: 'approved_prime_rate',
      confidence: 0.96,
      metadata: { applicantId: 1092, rate: '6.5%' },
    })

    expect(res.status).toBe('recorded')
    expect(res.decision.id).toMatch(/^dec_/)
    expect(res.decision.outcome).toBe('approved_prime_rate')
    expect(res.policyCompliance.isCompliant).toBe(true)
    expect(res.policyCompliance.passedRules).toContain('minimum_confidence_threshold')
  })

  it('builds and traces causal decision chains (ancestry and downstream impact)', async () => {
    const dec1 = await semanticaRecordDecisionTool.execute({
      category: 'credit_check',
      scenario: 'Initial credit inquiry',
      reasoning: 'Clean credit score of 780 with zero delinquencies in 36 months.',
      outcome: 'pass_tier_1',
      confidence: 0.99,
    })

    const dec2 = await semanticaRecordDecisionTool.execute({
      category: 'loan_pricing',
      scenario: 'Interest rate assignment based on credit verification',
      reasoning: 'Tier 1 credit status enables base rate + 1.2% margin tier.',
      outcome: 'rate_assigned_6.2pct',
      confidence: 0.95,
      causeDecisionId: dec1.decision.id,
      relationshipType: 'CAUSED',
    })

    const chain = await semanticaTraceCausalChainTool.execute({ decisionId: dec2.decision.id })
    expect(chain.rootDecision.id).toBe(dec2.decision.id)
    expect(chain.upstreamAncestry).toHaveLength(1)
    expect(chain.upstreamAncestry[0].decision.id).toBe(dec1.decision.id)
    expect(chain.upstreamAncestry[0].relationship).toBe('CAUSED')

    const impact = await semanticaTraceCausalChainTool.execute({ decisionId: dec1.decision.id })
    expect(impact.downstreamImpact).toHaveLength(1)
    expect(impact.downstreamImpact[0].decision.id).toBe(dec2.decision.id)
  })

  it('searches for similar historical precedents', async () => {
    await semanticaRecordDecisionTool.execute({
      category: 'vendor_selection',
      scenario: 'HIPAA cloud provider evaluation',
      reasoning: 'AWS provides BAA agreement, audit reports, and compliant encryption.',
      outcome: 'select_aws',
      confidence: 0.94,
    })

    await semanticaRecordDecisionTool.execute({
      category: 'network_security',
      scenario: 'WAF ruleset update',
      reasoning: 'Rate limit aggressive bots from scraping auth endpoint.',
      outcome: 'block_tor_exits',
      confidence: 0.92,
    })

    const search = await semanticaFindPrecedentsTool.execute({ query: 'HIPAA cloud vendor' })
    expect(search.count).toBeGreaterThan(0)
    expect(search.precedents[0].decision.category).toBe('vendor_selection')
    expect(search.precedents[0].decision.outcome).toBe('select_aws')
  })

  it('performs multi-hop graph traversal and conflict detection', async () => {
    globalContextGraph.addNode('corp_a', 'Organization', { name: 'Acme Corp' })
    globalContextGraph.addNode('person_b', 'Person', { name: 'Alice Chen' })
    globalContextGraph.addNode('patent_c', 'Patent', { name: 'Distributed Consensus' })

    globalContextGraph.addEdge('person_b', 'corp_a', 'works_for')
    globalContextGraph.addEdge('person_b', 'patent_c', 'inventor_of')

    const traversal = await semanticaContextGraphTool.execute({
      action: 'get_neighbors',
      nodeId: 'corp_a',
      hops: 2,
    })
    expect(traversal.totalNeighbors).toBeGreaterThanOrEqual(2)

    // Conflict detection
    globalContextGraph.addEdge('alice', 'london', 'lives_in')
    const conflictCheck = await semanticaContextGraphTool.execute({
      action: 'detect_conflicts',
      subject: 'alice',
      predicate: 'lives_in',
      object: 'tokyo',
    })
    expect(conflictCheck.hasConflict).toBe(true)
  })

  it('exports audit trail in W3C PROV-O, Markdown, and CSV format', async () => {
    await semanticaRecordDecisionTool.execute({
      category: 'security_triage',
      scenario: 'High volume requests on login route',
      reasoning: 'Credential stuffing attack signature identified from IP range.',
      outcome: 'activate_rate_limiting',
      confidence: 0.98,
    })

    const provO = await semanticaAuditExportTool.execute({ format: 'prov-o' })
    expect(provO.data).toContain('@prefix prov: <http://www.w3.org/ns/prov#>')
    expect(provO.data).toContain('prov:Activity')

    const md = await semanticaAuditExportTool.execute({ format: 'markdown' })
    expect(md.data).toContain('# Semantica Decision Audit Trail')
    expect(md.data).toContain('activate_rate_limiting')

    const csv = await semanticaAuditExportTool.execute({ format: 'csv' })
    expect(csv.data).toContain('category,scenario,reasoning,outcome')
  })
})
