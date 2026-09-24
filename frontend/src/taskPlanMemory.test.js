import { describe, it, expect } from 'vitest'
import {
  initializeTaskPlan,
  updateTaskPlanItem,
  renderTaskPlanPrompt,
  parseTaskPlanMarkdown,
  serializeTaskPlanToMarkdown
} from './taskPlanMemory'

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

  it('serializes and parses markdown roundtrip preserving statuses', () => {
    const plan = initializeTaskPlan('Core Setup', ['Init repo', 'Setup CI', 'Write tests'])
    updateTaskPlanItem(plan, 0, 'completed')
    updateTaskPlanItem(plan, 1, 'in_progress')

    const md = serializeTaskPlanToMarkdown(plan)
    expect(md).toContain('- [x] Init repo')
    expect(md).toContain('- [-] Setup CI')
    expect(md).toContain('- [ ] Write tests')

    const parsed = parseTaskPlanMarkdown(md)
    expect(parsed.tasks[0].status).toBe('completed')
    expect(parsed.tasks[1].status).toBe('in_progress')
    expect(parsed.tasks[2].status).toBe('pending')
  })
})
