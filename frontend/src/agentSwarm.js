/**
 * agentSwarm.js — Sovereign Multi-Agent Swarm Coordinator with Self-Healing Loops.
 *
 * Coordinates specialized sub-agents (Planner, Coder, Critic, QA) over AgentBlackboard.
 * Features:
 * - Deterministic Task Graph (DAG) scheduling with parallel dependency resolution
 * - Concurrency gating (1-8 concurrent workers, default 2)
 * - Self-healing error recovery loop on task failures
 * - Complete telemetry and event emitters for UI observability
 */

import { AgentBlackboard, getSessionBlackboard } from './agentBlackboard'

export const SWARM_ROLES = {
  PLANNER: 'planner',
  CODER: 'coder',
  WORKER: 'worker',
  CRITIC: 'critic',
  QA_TESTER: 'qa_tester',
}

export const TASK_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  HEALING: 'healing',
  SKIPPED: 'skipped',
}

export class AgentSwarm {
  constructor(options = {}) {
    this.sessionId = options.sessionId || `swarm-${Date.now()}`
    this.blackboard = options.blackboard || getSessionBlackboard(this.sessionId)
    this.concurrencyLimit = Math.max(1, Math.min(8, options.concurrencyLimit || 2))
    this.maxRetries = Math.max(0, options.maxRetries ?? 2)
    this.tasks = new Map() // id -> task definition
    this.results = new Map() // id -> task result
    this.listeners = new Set()
    this.status = 'idle' // 'idle' | 'running' | 'completed' | 'failed'
    this.customExecutor = options.executor || null
  }

  /**
   * Subscribe to swarm execution events
   */
  subscribe(callback) {
    if (typeof callback !== 'function') return () => {}
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  emit(event, payload = {}) {
    for (const listener of this.listeners) {
      try {
        listener({ event, sessionId: this.sessionId, timestamp: Date.now(), ...payload })
      } catch (err) {
        console.warn('Swarm listener error:', err)
      }
    }
  }

  /**
   * Add a task to the swarm DAG
   */
  addTask({ id, description, role = SWARM_ROLES.WORKER, dependsOn = [], action, validator = null }) {
    if (!id || typeof id !== 'string') throw new Error('Task must have a valid string id')
    if (!description) throw new Error('Task must have a description')

    const task = {
      id,
      description,
      role,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      action: typeof action === 'function' ? action : null,
      validator: typeof validator === 'function' ? validator : null,
      status: TASK_STATUS.PENDING,
      retries: 0,
      error: null,
      result: null,
      startedAt: null,
      completedAt: null,
    }

    this.tasks.set(id, task)
    return this
  }

  /**
   * Helper: decomposes an objective into a standard plan if no explicit tasks added
   */
  async planObjective(objective, customPlanner = null) {
    this.emit('planning_start', { objective })

    if (typeof customPlanner === 'function') {
      const generatedTasks = await customPlanner(objective, this.blackboard)
      for (const t of generatedTasks) {
        this.addTask(t)
      }
    } else {
      // Built-in resilient default DAG template
      this.addTask({
        id: 'plan',
        description: `Analyze objective: ${objective}`,
        role: SWARM_ROLES.PLANNER,
        action: async (ctx) => {
          ctx.blackboard.setFact('objective', objective, SWARM_ROLES.PLANNER)
          ctx.blackboard.appendNote(`Deconstructed objective: ${objective}`, SWARM_ROLES.PLANNER)
          return { planned: true, objective }
        },
      })

      this.addTask({
        id: 'execute',
        description: `Execute core implementation for: ${objective}`,
        role: SWARM_ROLES.CODER,
        dependsOn: ['plan'],
        action: async (ctx) => {
          ctx.blackboard.setFact('execution_status', 'in_progress', SWARM_ROLES.CODER)
          return { executed: true }
        },
      })

      this.addTask({
        id: 'verify',
        description: `Verify and critique outputs against: ${objective}`,
        role: SWARM_ROLES.QA_TESTER,
        dependsOn: ['execute'],
        action: async (ctx) => {
          const planFact = ctx.blackboard.getFact('objective')
          return { verified: true, verifiedFor: planFact }
        },
      })
    }

    this.emit('planning_complete', { taskCount: this.tasks.size })
    return Array.from(this.tasks.values())
  }

  /**
   * Execute the full DAG with self-healing and concurrency control
   */
  async run() {
    this.status = 'running'
    this.emit('swarm_start', { taskCount: this.tasks.size })

    const inFlight = new Set()

    try {
      while (this.hasUnfinishedTasks()) {
        const readyTasks = this.getReadyTasks().filter(t => !inFlight.has(t.id))

        if (readyTasks.length === 0 && inFlight.size === 0) {
          // Deadlock or remaining tasks have unresolvable failed dependencies
          const uncompleted = Array.from(this.tasks.values()).filter(
            t => t.status !== TASK_STATUS.COMPLETED && t.status !== TASK_STATUS.SKIPPED
          )
          for (const t of uncompleted) {
            t.status = TASK_STATUS.SKIPPED
            t.error = 'Skipped due to dependency failure'
          }
          break
        }

        // Fill pool up to concurrency limit
        const availableSlots = this.concurrencyLimit - inFlight.size
        const batch = readyTasks.slice(0, Math.max(0, availableSlots))

        if (batch.length === 0) {
          // Wait for any in-flight task to complete
          await Promise.race(Array.from(inFlight).map(id => this.tasks.get(id).promise))
          continue
        }

        for (const task of batch) {
          inFlight.add(task.id)
          task.status = TASK_STATUS.RUNNING
          task.startedAt = Date.now()
          this.emit('task_start', { taskId: task.id, role: task.role, description: task.description })

          task.promise = this.executeTaskWithSelfHealing(task)
            .then(result => {
              task.status = TASK_STATUS.COMPLETED
              task.completedAt = Date.now()
              task.result = result
              this.results.set(task.id, result)
              this.blackboard.setFact(`task_result_${task.id}`, result, task.role)
              this.emit('task_completed', { taskId: task.id, result })
            })
            .catch(err => {
              task.status = TASK_STATUS.FAILED
              task.completedAt = Date.now()
              task.error = err.message || String(err)
              this.emit('task_failed', { taskId: task.id, error: task.error })
            })
            .finally(() => {
              inFlight.delete(task.id)
            })
        }

        // Wait for at least one to finish before checking the loop again
        if (inFlight.size > 0) {
          await Promise.race(Array.from(inFlight).map(id => this.tasks.get(id).promise))
        }
      }

      const allSuccess = Array.from(this.tasks.values()).every(
        t => t.status === TASK_STATUS.COMPLETED
      )
      this.status = allSuccess ? 'completed' : 'failed'

      const summary = {
        sessionId: this.sessionId,
        status: this.status,
        tasks: Array.from(this.tasks.values()).map(t => ({
          id: t.id,
          status: t.status,
          retries: t.retries,
          error: t.error,
          duration: t.completedAt && t.startedAt ? t.completedAt - t.startedAt : 0,
        })),
        results: Object.fromEntries(this.results.entries()),
      }

      this.emit('swarm_complete', summary)
      return summary
    } catch (criticalErr) {
      this.status = 'failed'
      this.emit('swarm_critical_error', { error: criticalErr.message })
      throw criticalErr
    }
  }

  /**
   * Internal runner with self-healing retry loop
   */
  async executeTaskWithSelfHealing(task) {
    let attempt = 0
    let lastError = null

    while (attempt <= this.maxRetries) {
      try {
        if (attempt > 0) {
          task.status = TASK_STATUS.HEALING
          task.retries = attempt
          this.emit('task_healing', {
            taskId: task.id,
            attempt,
            previousError: lastError?.message || String(lastError),
          })
          this.blackboard.appendNote(
            `Self-healing attempt ${attempt}/${this.maxRetries} for task "${task.id}" after: ${lastError?.message}`,
            SWARM_ROLES.CRITIC
          )
        }

        const context = {
          task,
          blackboard: this.blackboard,
          results: this.results,
          isRetry: attempt > 0,
          previousError: lastError,
        }

        let output
        if (task.action) {
          output = await task.action(context)
        } else if (this.customExecutor) {
          output = await this.customExecutor(task, context)
        } else {
          output = { message: `Task ${task.id} executed successfully by default executor.` }
        }

        // Run validation check if provided
        if (task.validator) {
          const validation = await task.validator(output, context)
          if (validation && validation.valid === false) {
            throw new Error(validation.reason || 'Task validation failed')
          }
        }

        return output
      } catch (err) {
        lastError = err
        attempt++
        if (attempt > this.maxRetries) {
          throw lastError
        }
      }
    }
    throw lastError
  }

  /**
   * Check if any tasks are still in progress or waiting
   */
  hasUnfinishedTasks() {
    return Array.from(this.tasks.values()).some(
      t => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING || t.status === TASK_STATUS.HEALING
    )
  }

  /**
   * Identify tasks whose dependencies have all completed successfully
   */
  getReadyTasks() {
    const ready = []
    for (const task of this.tasks.values()) {
      if (task.status !== TASK_STATUS.PENDING) continue

      const depsMet = task.dependsOn.every(depId => {
        const dep = this.tasks.get(depId)
        return dep && dep.status === TASK_STATUS.COMPLETED
      })

      if (depsMet) {
        ready.push(task)
      }
    }
    return ready
  }

  /**
   * Reset swarm for re-execution
   */
  reset() {
    this.status = 'idle'
    this.results.clear()
    for (const task of this.tasks.values()) {
      task.status = TASK_STATUS.PENDING
      task.retries = 0
      task.error = null
      task.result = null
      task.startedAt = null
      task.completedAt = null
      delete task.promise
    }
  }
}
