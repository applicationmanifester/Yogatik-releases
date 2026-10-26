/**
 * driveCycle.js — Proactive Autonomous Agency Loop.
 * 
 * Runs in the background (via scheduler), scores open goals by urgency/feasibility,
 * and spawns sub-agents to work on them while the user is away.
 * User sees "Yogatik worked on X while you were away" summaries.
 */

import { db } from './db'
import { spawnAgentsTool } from './tools/spawnAgents'
import { schedulerTool } from './tools/scheduler'
import { getSetting, setSetting } from './db'
import { memoryBlockFromStores } from './memory4'
import { conceptGraphTool } from './tools/conceptGraphTool'

const GOAL_STORE = 'drive_goals'
const CYCLE_LOG = 'drive_cycle_log'
const ARTIFACT_STORE = 'drive_artifacts'

/*** Goal statuses */
export const GOAL_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
}

/*** Creates a new autonomous goal.
 * @param {object} goal - { title, description, priority?, deadline?, tags?, recurrence? }
 * @returns {string} Goal ID
 */
export async function createGoal(goal) {
  const dbInstance = await db
  const now = Date.now()
  
  const record = {
    id: `goal_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(goal.title || '').trim(),
    description: String(goal.description || '').trim(),
    priority: Math.max(1, Math.min(10, goal.priority || 5)), // 1-10
    status: GOAL_STATUS.ACTIVE,
    tags: Array.isArray(goal.tags) ? goal.tags : [],
    deadline: goal.deadline ? new Date(goal.deadline).getTime() : null,
    recurrence: goal.recurrence || null, // 'daily', 'weekly', 'monthly', or cron
    createdAt: now,
    updatedAt: now,
    lastWorkedAt: null,
    workCount: 0,
    progress: 0, // 0-100
    metadata: goal.metadata || {},
  }

  await dbInstance.table(GOAL_STORE).add(record)
  return record.id
}

/*** Updates a goal's properties.
 */
export async function updateGoal(goalId, updates) {
  const dbInstance = await db
  const goal = await dbInstance.table(GOAL_STORE).get(goalId)
  if (!goal) return { success: false, error: 'Goal not found' }

  Object.assign(goal, updates, { updatedAt: Date.now() })
  await dbInstance.table(GOAL_STORE).put(goal)
  return { success: true, goal }
}

/*** Gets all active goals, optionally filtered.
 */
export async function getActiveGoals(filter = {}) {
  const dbInstance = await db
  let goals = await dbInstance.table(GOAL_STORE)
    .where('status').equals(GOAL_STATUS.ACTIVE)
    .toArray()

  if (filter.tags?.length) {
    const tagSet = new Set(filter.tags)
    goals = goals.filter(g => g.tags.some(t => tagSet.has(t)))
  }

  return goals
}

/*** Scores a goal for the current drive cycle.
 * Higher score = more urgent/feasible to work on now.
 * Factors: priority, deadline proximity, staleness, progress, feasibility.
 */
export function scoreGoal(goal, context = {}) {
  const now = Date.now()
  let score = 0

  // Base priority (1-10) -> 0-50 points
  score += goal.priority * 5

  // Deadline urgency
  if (goal.deadline) {
    const daysUntil = (goal.deadline - now) / (24 * 60 * 60 * 1000)
    if (daysUntil < 0) score += 100 // Overdue
    else if (daysUntil < 1) score += 50
    else if (daysUntil < 3) score += 30
    else if (daysUntil < 7) score += 15
    else if (daysUntil < 14) score += 5
  }

  // Staleness: haven't worked on it in a while
  if (goal.lastWorkedAt) {
    const daysSinceWork = (now - goal.lastWorkedAt) / (24 * 60 * 60 * 1000)
    if (daysSinceWork > 14) score += 20
    else if (daysSinceWork > 7) score += 10
    else if (daysSinceWork > 3) score += 5
  } else {
    score += 15 // Never worked on
  }

  // Progress: prefer goals with some progress but not done
  if (goal.progress > 0 && goal.progress < 100) {
    score += Math.min(20, goal.progress / 5) // Up to 20 for 100% progress
  }

  // Feasibility boost from context (e.g., relevant tools available, workspace ready)
  if (context.feasibilityBoost) score += context.feasibilityBoost

  // Penalize recently failed goals
  if (goal.lastError && (now - goal.lastErrorAt || 0) < 24 * 60 * 60 * 1000) {
    score -= 30
  }

  return Math.max(0, score)
}

/*** Selects the best goal to work on this cycle.
 */
export async function selectGoalForCycle(context = {}) {
  const goals = await getActiveGoals()
  if (!goals.length) return null

  const scored = goals.map(g => ({
    goal: g,
    score: scoreGoal(g, context),
  }))

  scored.sort((a, b) => b.score - a.score)
  
  // Only work on goals above threshold
  const THRESHOLD = 25
  const candidates = scored.filter(s => s.score >= THRESHOLD)
  
  if (!candidates.length) return null

  // Add some exploration: sometimes pick 2nd or 3rd best
  const pickIndex = Math.random() < 0.7 ? 0 : Math.min(1, Math.floor(Math.random() * candidates.length))
  return candidates[pickIndex].goal
}

/*** Generates a task plan for a goal using the planner agent.
 */
export async function planGoalWork(goal) {
  const { spawnAgentsTool } = await import('./tools/spawnAgents')

  const prompt = `You are an autonomous planning agent. Create a concrete, executable task plan for this goal.

GOAL: ${goal.title}
DESCRIPTION: ${goal.description}
PRIORITY: ${goal.priority}/10
TAGS: ${goal.tags.join(', ') || 'none'}
PROGRESS SO FAR: ${goal.progress}%

CONTEXT: This is running in a background drive cycle. The user is NOT watching. Plan tasks that can be executed autonomously by specialist sub-agents. Each task must be self-contained and produce a verifiable artifact.

Return JSON with:
- tasks: array of { id, description, agent (researcher/coder/writer/analyst/qa_tester), depends_on[], estimated_tokens, tool_budget, checkpoint_artifacts[] }
- estimated_total_time_minutes

Focus on: information gathering, code/data production, verification. Avoid tasks requiring human input.
`

  const result = await spawnAgentsTool.execute({
    tasks: [{
      id: 'plan_goal_work',
      agent: 'agent_planner',
      task: prompt,
    }],
    isolate_workspace: true,
  })

  try {
    return JSON.parse(result.results?.[0]?.output || '{}')
  } catch {
    // Fallback plan
    return {
      tasks: [
        { id: 'research', description: `Research and gather information for: ${goal.title}`, agent: 'agent_researcher', depends_on: [], estimated_tokens: 6000, tool_budget: 30, checkpoint_artifacts: ['research_summary.md'] },
        { id: 'execute', description: `Execute core work for: ${goal.title}`, agent: 'agent_coder', depends_on: ['research'], estimated_tokens: 8000, tool_budget: 40, checkpoint_artifacts: ['implementation/'] },
        { id: 'verify', description: `Verify outputs for: ${goal.title}`, agent: 'agent_qa_tester', depends_on: ['execute'], estimated_tokens: 4000, tool_budget: 20, checkpoint_artifacts: ['test_results.json'] },
      ],
      estimated_total_time_minutes: 30,
    }
  }
}

/*** Executes a goal's task plan via spawnAgentsTool (DAG waves).
 */
export async function executeGoalPlan(goal, plan) {
  const { spawnAgentsTool } = await import('./tools/spawnAgents')
  const { createTaskDag } = await import('./taskDag')

  // Convert plan to DAG
  const dag = createTaskDag(goal.title, plan.tasks.map(t => ({
    ...t,
    checkpointArtifacts: t.checkpoint_artifacts || [],
  })))

  const waves = compileTaskDagToWaves(dag) // from taskDag.js
  
  let allResults = []
  const resultsById = new Map()

  for (const wave of waves) {
    // Execute wave in parallel
    const waveResults = await Promise.all(
      wave.map(async (waveTask) => {
        const enrichedTask = enrichTaskWithDagContext(dag, waveTask.id) // from taskDag.js
        
        const result = await spawnAgentsTool.execute({
          tasks: [{
            id: waveTask.id,
            agent: waveTask.agent || 'agent_worker',
            task: enrichedTask,
          }],
          isolate_workspace: true,
        })

        const output = result.results?.[0]?.output || '(no output)'
        resultsById.set(waveTask.id, { agent: waveTask.agent, result: output })
        
        // Update DAG
        updateTaskDagItem(dag, waveTask.id, 'completed', output)
        
        return { taskId: waveTask.id, agent: waveTask.agent, output }
      })
    )
    allResults.push(...waveResults)
  }

  return { dag, results: allResults }
}

/*** Stores an artifact produced during drive cycle.
 */
export async function storeArtifact(goalId, artifact) {
  const dbInstance = await db
  const record = {
    id: `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    goalId,
    type: artifact.type || 'file',
    path: artifact.path,
    content: artifact.content,
    summary: artifact.summary,
    createdAt: Date.now(),
  }
  await dbInstance.table(ARTIFACT_STORE).add(record)
  return record.id
}

/*** Runs a single drive cycle: pick goal, plan, execute, store artifacts.
 * Called by scheduler (e.g., every 30 min when idle).
 */
export async function runDriveCycle(context = {}) {
  const startTime = Date.now()
  console.log('[DriveCycle] Starting cycle...')

  // Check if we should run (e.g., user idle, not in active chat)
  const shouldRun = await shouldRunCycle(context)
  if (!shouldRun) {
    console.log('[DriveCycle] Skipping - conditions not met')
    return { success: true, skipped: true, reason: 'conditions not met' }
  }

  // Select goal
  const goal = await selectGoalForCycle(context)
  if (!goal) {
    console.log('[DriveCycle] No eligible goals')
    return { success: true, skipped: true, reason: 'no eligible goals' }
  }

  console.log(`[DriveCycle] Working on goal: ${goal.title} (score: ${scoreGoal(goal, context)})`)

  // Update goal status
  await updateGoal(goal.id, { lastWorkedAt: Date.now(), workCount: goal.workCount + 1 })

  // Plan work
  const plan = await planGoalWork(goal)
  if (!plan.tasks?.length) {
    await updateGoal(goal.id, { lastError: 'Planning failed', lastErrorAt: Date.now() })
    return { success: false, error: 'Planning failed' }
  }

  // Execute plan
  let executionResult
  try {
    executionResult = await executeGoalPlan(goal, plan)
  } catch (e) {
    await updateGoal(goal.id, { lastError: e.message, lastErrorAt: Date.now() })
    return { success: false, error: e.message }
  }

  // Store artifacts
  const artifactIds = []
  if (executionResult.dag) {
    for (const task of executionResult.dag.tasks) {
      if (task.status === 'completed' && task.result) {
        const id = await storeArtifact(goal.id, {
          type: 'task_output',
          path: `goals/${goal.id}/${task.id}.md`,
          content: task.result,
          summary: `Output from ${task.id}: ${task.result.slice(0, 200)}`,
        })
        artifactIds.push(id)
      }
    }
  }

  // Update goal progress
  const completedTasks = executionResult.dag?.tasks.filter(t => t.status === 'completed').length || 0
  const totalTasks = executionResult.dag?.tasks.length || 1
  const progress = Math.round((completedTasks / totalTasks) * 100)
  await updateGoal(goal.id, { progress: Math.max(goal.progress, progress) })

  // Log cycle
  await logCycle({
    goalId: goal.id,
    goalTitle: goal.title,
    tasksPlanned: plan.tasks.length,
    tasksCompleted: completedTasks,
    artifactsCreated: artifactIds.length,
    durationMs: Date.now() - startTime,
    success: true,
  })

  // Check if goal completed
  if (progress >= 100) {
    await updateGoal(goal.id, { status: GOAL_STATUS.COMPLETED, progress: 100 })
  }

  console.log(`[DriveCycle] Completed in ${Date.now() - startTime}ms`)
  return {
    success: true,
    goalId: goal.id,
    goalTitle: goal.title,
    progress,
    artifacts: artifactIds,
    durationMs: Date.now() - startTime,
  }
}

/*** Determines if a drive cycle should run now.
 */
async function shouldRunCycle(context) {
  // Don't run if user is actively chatting (heuristic: last message < 5 min ago)
  if (context.lastUserMessageAt && (Date.now() - context.lastUserMessageAt) < 5 * 60 * 1000) {
    return false
  }

  // Don't run too frequently (min 30 min between cycles)
  const lastCycle = await getSetting('last_drive_cycle')
  if (lastCycle && (Date.now() - lastCycle) < 30 * 60 * 1000) {
    return false
  }

  // Check system resources (battery, CPU) - desktop only
  if (typeof navigator !== 'undefined' && navigator.getBattery) {
    try {
      const battery = await navigator.getBattery()
      if (!battery.charging && battery.level < 0.2) return false
    } catch {}
  }

  return true
}

/*** Logs a drive cycle execution.
 */
export async function logCycle(entry) {
  const dbInstance = await db
  await dbInstance.table(CYCLE_LOG).add({
    ...entry,
    timestamp: Date.now(),
  })

  // Keep last 100 cycles
  const count = await dbInstance.table(CYCLE_LOG).count()
  if (count > 100) {
    const oldest = await dbInstance.table(CYCLE_LOG).orderBy('timestamp').first()
    if (oldest) await dbInstance.table(CYCLE_LOG).delete(oldest.id)
  }

  await setSetting('last_drive_cycle', Date.now())
}

/*** Gets recent drive cycle history for UI summary.
 */
export async function getCycleHistory(limit = 20) {
  const dbInstance = await db
  return dbInstance.table(CYCLE_LOG).orderBy('timestamp').reverse().limit(limit).toArray()
}

/*** Generates a user-facing summary of what happened while away.
 */
export async function generateAwaySummary() {
  const cycles = await getCycleHistory(10)
  if (!cycles.length) return 'No autonomous work performed while you were away.'

  const lines = ['## 🤖 Yogatik worked while you were away:\n']
  for (const c of cycles) {
    if (!c.success) continue
    lines.push(`- **${c.goalTitle}**: ${c.tasksCompleted}/${c.tasksPlanned} tasks completed, ${c.artifactsCreated} artifacts created (${Math.round(c.durationMs/1000)}s)`)
  }
  return lines.join('\n')
}

/*** Schedules the drive cycle to run periodically.
 */
export async function scheduleDriveCycle(intervalMinutes = 30) {
  await schedulerTool.execute({
    action: 'create',
    name: 'drive_cycle',
    schedule: `every ${intervalMinutes} minutes`,
    type: 'custom',
    description: 'Proactive autonomous drive cycle',
    payload: { prompt: 'Run drive cycle', model: 'auto', provider: 'auto' },
  })
}

/*** Stops the scheduled drive cycle.
 */
export async function stopDriveCycle() {
  await schedulerTool.execute({ action: 'delete', id: 'drive_cycle' })
}

// Re-export from taskDag for internal use
import { compileTaskDagToWaves, updateTaskDagItem, enrichTaskWithDagContext } from './taskDag'
