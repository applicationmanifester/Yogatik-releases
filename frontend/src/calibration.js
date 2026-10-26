/**
 * calibration.js — Meta-Cognition & Uncertainty Calibration System.
 * 
 * Wraps every tool call with confidence estimation. If P(success) < threshold,
 * auto-invokes research or ask_user instead of guessing.
 * Logs calibration curves per tool for continuous improvement.
 */

import { db } from './db'
import { spawnAgentsTool } from './tools/spawnAgents'
import { askUserTool } from './tools/askUser'
import { researchTool } from './tools/research'
import { getSetting, setSetting } from './db'

const CALIBRATION_STORE = 'tool_calibration'
const CONFIDENCE_LOG = 'confidence_log'

/*** Default confidence thresholds per tool category */
export const DEFAULT_THRESHOLDS = {
  // High-stakes tools
  fs_write: 0.7,
  fs_edit: 0.7,
  fs_replace_content: 0.7,
  fs_delete: 0.8,
  terminal_run: 0.6,
  proc_start: 0.6,
  browser_control: 0.6,
  computer_control: 0.7,
  zerodha_trade: 0.9,
  
  // Medium-stakes
  fs_read: 0.5,
  fs_search: 0.5,
  web_search: 0.5,
  deep_research: 0.5,
  code_execute: 0.6,
  js_execute: 0.6,
  
  // Low-stakes / read-only
  calculator: 0.9,
  weather: 0.8,
  translate: 0.8,
  unit_convert: 0.9,
  memory: 0.6,
  
  // Default
  default: 0.6,
}

/*** Estimates confidence that a tool call will succeed given context.
 * Uses few-shot prompt to a small/fast model or heuristic rules.
 * @param {string} toolName
 * @param {object} args
 * @param {object} context - { conversationHistory, recentErrors, userIntent }
 * @returns {Promise<number>} Confidence 0-1
 */
export async function estimateConfidence(toolName, args, context = {}) {
  // Fast heuristic rules first (no LLM call needed)
  const heuristic = heuristicConfidence(toolName, args, context)
  if (heuristic !== null) return heuristic

  // For complex tools, use LLM-based estimation
  const llmEstimate = await llmConfidenceEstimate(toolName, args, context)
  return llmEstimate
}

/*** Fast heuristic confidence based on tool + arg patterns. */
function heuristicConfidence(toolName, args, context) {
  const recentErrors = context.recentErrors || []
  const sameToolErrors = recentErrors.filter(e => e.tool === toolName).length
  
  // Penalize if recent same-tool failures
  if (sameToolErrors >= 2) return 0.3
  if (sameToolErrors === 1) return 0.5

  // Tool-specific heuristics
  switch (toolName) {
    case 'fs_write':
    case 'fs_edit':
    case 'fs_replace_content':
      // Low confidence if path doesn't exist and not creating new
      if (args.path && !args.path.includes('new_') && !args.createNew) {
        return 0.5 // Uncertain without verification
      }
      return 0.7

    case 'fs_read':
      // High confidence for reads, but lower if path looks suspicious
      if (args.path && args.path.includes('..')) return 0.4
      return 0.8

    case 'terminal_run':
    case 'proc_start':
      // Low confidence for destructive commands
      const cmd = (args.command || '').toLowerCase()
      if (/(rm -rf|delete|format|destroy|kill -9)/.test(cmd)) return 0.3
      if (/npm install|pip install|build|compile/.test(cmd)) return 0.6
      return 0.7

    case 'web_search':
    case 'deep_research':
      // High confidence for searches
      return 0.8

    case 'code_execute':
    case 'js_execute':
      // Medium confidence - syntax errors common
      return 0.6

    case 'spawn_agents':
    case 'crew_orchestrator':
    case 'agent_swarm':
      // High confidence for delegation
      return 0.75

    case 'ask_user':
      // Always high confidence (it always "succeeds" by getting answer)
      return 0.95
  }

  return null // No heuristic, fall back to LLM
}

/*** LLM-based confidence estimation (uses a fast/cheap model). */
async function llmConfidenceEstimate(toolName, args, context) {
  // In production, this would call a small fast model.
  // For now, return a calibrated default based on tool category.
  const categoryThresholds = {
    'fs_': 0.65,
    'terminal_': 0.6,
    'proc_': 0.6,
    'browser_': 0.6,
    'computer_': 0.65,
    'git_': 0.7,
    'search': 0.75,
    'research': 0.75,
    'memory': 0.7,
    'code_': 0.6,
    'js_': 0.6,
    'spawn_': 0.75,
    'crew_': 0.75,
    'agent_': 0.75,
    'ask_': 0.95,
    'calc': 0.9,
    'weather': 0.8,
    'translate': 0.8,
    'convert': 0.9,
  }

  for (const [prefix, threshold] of Object.entries(categoryThresholds)) {
    if (toolName.startsWith(prefix)) return threshold
  }

  return DEFAULT_THRESHOLDS.default
}

/*** Records a confidence prediction and actual outcome for calibration. */
export async function recordConfidenceOutcome(toolName, predictedConfidence, actualSuccess, metadata = {}) {
  const dbInstance = await db
  const record = {
    toolName,
    predictedConfidence,
    actualSuccess: Boolean(actualSuccess),
    error: metadata.error || null,
    timestamp: Date.now(),
    argsHash: hashArgs(args),
    context: metadata.context || {},
  }

  await dbInstance.table(CONFIDENCE_LOG).add(record)

  // Update calibration curve for this tool
  await updateCalibrationCurve(toolName)

  // Keep last 10000 records
  const count = await dbInstance.table(CONFIDENCE_LOG).count()
  if (count > 10000) {
    const oldest = await dbInstance.table(CONFIDENCE_LOG).orderBy('timestamp').first()
    if (oldest) await dbInstance.table(CONFIDENCE_LOG).delete(oldest.id)
  }
}

/*** Simple hash of args for grouping similar calls. */
function hashArgs(args) {
  try {
    const str = JSON.stringify(args, Object.keys(args).sort())
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  } catch {
    return 'unknown'
  }
}

/*** Updates the calibration curve for a tool.
 * Curve maps predicted confidence bins -> actual success rates.
 */
async function updateCalibrationCurve(toolName) {
  const dbInstance = await db
  const records = await dbInstance.table(CONFIDENCE_LOG)
    .where('toolName').equals(toolName)
    .toArray()

  if (records.length < 10) return // Not enough data

  // Bin by predicted confidence (10 bins: 0.0-0.1, 0.1-0.2, ...)
  const bins = Array(10).fill(null).map(() => ({ predicted: 0, actual: 0, count: 0 }))
  
  for (const r of records) {
    const binIdx = Math.min(9, Math.floor(r.predictedConfidence * 10))
    bins[binIdx].predicted += r.predictedConfidence
    bins[binIdx].actual += r.actualSuccess ? 1 : 0
    bins[binIdx].count++
  }

  const curve = bins.map((b, i) => ({
    bin: `${(i/10).toFixed(1)}-${((i+1)/10).toFixed(1)}`,
    avgPredicted: b.count > 0 ? b.predicted / b.count : 0,
    actualRate: b.count > 0 ? b.actual / b.count : 0,
    count: b.count,
  })).filter(b => b.count > 0)

  // Calculate calibration error (ECE - Expected Calibration Error)
  let ece = 0
  let total = 0
  for (const b of bins) {
    if (b.count > 0) {
      ece += b.count * Math.abs(b.predicted / b.count - b.actual / b.count)
      total += b.count
    }
  }
  ece = total > 0 ? ece / total : 0

  await dbInstance.table(CALIBRATION_STORE).put({
    toolName,
    curve,
    ece,
    sampleSize: records.length,
    updatedAt: Date.now(),
  })
}

/*** Gets the calibration curve for a tool. */
export async function getCalibrationCurve(toolName) {
  const dbInstance = await db
  const record = await dbInstance.table(CALIBRATION_STORE).get(toolName)
  return record || { toolName, curve: [], ece: 0, sampleSize: 0 }
}

/*** Gets calibration summary for all tools. */
export async function getAllCalibrationCurves() {
  const dbInstance = await db
  return dbInstance.table(CALIBRATION_STORE).toArray()
}

/*** Decides whether to proceed with tool, research, or ask_user.
 * @returns {object} { action: 'proceed' | 'research' | 'ask_user', confidence, reason, suggestedTool?, suggestedArgs? }
 */
export async function decideAction(toolName, args, context = {}) {
  const confidence = await estimateConfidence(toolName, args, context)
  const threshold = DEFAULT_THRESHOLDS[toolName] || DEFAULT_THRESHOLDS.default

  if (confidence >= threshold) {
    return { action: 'proceed', confidence, reason: `Confidence ${confidence.toFixed(2)} >= threshold ${threshold}` }
  }

  // Low confidence - decide between research and ask_user
  // If the uncertainty is about facts -> research
  // If the uncertainty is about user preference/intent -> ask_user
  const uncertainReason = `Confidence ${confidence.toFixed(2)} below threshold ${threshold}`

  // Heuristic: if args contain subjective choices, ask user
  const subjectiveKeywords = ['prefer', 'choose', 'decide', 'which', 'what do you', 'your opinion']
  const argsStr = JSON.stringify(args).toLowerCase()
  const isSubjective = subjectiveKeywords.some(k => argsStr.includes(k))

  if (isSubjective || toolName === 'ask_user') {
    return {
      action: 'ask_user',
      confidence,
      reason: uncertainReason + ' (subjective decision)',
      suggestedTool: 'ask_user',
      suggestedArgs: { question: `Low confidence (${confidence.toFixed(2)}) for ${toolName}. Should I proceed?`, options: ['Yes, proceed', 'No, research first', 'No, different approach'] },
    }
  }

  // Otherwise, research
  return {
    action: 'research',
    confidence,
    reason: uncertainReason + ' (need more information)',
    suggestedTool: 'deep_research',
    suggestedArgs: { topic: `How to properly use ${toolName} for: ${JSON.stringify(args).slice(0, 200)}`, depth: 'standard' },
  }
}

/*** Wraps a tool execution with calibration.
 * Use this instead of calling executeTool directly for calibrated execution.
 */
export async function calibratedExecute(toolName, args, context = {}) {
  const { executeTool } = await import('./tools/index')

  const decision = await decideAction(toolName, args, context)

  if (decision.action === 'proceed') {
    const result = await executeTool(toolName, args, context)
    await recordConfidenceOutcome(toolName, decision.confidence, result.success, { error: result.error, context })
    return result
  }

  if (decision.action === 'ask_user') {
    const userResult = await executeTool('ask_user', decision.suggestedArgs, context)
    if (userResult.success && userResult.user_response) {
      const response = userResult.user_response.toLowerCase()
      if (response.includes('yes') || response.includes('proceed')) {
        const result = await executeTool(toolName, args, context)
        await recordConfidenceOutcome(toolName, decision.confidence, result.success, { error: result.error, context })
        return result
      }
    }
    return { success: false, error: 'User declined to proceed', calibrated: true, action: 'ask_user' }
  }

  if (decision.action === 'research') {
    const researchResult = await executeTool('deep_research', decision.suggestedArgs, context)
    // After research, re-evaluate (simplified: just proceed with original)
    const result = await executeTool(toolName, args, context)
    await recordConfidenceOutcome(toolName, decision.confidence, result.success, { error: result.error, context, researched: true })
    return result
  }

  return { success: false, error: 'Unknown calibration action' }
}

/*** Nightly calibration analysis job. */
export async function nightlyCalibrationAnalysis() {
  const curves = await getAllCalibrationCurves()
  
  // Find poorly calibrated tools (ECE > 0.15)
  const poorlyCalibrated = curves.filter(c => c.ece > 0.15 && c.sampleSize > 50)

  // Generate report
  const report = {
    timestamp: Date.now(),
    totalTools: curves.length,
    poorlyCalibrated: poorlyCalibrated.length,
    tools: poorlyCalibrated.map(c => ({
      tool: c.toolName,
      ece: c.ece,
      samples: c.sampleSize,
      recommendation: c.ece > 0.25 ? 'URGENT: Re-evaluate confidence estimation' : 'Review confidence thresholds'
    })),
  }

  console.log('[Calibration] Nightly analysis:', report)
  return report
}

/*** Adjusts threshold for a tool based on calibration data. */
export async function autoAdjustThreshold(toolName) {
  const curve = await getCalibrationCurve(toolName)
  if (!curve.curve?.length) return

  // Find the confidence level where actual success rate >= 0.8
  let suggestedThreshold = DEFAULT_THRESHOLDS[toolName] || DEFAULT_THRESHOLDS.default
  
  for (const bin of curve.curve) {
    if (bin.actualRate >= 0.8 && bin.avgPredicted < suggestedThreshold) {
      suggestedThreshold = bin.avgPredicted
    }
  }

  // Store adjusted threshold
  const dbInstance = await db
  await dbInstance.table('calibration_thresholds').put({
    toolName,
    threshold: suggestedThreshold,
    autoAdjusted: true,
    basedOnEce: curve.ece,
    updatedAt: Date.now(),
  })

  return suggestedThreshold
}
