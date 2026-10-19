import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── [proactive-scheduler] ── scheduler.js has NO in-memory fallback (unlike
// its neighbours' modules), so the drain-i ticker tests give it the same fake
// settings table the ScheduledPanel tests use (REAL getSetting semantics).
const { rows } = vi.hoisted(() => ({ rows: new Map() }))
vi.mock('./db', () => ({
  getSetting: async (k, fallback = null) => {
    const v = rows.has(k) ? rows.get(k) : null
    return v != null ? v : fallback
  },
  setSetting: async (k, v) => { rows.set(k, v) },
}))

import {
  recordSnapshot,
  listSnapshots,
  getSnapshotById,
  rollbackSnapshot,
  clearSnapshots,
} from './workspaceTimeMachine'
import {
  backgroundWorkers,
  backgroundTaskSpawnTool,
  TASK_STATUS,
} from './backgroundWorkers'
import { scheduleWorkflow, getScheduledTasks, SCHEDULE_KIND } from './scheduler'

describe('Workspace Time Machine Snapshots & Rollbacks', () => {
  beforeEach(() => rows.clear())

  beforeEach(async () => {
    await clearSnapshots()
  })

  it('records atomic snapshots before modifications', async () => {
    const snap = await recordSnapshot({
      filePath: 'src/tools/index.js',
      previousContent: 'const a = 1;',
      newContent: 'const a = 2;',
      toolName: 'fs_edit',
    })

    expect(snap).toBeDefined()
    expect(snap.filePath).toBe('src/tools/index.js')
    expect(snap.previousContent).toBe('const a = 1;')

    const all = await listSnapshots()
    expect(all.length).toBe(1)
    expect(all[0].id).toBe(snap.id)
  })

  it('rolls back file using provided filesystem writer function', async () => {
    const snap = await recordSnapshot({
      filePath: 'src/config.json',
      previousContent: '{"mode": "safe"}',
      newContent: '{"mode": "unsafe"}',
      toolName: 'fs_write',
    })

    const mockWriter = vi.fn().mockResolvedValue(true)
    const result = await rollbackSnapshot(snap.id, mockWriter)

    expect(result.success).toBe(true)
    expect(mockWriter).toHaveBeenCalledWith({
      path: 'src/config.json',
      content: '{"mode": "safe"}',
    })
  })
})

describe('Background Worker Pool & Task Delegation', () => {
  it('spawns and completes background tasks with progress tracking', async () => {
    const task = await backgroundWorkers.spawnTask({
      title: 'Security Vulnerability Scan',
      taskType: 'code_audit',
      agentPersona: 'Auditor',
      payload: { target: 'src/' },
      executorFn: async (payload, { onProgress }) => {
        onProgress(50, 'Halfway done')
        return { vulnerabilitiesFound: 0 }
      },
    })

    expect(task.id).toBeDefined()
    expect(task.status).toBe(TASK_STATUS.RUNNING)

    // Wait for background execution to settle
    let found
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50))
      const tasks = await backgroundWorkers.getAllTasks()
      found = tasks.find((t) => t.id === task.id)
      if (found?.status === TASK_STATUS.COMPLETED) break
    }
    expect(found.status).toBe(TASK_STATUS.COMPLETED)
    expect(found.result).toEqual({ vulnerabilitiesFound: 0 })
  })

  it('executes backgroundTaskSpawnTool and returns structured ID', async () => {
    const res = await backgroundTaskSpawnTool.execute({
      title: 'Analyze Performance Benchmarks',
      instruction: 'Benchmark latency across 100 queries',
    })

    expect(res.success).toBe(true)
    expect(res.taskId).toBeDefined()
    expect(res.message).toContain('Analyze Performance Benchmarks')
  })
})

// ── [proactive-scheduler] ── what App's 10s/60s/visibility beat actually does:
// drain due schedules through the injected runWorkflowById (the manual run's
// own seam, runWorkflowCore) and let the store stop remembering a spent one-off.
describe('Scheduled workflow drain (ticker wiring)', () => {
  beforeEach(() => rows.clear())

  it('runs a due schedule once, spawns a scheduled_workflow task, marks it run', async () => {
    const startedAt = Date.now()
    const rec = await scheduleWorkflow({
      workflowId: 'wf_drain_probe',
      name: 'Drain Probe',
      spec: { kind: SCHEDULE_KIND.ONCE, at: startedAt - 5000 },
    })
    const runById = vi.fn(async (workflowId, payload) => {
      expect(workflowId).toBe('wf_drain_probe')
      expect(payload).toMatchObject({ workflowId: 'wf_drain_probe', scheduleId: rec.id })
      return [{ prompt: 'step 1', output: 'probe done' }]
    })

    const { due, spawned } = await backgroundWorkers.drainDueSchedules({ runWorkflowById: runById })
    expect(due).toBe(1)
    expect(spawned).toBe(1)
    expect(runById).toHaveBeenCalledTimes(1)

    // The schedule itself was marked run: runCount bumped, one-off nextDue spent.
    const after = (await getScheduledTasks()).find((t) => t.id === rec.id)
    expect(after.runCount).toBe(1)
    expect(after.nextDue).toBe(Infinity)
    const second = await backgroundWorkers.drainDueSchedules({ runWorkflowById: runById })
    expect(second.due).toBe(0) // nothing re-fires

    // Wait for the spawned executor to settle like the surrounding worker tests.
    let task
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50))
      const all = await backgroundWorkers.getAllTasks()
      task = all.find((t) => t.taskType === 'scheduled_workflow' && t.payload?.scheduleId === rec.id)
      if (task?.status === TASK_STATUS.COMPLETED) break
    }
    expect(task?.title).toBe('Scheduled: Drain Probe')
    expect(task?.status).toBe(TASK_STATUS.COMPLETED)
    expect(task?.result).toEqual([{ prompt: 'step 1', output: 'probe done' }])
  }, 20000)

  it('never spawns for an already-run one-off (spent schedule stays spent)', async () => {
    rows.clear()
    const rec = await scheduleWorkflow({
      workflowId: 'wf_drain_spent',
      name: 'Spent',
      spec: { kind: SCHEDULE_KIND.ONCE, at: Date.now() - 1000 },
    })
    const runById = vi.fn(async () => [])
    await backgroundWorkers.drainDueSchedules({ runWorkflowById: runById })
    const spent = (await getScheduledTasks()).find((t) => t.id === rec.id)
    expect(spent.nextDue).toBe(Infinity)
    const again = await backgroundWorkers.drainDueSchedules({ runWorkflowById: runById })
    expect(again.due).toBe(0)
    const calls = runById.mock.calls.filter(([, p]) => p?.scheduleId === rec.id)
    expect(calls.length).toBe(1)
  }, 20000)
})
