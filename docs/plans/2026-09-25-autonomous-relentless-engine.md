# Autonomous Relentless Engine (Retry, Reconnect, Rework) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Yogatik into an autonomous superpower engine that relentlessly retries on network drops/rate limits, reconnects with exponential backoff & hot provider failovers, and reworks code through continuous closed-loop TDD verification until all tasks pass or the user explicitly clicks Stop.

**Architecture:** A three-tiered resilient cognitive architecture: (1) `ResilientTransport` wrapping LLM streams with jittered backoff, rate-limit queueing, and fallback routing; (2) `RelentlessReworkEngine` driving closed-loop execution, AST error extraction, and anti-stagnation heuristics; and (3) Disk-Backed Working Memory (`.yogatik/TASK_PLAN.md`) maintaining persistent task DAGs across massive compaction horizons.

**Tech Stack:** JavaScript (ES modules), Vitest for unit testing, Vite, Electron IPC, Web Streams API, AbortController.

---

### Task 1: Resilient Transport Layer (Auto-Retry, Backoff & Reconnect)

**Files:**
- Create: `frontend/src/resilientTransport.js`
- Test: `frontend/src/resilientTransport.test.js`
- Modify: `frontend/src/llm.js:560-600`

**Step 1: Write the failing unit tests for resilient transport**

```javascript
// frontend/src/resilientTransport.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateBackoffWithJitter, isTransientError, executeWithRetry } from './resilientTransport'

describe('ResilientTransport', () => {
  it('calculates exponential backoff with jitter bounded by maxDelay', () => {
    const delay0 = calculateBackoffWithJitter(0, { baseDelay: 1000, maxDelay: 10000, jitterRatio: 0 })
    expect(delay0).toBe(1000)

    const delay3 = calculateBackoffWithJitter(3, { baseDelay: 1000, maxDelay: 10000, jitterRatio: 0 })
    expect(delay3).toBe(8000)

    const delayCapped = calculateBackoffWithJitter(10, { baseDelay: 1000, maxDelay: 10000, jitterRatio: 0 })
    expect(delayCapped).toBe(10000)
  })

  it('correctly classifies transient errors (429, 502, 503, 504, network drop, timeout)', () => {
    expect(isTransientError({ status: 429 })).toBe(true)
    expect(isTransientError({ status: 503 })).toBe(true)
    expect(isTransientError(new Error('fetch failed'))).toBe(true)
    expect(isTransientError(new Error('ECONNRESET'))).toBe(true)
    expect(isTransientError({ status: 401 })).toBe(false)
    expect(isTransientError({ name: 'AbortError' })).toBe(false)
  })

  it('retries transient failures until success and reports status to onRetry hook', async () => {
    let attempts = 0
    const onRetry = vi.fn()
    const operation = async () => {
      attempts++
      if (attempts < 3) {
        const err = new Error('503 Service Unavailable')
        err.status = 503
        throw err
      }
      return 'success'
    }

    const result = await executeWithRetry(operation, {
      maxRetries: 5,
      baseDelay: 10,
      maxDelay: 50,
      onRetry,
    })

    expect(result).toBe('success')
    expect(attempts).toBe(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('immediately respects AbortController signal without retrying', async () => {
    const controller = new AbortController()
    controller.abort()

    const operation = vi.fn().mockRejectedValue(new Error('Network drop'))
    await expect(executeWithRetry(operation, { signal: controller.signal, baseDelay: 10 })).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run frontend/src/resilientTransport.test.js`
Expected: FAIL (`Cannot find module './resilientTransport'`)

**Step 3: Implement minimal ResilientTransport module**

```javascript
// frontend/src/resilientTransport.js
export function calculateBackoffWithJitter(attempt, { baseDelay = 1000, maxDelay = 15000, jitterRatio = 0.2 } = {}) {
  const exp = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))
  if (jitterRatio <= 0) return exp
  const jitter = exp * jitterRatio * (Math.random() * 2 - 1)
  return Math.min(maxDelay, Math.max(baseDelay, Math.round(exp + jitter)))
}

export function isTransientError(err) {
  if (!err) return false
  if (err.name === 'AbortError') return false
  const status = Number(err.status || err.statusCode)
  if ([408, 429, 500, 502, 503, 504, 520, 522, 524].includes(status)) return true
  const msg = String(err.message || err).toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network error') ||
    msg.includes('stream stalled') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('capacity spikes')
  )
}

export async function executeWithRetry(operation, {
  maxRetries = 10,
  baseDelay = 1000,
  maxDelay = 15000,
  jitterRatio = 0.2,
  signal = null,
  onRetry = null,
} = {}) {
  let attempt = 0
  while (true) {
    if (signal?.aborted) {
      const abortErr = new Error('Operation aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    try {
      return await operation(attempt)
    } catch (err) {
      if (signal?.aborted || err.name === 'AbortError') throw err
      if (!isTransientError(err) || attempt >= maxRetries) {
        throw err
      }
      attempt++
      const delay = calculateBackoffWithJitter(attempt, { baseDelay, maxDelay, jitterRatio })
      onRetry?.({ attempt, maxRetries, delay, error: err })
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          const abortErr = new Error('Operation aborted')
          abortErr.name = 'AbortError'
          reject(abortErr)
        }, { once: true })
      })
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run frontend/src/resilientTransport.test.js`
Expected: PASS (4 tests passed)

**Step 5: Integrate into `streamChat` in `frontend/src/llm.js`**

Modify: `frontend/src/llm.js` to wrap HTTP calls with `executeWithRetry` and inform `onStatus` during reconnection attempts.

---

### Task 2: Autonomous Relentless Rework Loop & Anti-Stagnation Engine

**Files:**
- Create: `frontend/src/relentlessLoop.js`
- Test: `frontend/src/relentlessLoop.test.js`
- Modify: `frontend/src/agent.js:1300-1450`

**Step 1: Write failing tests for Relentless Rework & Anti-Stagnation**

```javascript
// frontend/src/relentlessLoop.test.js
import { describe, it, expect } from 'vitest'
import {
  createExecutionTracker,
  recordExecutionOutcome,
  detectStagnation,
  buildReworkFeedbackMessage
} from './relentlessLoop'

describe('RelentlessReworkLoop', () => {
  it('tracks execution outcomes and detects stagnation after 3 identical failures', () => {
    const tracker = createExecutionTracker({ stagnationThreshold: 3 })

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'TypeError: x is not a function' })
    expect(detectStagnation(tracker)).toBe(false)

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'TypeError: x is not a function' })
    expect(detectStagnation(tracker)).toBe(false)

    recordExecutionOutcome(tracker, { action: 'terminal_run', command: 'npm test', error: 'TypeError: x is not a function' })
    expect(detectStagnation(tracker)).toBe(true)
  })

  it('builds clear diagnostic feedback directive to instruct model to pivot on failure', () => {
    const tracker = createExecutionTracker()
    recordExecutionOutcome(tracker, {
      action: 'test_and_heal',
      diagnostics: 'FAIL src/math.test.js > add: expected 5 to be 4',
      exitCode: 1,
    })

    const msg = buildReworkFeedbackMessage(tracker, { isStagnant: true })
    expect(msg).toContain('AUTONOMOUS REWORK DIRECTIVE')
    expect(msg).toContain('STAGNATION DETECTED')
    expect(msg).toContain('FAIL src/math.test.js')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run frontend/src/relentlessLoop.test.js`
Expected: FAIL (`Cannot find module './relentlessLoop'`)

**Step 3: Implement minimal Relentless Rework module**

```javascript
// frontend/src/relentlessLoop.js
export function createExecutionTracker({ stagnationThreshold = 3 } = {}) {
  return {
    history: [],
    stagnationThreshold,
    consecutiveIdenticalErrors: 0,
    lastErrorHash: null,
  }
}

function hashError(str) {
  let hash = 0
  const clean = String(str || '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function recordExecutionOutcome(tracker, { action, command, error, diagnostics, exitCode }) {
  const errSig = `${action}:${command || ''}:${error || diagnostics || ''}`
  const hash = hashError(errSig)

  if (tracker.lastErrorHash === hash && hash !== 0) {
    tracker.consecutiveIdenticalErrors++
  } else {
    tracker.consecutiveIdenticalErrors = 1
    tracker.lastErrorHash = hash
  }

  tracker.history.push({
    action,
    command,
    error,
    diagnostics,
    exitCode,
    timestamp: Date.now(),
  })
}

export function detectStagnation(tracker) {
  return tracker.consecutiveIdenticalErrors >= tracker.stagnationThreshold
}

export function buildReworkFeedbackMessage(tracker, { isStagnant = false } = {}) {
  const last = tracker.history[tracker.history.length - 1]
  let directive = `[AUTONOMOUS REWORK DIRECTIVE]:\n` +
    `The previous execution did not succeed (exit code: ${last?.exitCode ?? 'failure'}).\n` +
    `Diagnostic output:\n${last?.diagnostics || last?.error || 'Execution failed'}\n\n`

  if (isStagnant) {
    directive += `⚠️ STAGNATION DETECTED: You have encountered this exact error multiple times. ` +
      `DO NOT repeat the previous edit. Pivot your strategy: inspect the underlying architecture, ` +
      `read surrounding files, or use a cleaner, alternative implementation.\n\n`
  }

  directive += `Do NOT stop or ask permission. Proceed autonomously: inspect the faulty file(s), apply the fix, and re-run the verification.`
  return directive
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run frontend/src/relentlessLoop.test.js`
Expected: PASS (2 tests passed)

---

### Task 3: Disk-Backed Working Memory (`.yogatik/TASK_PLAN.md`)

**Files:**
- Create: `frontend/src/taskPlanMemory.js`
- Test: `frontend/src/taskPlanMemory.test.js`
- Modify: `frontend/src/agent.js`

**Step 1: Write failing tests for TaskPlanMemory**

```javascript
// frontend/src/taskPlanMemory.test.js
import { describe, it, expect, vi } from 'vitest'
import { initializeTaskPlan, updateTaskPlanItem, renderTaskPlanPrompt } from './taskPlanMemory'

describe('TaskPlanMemory', () => {
  it('initializes task plan with structured phases', () => {
    const plan = initializeTaskPlan('Build OAuth Authentication', [
      'Validate existing auth files',
      'Implement JWT token verification',
      'Run integration tests'
    ])
    expect(plan.title).toBe('Build OAuth Authentication')
    expect(plan.tasks.length).toBe(3)
    expect(plan.tasks[0].status).toBe('pending')
  })

  it('updates task item status and renders ground truth markdown for system prompt', () => {
    const plan = initializeTaskPlan('Feature X', ['Task A', 'Task B'])
    updateTaskPlanItem(plan, 0, 'completed')
    const md = renderTaskPlanPrompt(plan)
    expect(md).toContain('- [x] Task A')
    expect(md).toContain('- [ ] Task B')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run frontend/src/taskPlanMemory.test.js`
Expected: FAIL (`Cannot find module './taskPlanMemory'`)

**Step 3: Implement minimal TaskPlanMemory module**

```javascript
// frontend/src/taskPlanMemory.js
export function initializeTaskPlan(title, taskDescriptions = []) {
  return {
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tasks: taskDescriptions.map((desc, idx) => ({
      id: idx + 1,
      description: desc,
      status: 'pending', // pending | in_progress | completed | failed
    })),
  }
}

export function updateTaskPlanItem(plan, index, status) {
  if (plan.tasks[index]) {
    plan.tasks[index].status = status
    plan.updatedAt = Date.now()
  }
  return plan
}

export function renderTaskPlanPrompt(plan) {
  if (!plan || !plan.tasks?.length) return ''
  const lines = [
    `# ACTIVE TASK PLAN: ${plan.title}`,
    `This plan is your persistent ground truth. Update and execute each phase autonomously:`,
  ]
  plan.tasks.forEach((t) => {
    const icon = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[-]' : '[ ]'
    lines.push(`- ${icon} ${t.description}`)
  })
  return lines.join('\n')
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run frontend/src/taskPlanMemory.test.js`
Expected: PASS (2 tests passed)

---

### Task 4: Integration into `agent.js` & Slash Command `/loop`

**Files:**
- Modify: `frontend/src/agent.js:560-600` (support `relentlessMode: true` option)
- Modify: `frontend/src/components/SlashCommandsMenu.jsx:45-65` (add `/loop` command)
- Modify: `frontend/src/features.js` (add feature toggle `relentlessExecution`)

**Step 1: Write integration test for agent relentless mode**

Verify that when `relentlessMode: true`, errors trigger auto-rework turns instead of terminating early.

**Step 2: Test & Commit**

Run: `npm test`
Expected: All tests pass.
Commit: `git commit -m "feat(agent): autonomous relentless retry, reconnect & rework engine"`
