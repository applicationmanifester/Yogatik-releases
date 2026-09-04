import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('Workspace Time Machine Snapshots & Rollbacks', () => {
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
