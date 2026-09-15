import { describe, it, expect, vi } from 'vitest'
import { AgentSwarm, SWARM_ROLES, TASK_STATUS } from './agentSwarm'
import { AgentBlackboard } from './agentBlackboard'

describe('AgentSwarm Coordinator & Self-Healing', () => {
  it('instantiates cleanly with configured concurrency and fresh blackboard', () => {
    const bb = new AgentBlackboard('test-session')
    const swarm = new AgentSwarm({ sessionId: 'test-session', blackboard: bb, concurrencyLimit: 4 })

    expect(swarm.sessionId).toBe('test-session')
    expect(swarm.concurrencyLimit).toBe(4)
    expect(swarm.blackboard).toBe(bb)
    expect(swarm.status).toBe('idle')
  })

  it('executes a linear DAG and records facts across tasks', async () => {
    const swarm = new AgentSwarm({ concurrencyLimit: 2 })

    swarm.addTask({
      id: 'step1',
      description: 'Find market size',
      role: SWARM_ROLES.WORKER,
      action: async ({ blackboard }) => {
        blackboard.setFact('market_size_usd', 15000000000, 'worker')
        return { size: 15e9 }
      },
    })

    swarm.addTask({
      id: 'step2',
      description: 'Compute market share',
      role: SWARM_ROLES.CODER,
      dependsOn: ['step1'],
      action: async ({ blackboard }) => {
        const size = blackboard.getFact('market_size_usd')
        const share = size * 0.05
        blackboard.setFact('projected_share', share, 'coder')
        return { projected: share }
      },
    })

    const summary = await swarm.run()

    expect(summary.status).toBe('completed')
    expect(swarm.blackboard.getFact('market_size_usd')).toBe(15000000000)
    expect(swarm.blackboard.getFact('projected_share')).toBe(750000000)
    expect(summary.results.step1).toEqual({ size: 15e9 })
    expect(summary.results.step2).toEqual({ projected: 750000000 })
  })

  it('runs parallel tasks concurrently when dependencies are met', async () => {
    const swarm = new AgentSwarm({ concurrencyLimit: 3 })
    const timestamps = []

    swarm.addTask({
      id: 'p1',
      description: 'Parallel 1',
      action: async () => {
        timestamps.push({ id: 'p1', t: Date.now() })
        return 'res1'
      },
    })

    swarm.addTask({
      id: 'p2',
      description: 'Parallel 2',
      action: async () => {
        timestamps.push({ id: 'p2', t: Date.now() })
        return 'res2'
      },
    })

    swarm.addTask({
      id: 'join',
      description: 'Join results',
      dependsOn: ['p1', 'p2'],
      action: async ({ results }) => {
        return `${results.get('p1')}+${results.get('p2')}`
      },
    })

    const summary = await swarm.run()
    expect(summary.status).toBe('completed')
    expect(summary.results.join).toBe('res1+res2')
  })

  it('triggers self-healing loop and succeeds on retry', async () => {
    const swarm = new AgentSwarm({ maxRetries: 2 })
    let attempts = 0

    swarm.addTask({
      id: 'flaky_task',
      description: 'Flaky task that recovers',
      action: async ({ isRetry }) => {
        attempts++
        if (!isRetry) {
          throw new Error('Transient compilation error')
        }
        return { recovered: true }
      },
    })

    const healingEvents = []
    swarm.subscribe(({ event, ...rest }) => {
      if (event === 'task_healing') healingEvents.push(rest)
    })

    const summary = await swarm.run()

    expect(summary.status).toBe('completed')
    expect(attempts).toBe(2)
    expect(healingEvents.length).toBe(1)
    expect(healingEvents[0].attempt).toBe(1)
    expect(healingEvents[0].previousError).toContain('Transient compilation error')
    expect(summary.results.flaky_task).toEqual({ recovered: true })
  })

  it('handles validation failure via self-healing', async () => {
    const swarm = new AgentSwarm({ maxRetries: 2 })
    let callCount = 0

    swarm.addTask({
      id: 'strict_task',
      description: 'Requires valid output schema',
      action: async () => {
        callCount++
        return { count: callCount }
      },
      validator: async (output) => {
        // Only accept if count >= 2
        return {
          valid: output.count >= 2,
          reason: output.count < 2 ? 'Count too low' : null,
        }
      },
    })

    const summary = await swarm.run()
    expect(summary.status).toBe('completed')
    expect(callCount).toBe(2)
    expect(summary.results.strict_task).toEqual({ count: 2 })
  })

  it('marks dependent tasks as skipped if upstream prerequisite permanently fails', async () => {
    const swarm = new AgentSwarm({ maxRetries: 0 })

    swarm.addTask({
      id: 'bad_dep',
      description: 'Will fail permanently',
      action: async () => {
        throw new Error('Fatal unrecoverable error')
      },
    })

    swarm.addTask({
      id: 'blocked_child',
      description: 'Should never run',
      dependsOn: ['bad_dep'],
      action: async () => 'should_not_run',
    })

    const summary = await swarm.run()
    expect(summary.status).toBe('failed')

    const childTask = swarm.tasks.get('blocked_child')
    expect(childTask.status).toBe(TASK_STATUS.SKIPPED)
  })

  it('plans high-level objective using default DAG generator', async () => {
    const swarm = new AgentSwarm()
    await swarm.planObjective('Build private legal NDA review workflow')

    expect(swarm.tasks.has('plan')).toBe(true)
    expect(swarm.tasks.has('execute')).toBe(true)
    expect(swarm.tasks.has('verify')).toBe(true)

    const summary = await swarm.run()
    expect(summary.status).toBe('completed')
    expect(swarm.blackboard.getFact('objective')).toBe('Build private legal NDA review workflow')
  })
})
