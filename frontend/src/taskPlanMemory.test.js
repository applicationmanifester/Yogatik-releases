import { describe, it, expect, beforeEach } from 'vitest'
import {
  initializeTaskPlan,
  updateTaskPlanItem,
  renderTaskPlanPrompt,
  parseTaskPlanMarkdown,
  serializeTaskPlanToMarkdown,
  saveTaskPlanToStorage,
  loadTaskPlanFromStorage,
  clearTaskPlanStorage,
  getPendingMission,
} from './taskPlanMemory'

describe('taskPlanMemory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes a structured task plan with pending statuses', () => {
    const plan = initializeTaskPlan('Refactor Auth', ['Write tests', 'Implement handler', 'Verify'])
    expect(plan.title).toBe('Refactor Auth')
    expect(plan.tasks).toHaveLength(3)
    expect(plan.tasks[0].status).toBe('pending')
    expect(plan.tasks[0].description).toBe('Write tests')
  })

  it('updates task item status', () => {
    const plan = initializeTaskPlan('Bugfix', ['Step 1', 'Step 2'])
    updateTaskPlanItem(plan, 0, 'completed')
    updateTaskPlanItem(plan, 1, 'in_progress')
    expect(plan.tasks[0].status).toBe('completed')
    expect(plan.tasks[1].status).toBe('in_progress')
  })

  it('renders task plan as markdown prompt with appropriate checkboxes', () => {
    const plan = initializeTaskPlan('Upgrade Core', ['Step 1', 'Step 2', 'Step 3'])
    updateTaskPlanItem(plan, 0, 'completed')
    updateTaskPlanItem(plan, 1, 'in_progress')
    const prompt = renderTaskPlanPrompt(plan)
    expect(prompt).toContain('# ACTIVE TASK PLAN: Upgrade Core')
    expect(prompt).toContain('- [x] Step 1')
    expect(prompt).toContain('- [-] Step 2')
    expect(prompt).toContain('- [ ] Step 3')
  })

  it('parses markdown task lists correctly into structured plan', () => {
    const md = `# ACTIVE TASK PLAN: Deploy App
- [x] Build bundle
- [-] Upload to CDN
- [ ] Run health check`
    const plan = parseTaskPlanMarkdown(md)
    expect(plan.title).toBe('Deploy App')
    expect(plan.tasks).toHaveLength(3)
    expect(plan.tasks[0].status).toBe('completed')
    expect(plan.tasks[1].status).toBe('in_progress')
    expect(plan.tasks[2].status).toBe('pending')
  })

  it('persists and loads task plans from local storage', () => {
    const plan = initializeTaskPlan('Database Migration', ['Create migration', 'Run migrate'])
    saveTaskPlanToStorage('conv_123', plan)

    const loaded = loadTaskPlanFromStorage('conv_123')
    expect(loaded).toBeDefined()
    expect(loaded.title).toBe('Database Migration')
    expect(loaded.tasks).toHaveLength(2)

    clearTaskPlanStorage('conv_123')
    expect(loadTaskPlanFromStorage('conv_123')).toBeNull()
  })

  it('reports pending mission status correctly', () => {
    const plan = initializeTaskPlan('Build Feature', ['Step 1', 'Step 2'])
    saveTaskPlanToStorage('conv_pending', plan)

    let mission = getPendingMission('conv_pending')
    expect(mission.hasPending).toBe(true)
    expect(mission.completed).toBe(0)
    expect(mission.remaining).toBe(2)

    updateTaskPlanItem(plan, 0, 'completed')
    updateTaskPlanItem(plan, 1, 'completed')
    saveTaskPlanToStorage('conv_pending', plan)

    mission = getPendingMission('conv_pending')
    expect(mission.hasPending).toBe(false)
    expect(mission.completed).toBe(2)
    expect(mission.remaining).toBe(0)
  })
})
