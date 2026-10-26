/**
 * taskDag.js — DAG-Based Task Planner with Dependency Graph, Resource Budgeting,
 * Checkpointing, and Executable Subtask Compilation for spawnAgentsTool.
 * 
 * Replaces linear taskPlanMemory with a proper directed acyclic graph that supports:
 * - dependsOn[] dependencies between tasks
 * - estimatedTokens, toolBudget for resource planning
 * - checkpointArtifacts for resumability
 * - parallel wave execution via dagResolver
 * - serialization for persistence
 */

import { resolveTaskWaves, enrichTaskWithUpstream } from './tools/dagResolver'
import { db } from './db'

const TASK_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
}

const STORAGE_PREFIX = 'yogatik_taskdag_'

/**
 * Creates a new DAG task plan.
 * @param {string} title
 * @param {Array<object>} tasks - Array of { id, description, dependsOn?, estimatedTokens?, toolBudget?, checkpointArtifacts? }
 * @returns {object} Task DAG plan
 */
export function createTaskDag(title = 'Project Task DAG', tasks = []) {
  const normalizedTasks = tasks.map((t, idx) => ({
    id: String(t.id || `task_${idx + 1}`),
    description: String(t.description || '').trim(),
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
    estimatedTokens: Math.max(0, Math.floor(t.estimatedTokens || 4000)),
    toolBudget: Math.max(0, Math.floor(t.toolBudget || 20)),
    checkpointArtifacts: Array.isArray(t.checkpointArtifacts) ? t.checkpointArtifacts : [],
    status: TASK_STATUS.PENDING,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
    retries: 0,
    assignedWave: -1,
  }))

  // Validate DAG - no cycles
  if (hasCycle(normalizedTasks)) {
    throw new Error('Task DAG contains cycles. Check dependsOn references.')
  }

  return {
    title: String(title).trim() || 'Project Task DAG',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
    tasks: normalizedTasks,
    metadata: {
      totalEstimatedTokens: normalizedTasks.reduce((sum, t) => sum + t.estimatedTokens, 0),
      totalToolBudget: normalizedTasks.reduce((sum, t) => sum + t.toolBudget, 0),
      maxParallelism: calculateMaxParallelism(normalizedTasks),
    },
  }
}

/**
 * Detects cycles in the task graph using DFS.
 */
function hasCycle(tasks) {
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const visited = new Set()
  const recStack = new Set()

  function dfs(taskId) {
    if (!taskMap.has(taskId)) return false
    if (recStack.has(taskId)) return true
    if (visited.has(taskId)) return false

    visited.add(taskId)
    recStack.add(taskId)

    const task = taskMap.get(taskId)
    for (const depId of task.dependsOn) {
      if (dfs(depId)) return true
    }

    recStack.delete(taskId)
    return false
  }

  for (const task of tasks) {
    if (dfs(task.id)) return true
  }
  return false
}

/**
 * Calculates maximum theoretical parallelism (width of widest wave).
 */
function calculateMaxParallelism(tasks) {
  const waves = resolveTaskWaves(tasks.map(t => ({
    id: t.id,
    depends_on: t.dependsOn,
  })))
  return Math.max(...waves.map(w => w.length), 1)
}

/**
 * Updates a task's status and result.
 * @param {object} dag
 * @param {string} taskId
 * @param {string} status
 * @param {object} result
 * @param {string} error
 * @returns {object} Updated DAG
 */
export function updateTaskDagItem(dag, taskId, status, result = null, error = null) {
  const task = dag.tasks.find(t => t.id === taskId)
  if (!task) return dag

  task.status = status
  if (result !== null) task.result = result
  if (error !== null) task.error = error
  
  if (status === TASK_STATUS.IN_PROGRESS && !task.startedAt) {
    task.startedAt = Date.now()
  }
  if ((status === TASK_STATUS.COMPLETED || status === TASK_STATUS.FAILED) && !task.completedAt) {
    task.completedAt = Date.now()
  }

  dag.updatedAt = Date.now()
  dag.version++
  return dag
}

/**
 * Gets all tasks ready to execute (dependencies satisfied, not started).
 * @param {object} dag
 * @returns {Array<object>} Ready tasks
 */
export function getReadyTasks(dag) {
  const completedIds = new Set(
    dag.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).map(t => t.id)
  )
  
  return dag.tasks.filter(t => {
    if (t.status !== TASK_STATUS.PENDING) return false
    return t.dependsOn.every(depId => completedIds.has(depId))
  })
}

/***
 * Compiles the DAG into executable waves for spawnAgentsTool.
 * Each wave contains tasks that can run in parallel.
 * @param {object} dag
 * @returns {Array<Array<object>>} Waves of tasks with enriched context
 */
export function compileTaskDagToWaves(dag) {
  // Prepare tasks for dagResolver
  const resolverTasks = dag.tasks.map(t => ({
    id: t.id,
    agent: t.agent || 'agent_worker',
    task: t.description,
    depends_on: t.dependsOn,
    estimatedTokens: t.estimatedTokens,
    toolBudget: t.toolBudget,
    checkpointArtifacts: t.checkpointArtifacts,
  }))

  const waves = resolveTaskWaves(resolverTasks)
  
  // Assign wave numbers to tasks
  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    for (const waveTask of waves[waveIdx]) {
      const dagTask = dag.tasks.find(t => t.id === waveTask.id)
      if (dagTask) dagTask.assignedWave = waveIdx
    }
  }

  dag.updatedAt = Date.now()
  dag.version++
  return waves
}

/***
 * Enriches a task with upstream results from completed dependencies.
 * @param {object} dag
 * @param {string} taskId
 * @returns {string} Enriched task description
 */
export function enrichTaskWithDagContext(dag, taskId) {
  const task = dag.tasks.find(t => t.id === taskId)
  if (!task) return ''

  const resultsById = new Map()
  for (const t of dag.tasks) {
    if (t.status === TASK_STATUS.COMPLETED && t.result) {
      resultsById.set(t.id, {
        agent: t.agent || 'worker',
        role: t.role || 'worker',
        result: t.result,
      })
    }
  }

  return enrichTaskWithUpstream(
    { task: task.description },
    task.dependsOn,
    resultsById
  )
}

/***
 * Renders DAG as markdown for system prompt injection.
 * @param {object} dag
 * @returns {string} Markdown string
 */
export function renderTaskDagPrompt(dag) {
  if (!dag || !Array.isArray(dag.tasks) || dag.tasks.length === 0) return ''

  const lines = [
    `# ACTIVE TASK DAG: ${dag.title}`,
    `This DAG is your persistent ground truth. Execute tasks respecting dependencies.`,
    `Total: ${dag.tasks.length} tasks | Est. tokens: ${dag.metadata?.totalEstimatedTokens || 0} | Max parallelism: ${dag.metadata?.maxParallelism || 1}`,
    ``,
  ]

  // Group by wave for visual clarity
  const waves = compileTaskDagToWaves(dag)
  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    lines.push(`## Wave ${waveIdx + 1} (Parallel)`)
    for (const waveTask of waves[waveIdx]) {
      const dagTask = dag.tasks.find(t => t.id === waveTask.id)
      if (!dagTask) continue
      
      let icon = '[ ]'
      if (dagTask.status === TASK_STATUS.COMPLETED) icon = '[x]'
      else if (dagTask.status === TASK_STATUS.IN_PROGRESS) icon = '[-]'
      else if (dagTask.status === TASK_STATUS.FAILED) icon = '[!]'
      else if (dagTask.status === TASK_STATUS.SKIPPED) icon = '[~]'

      const deps = dagTask.dependsOn.length ? ` ← depends on: ${dagTask.dependsOn.join(', ')}` : ''
      lines.push(`- ${icon} **${dagTask.id}**: ${dagTask.description}${deps}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/***
 * Serializes DAG to JSON for persistence.
 * @param {object} dag
 * @returns {string} JSON string
 */
export function serializeTaskDag(dag) {
  return JSON.stringify(dag, null, 2)
}

/***
 * Parses JSON back into DAG object.
 * @param {string} json
 * @returns {object} DAG object
 */
export function parseTaskDag(json) {
  const dag = JSON.parse(json)
  // Ensure all tasks have required fields
  for (const task of dag.tasks) {
    task.status = task.status || TASK_STATUS.PENDING
    task.dependsOn = task.dependsOn || []
    task.estimatedTokens = task.estimatedTokens || 4000
    task.toolBudget = task.toolBudget || 20
    task.checkpointArtifacts = task.checkpointArtifacts || []
  }
  return dag
}

/***
 * Persists DAG to localStorage for crash/restart recovery.
 * @param {string} conversationId
 * @param {object} dag
 */
export function saveTaskDagToStorage(conversationId = 'default', dag = null) {
  if (!dag) return
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${STORAGE_PREFIX}${conversationId}`, serializeTaskDag(dag))
    }
  } catch {}
}

/***
 * Loads persisted DAG for a conversation.
 * @param {string} conversationId
 * @returns {object|null}
 */
export function loadTaskDagFromStorage(conversationId = 'default') {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${conversationId}`)
      if (raw) return parseTaskDag(raw)
    }
  } catch {}
  return null
}

/***
 * Clears persisted DAG.
 * @param {string} conversationId
 */
export function clearTaskDagStorage(conversationId = 'default') {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${STORAGE_PREFIX}${conversationId}`)
    }
  } catch {}
}

/***
 * Gets pending mission summary for UI display.
 * @param {string} conversationId
 * @returns {object|null}
 */
export function getPendingDagMission(conversationId = 'default') {
  const dag = loadTaskDagFromStorage(conversationId)
  if (!dag || !Array.isArray(dag.tasks) || !dag.tasks.length) return null

  const completed = dag.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length
  const failed = dag.tasks.filter(t => t.status === TASK_STATUS.FAILED).length
  const inProgress = dag.tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length
  const remaining = dag.tasks.length - completed - failed

  return {
    hasPending: remaining > 0 || inProgress > 0,
    total: dag.tasks.length,
    completed,
    failed,
    inProgress,
    remaining,
    title: dag.title,
    tasks: dag.tasks,
    metadata: dag.metadata,
  }
}

/***
 * Creates a DAG from a natural language objective using a planner agent.
 * This is the main entry point for autonomous planning.
 * @param {string} objective
 * @param {object} context - Additional context (workspace, user preferences, etc.)
 * @returns {Promise<object>} Created DAG
 */
export async function planObjectiveToDag(objective, context = {}) {
  const { spawnAgentsTool } = await import('./tools/spawnAgents')
  
  const plannerPrompt = `You are an expert task planner. Decompose this objective into a DAG of specific, executable sub-tasks.

OBJECTIVE: ${objective}

CONTEXT:
${JSON.stringify(context, null, 2)}

Return a JSON object with:
- title: string
- tasks: array of objects, each with:
  - id: unique string identifier
  - description: clear, self-contained instruction for a specialist agent
  - agent: specialist role (researcher, coder, writer, analyst, planner, qa_tester)
  - depends_on: array of task IDs that must complete first (empty for root tasks)
  - estimated_tokens: rough token estimate (default 4000)
  - tool_budget: max tool calls for this task (default 20)
  - checkpoint_artifacts: files/artifacts this task should produce for resumability

Rules:
- Maximize parallelism: independent tasks should have no depends_on
- Keep tasks focused: one clear deliverable per task
- 3-8 tasks typical for complex objectives
- Use standard agent roles: researcher, coder, writer, analyst, planner, qa_tester

Output ONLY valid JSON.`

  const result = await spawnAgentsTool.execute({
    tasks: [{
      id: 'plan_dag',
      agent: 'agent_planner',
      task: plannerPrompt,
    }],
    isolate_workspace: true,
  })

  try {
    const planData = JSON.parse(result.results?.[0]?.output || '{}')
    return createTaskDag(planData.title, planData.tasks)
  } catch (e) {
    // Fallback: simple linear plan
    return createTaskDag(objective, [
      { id: 'research', description: `Research and gather information for: ${objective}`, agent: 'agent_researcher', dependsOn: [], estimatedTokens: 6000, toolBudget: 30 },
      { id: 'execute', description: `Execute core implementation for: ${objective}`, agent: 'agent_coder', dependsOn: ['research'], estimatedTokens: 8000, toolBudget: 40 },
      { id: 'verify', description: `Verify and test outputs for: ${objective}`, agent: 'agent_qa_tester', dependsOn: ['execute'], estimatedTokens: 4000, toolBudget: 20 },
    ])
  }
}

/***
 * Persists DAG to IndexedDB for durable cross-session storage.
 * @param {string} conversationId
 * @param {object} dag
 */
export async function persistTaskDag(conversationId = 'default', dag) {
  const dbInstance = await db
  await dbInstance.table('task_dags').put({
    conversationId,
    dag: serializeTaskDag(dag),
    updatedAt: Date.now(),
  })
}

/***
 * Loads DAG from IndexedDB.
 * @param {string} conversationId
 * @returns {object|null}
 */
export async function loadPersistedTaskDag(conversationId = 'default') {
  const dbInstance = await db
  const record = await dbInstance.table('task_dags').where('conversationId').equals(conversationId).first()
  if (record) return parseTaskDag(record.dag)
  return null
}
