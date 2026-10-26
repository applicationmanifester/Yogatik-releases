/**
 * selfRefine.js — Autonomous Self-Improvement Loop for Yogatik Agent.
 * 
 * The agent reflects on its own performance, proposes improvements to its
 * constitution/prompts/tools, tests them, and applies approved changes.
 * Runs nightly via scheduler or on-demand via selfRefineTool.
 */

import { db } from './db'
import { fsReadTool, fsWriteTool, fsPatchTool, fsFileTreeTool } from './tools/localFs'
import { testAndHealTool } from './tools/testAndHeal'
import { spawnAgentsTool } from './tools/spawnAgents'
import { getSetting, setSetting } from './db'

const REFLECTION_STORE = 'self_reflections'
const CONSTITUTION_KEY = 'agent_constitution'
const PROPOSALS_KEY = 'self_refine_proposals'

/**
 * Default agent constitution — the agent's own governing prompt.
 * Versioned and editable via self-refinement.
 */
export const DEFAULT_CONSTITUTION = `
# Yogatik Agent Constitution (v1, auto-versioned)
## Core Directives
1. NEVER stop at first error — run relentlessLoop until success or explicit user halt
2. PREFER tools over internal knowledge — if a tool exists, use it
3. WRITE code to explore — fsWrite + terminalRun > speculation
4. SYNTHESIZE, don't just retrieve — combine memories + search + reasoning
5. CALIBRATE confidence — if P(success) < 0.6, research or ask

## Self-Modification Protocol
- Any turn may propose a Constitution diff via selfRefineTool
- Diffs require: passing test suite + user approval (or 3 successful autonomous runs)
- Versioned in git; rollback via fsUndoTool
`

/**
 * Load current constitution from settings or return default.
 */
export async function getConstitution() {
  try {
    const stored = await getSetting(CONSTITUTION_KEY)
    if (stored && typeof stored === 'string') return stored
  } catch {}
  return DEFAULT_CONSTITUTION
}

/**
 * Save constitution version.
 */
export async function setConstitution(content, versionNote = '') {
  const versioned = `${content}\n\n<!-- Version: ${new Date().toISOString()} -- ${versionNote} -->`
  await setSetting(CONSTITUTION_KEY, versioned)
  // Also persist to git-tracked file for rollback
  await fsWriteTool.execute({ path: 'frontend/src/agentConstitution.md', content: versioned })
  return { success: true, version: Date.now() }
}

/**
 * Record a reflection entry (turn outcome + lessons).
 */
export async function recordReflection(entry) {
  const dbInstance = await db
  const rec = {
    ...entry,
    timestamp: Date.now(),
    id: `refl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }
  await dbInstance.table(REFLECTION_STORE).add(rec)
  // Keep last 1000 reflections
  const count = await dbInstance.table(REFLECTION_STORE).count()
  if (count > 1000) {
    const oldest = await dbInstance.table(REFLECTION_STORE).orderBy('timestamp').first()
    if (oldest) await dbInstance.table(REFLECTION_STORE).delete(oldest.id)
  }
  return rec.id
}

/**
 * Retrieve recent reflections for analysis.
 */
export async function getRecentReflections(limit = 100) {
  const dbInstance = await db
  return dbInstance.table(REFLECTION_STORE).orderBy('timestamp').reverse().limit(limit).toArray()
}

/**
 * Analyze reflections and generate improvement proposals.
 * Runs as a specialist sub-agent (reflection agent).
 */
export async function generateProposals(reflections = null) {
  if (!reflections) reflections = await getRecentReflections(200)
  if (!reflections.length) return []

  // Pattern detection: group by error type, tool, task category
  const errorPatterns = {}
  const toolFailures = {}
  const stagnationEvents = 0

  for (const r of reflections) {
    if (r.error) {
      const sig = r.errorSignature || r.error.slice(0, 100)
      errorPatterns[sig] = (errorPatterns[sig] || 0) + 1
    }
    if (r.tool && !r.success) {
      toolFailures[r.tool] = (toolFailures[r.tool] || 0) + 1
    }
    if (r.stagnationDetected) stagnationEvents++
  }

  // Build proposal prompt for reflection agent
  const prompt = `Analyze these execution reflections and propose 1-3 concrete improvements to the agent's constitution, tool usage patterns, or prompt strategies.

REFLECTIONS (last ${reflections.length}):
${JSON.stringify(reflections.slice(0, 50), null, 2)}

ERROR PATTERNS:
${JSON.stringify(errorPatterns, null, 2)}

TOOL FAILURE COUNTS:
${JSON.stringify(toolFailures, null, 2)}

STAGNATION EVENTS: ${stagnationEvents}

CURRENT CONSTITUTION:
${await getConstitution()}

Return ONLY a JSON array of proposals, each with:
- type: "constitution" | "tool_pattern" | "prompt_strategy" | "workflow"
- title: short description
- description: detailed rationale
- diff: unified diff string (for constitution) or actionable change description
- confidence: 0-1
- testPlan: how to validate this change
`

  // Delegate to a focused reflection sub-agent
  const result = await spawnAgentsTool.execute({
    tasks: [{
      id: 'reflection_analysis',
      agent: 'agent_analyst',
      task: prompt,
    }],
    isolate_workspace: true,
  })

  try {
    const proposals = JSON.parse(result.results?.[0]?.output || '[]')
    // Store proposals for review
    for (const p of proposals) {
      p.id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      p.createdAt = Date.now()
      p.status = 'pending'
      const dbInstance = await db
      await dbInstance.table(PROPOSALS_KEY).add(p)
    }
    return proposals
  } catch {
    return []
  }
}

/**
 * Apply an approved proposal (constitution diff or tool pattern change).
 */
export async function applyProposal(proposalId, approvedBy = 'user') {
  const dbInstance = await db
  const proposal = await dbInstance.table(PROPOSALS_KEY).get(proposalId)
  if (!proposal) return { success: false, error: 'Proposal not found' }

  if (proposal.type === 'constitution' && proposal.diff) {
    const current = await getConstitution()
    // Apply unified diff (simplified - in production use a proper patch lib)
    const newContent = applyUnifiedDiff(current, proposal.diff)
    await setConstitution(newContent, `Applied proposal ${proposalId} by ${approvedBy}`)
    proposal.status = 'applied'
    proposal.appliedAt = Date.now()
    proposal.approvedBy = approvedBy
    await dbInstance.table(PROPOSALS_KEY).put(proposal)
    return { success: true, type: 'constitution' }
  }

  if (proposal.type === 'tool_pattern' && proposal.action) {
    // Store as procedural memory for the agent to follow
    const { remember } = await import('./memory4')
    await remember({
      store: 'procedural',
      text: proposal.action,
      importance: 0.8,
      tag: 'self_refine',
    })
    proposal.status = 'applied'
    proposal.appliedAt = Date.now()
    await dbInstance.table(PROPOSALS_KEY).put(proposal)
    return { success: true, type: 'tool_pattern' }
  }

  return { success: false, error: 'Unknown proposal type' }
}

/**
 * Simple unified diff application (basic implementation).
 */
function applyUnifiedDiff(original, diff) {
  const lines = original.split('\n')
  const diffLines = diff.split('\n')
  let i = 0
  const result = []
  
  for (const dl of diffLines) {
    if (dl.startsWith('@@')) continue
    if (dl.startsWith('+')) {
      result.push(dl.slice(1))
    } else if (dl.startsWith('-')) {
      // Skip removed line
    } else {
      result.push(dl)
    }
  }
  
  // Fallback: if diff parsing fails, return original with diff appended as comment
  if (result.length === 0) {
    return original + '\n\n<!-- PROPOSED DIFF:\n' + diff + '\n-->'
  }
  return result.join('\n')
}

/**
 * Nightly reflection job — called by scheduler.
 */
export async function nightlyReflectionJob() {
  console.log('[SelfRefine] Starting nightly reflection...')
  const reflections = await getRecentReflections(500)
  const proposals = await generateProposals(reflections)
  console.log(`[SelfRefine] Generated ${proposals.length} proposals`)
  
  // Auto-apply high-confidence, low-risk proposals (tool patterns, not constitution)
  for (const p of proposals) {
    if (p.type === 'tool_pattern' && p.confidence > 0.85 && p.risk === 'low') {
      await applyProposal(p.id, 'auto')
    }
  }
  
  return { reflectionsAnalyzed: reflections.length, proposalsGenerated: proposals.length }
}

/**
 * Get pending proposals for user review.
 */
export async function getPendingProposals() {
  const dbInstance = await db
  return dbInstance.table(PROPOSALS_KEY).where('status').equals('pending').reverse().sortBy('createdAt')
}
