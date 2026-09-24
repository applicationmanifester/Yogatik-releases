/**
 * Disk-Backed Task Plan Memory
 * Tracks high-level multi-phase project tasks, parses and renders markdown,
 * and maintains continuous execution context across compaction boundaries.
 */

/**
 * Initializes a new task plan object.
 * @param {string} title
 * @param {string[]} taskDescriptions
 * @returns {object} Task plan
 */
export function initializeTaskPlan(title = 'Project Task Plan', taskDescriptions = []) {
  return {
    title: String(title).trim() || 'Project Task Plan',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tasks: (Array.isArray(taskDescriptions) ? taskDescriptions : []).map((desc, idx) => ({
      id: idx + 1,
      description: String(desc).trim(),
      status: 'pending', // pending | in_progress | completed | failed
    })),
  }
}

/**
 * Updates status of a task item.
 * @param {object} plan
 * @param {number} index
 * @param {'pending'|'in_progress'|'completed'|'failed'} status
 * @returns {object} Updated plan
 */
export function updateTaskPlanItem(plan, index, status) {
  if (plan?.tasks && plan.tasks[index]) {
    plan.tasks[index].status = status
    plan.updatedAt = Date.now()
  }
  return plan
}

/**
 * Renders task plan as a markdown section for LLM system prompt injection.
 * @param {object} plan
 * @returns {string} Markdown string
 */
export function renderTaskPlanPrompt(plan) {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return ''
  const lines = [
    `# ACTIVE TASK PLAN: ${plan.title}`,
    `This plan is your persistent ground truth. Advance through each task autonomously:`,
  ]
  plan.tasks.forEach((t) => {
    let icon = '[ ]'
    if (t.status === 'completed') icon = '[x]'
    else if (t.status === 'in_progress') icon = '[-]'
    else if (t.status === 'failed') icon = '[!]'
    lines.push(`- ${icon} ${t.description}`)
  })
  return lines.join('\n')
}

/**
 * Serializes task plan to full markdown file format for writing to disk.
 * @param {object} plan
 * @returns {string} Full markdown document
 */
export function serializeTaskPlanToMarkdown(plan) {
  return `${renderTaskPlanPrompt(plan)}\n\n*Last updated: ${new Date(plan.updatedAt || Date.now()).toISOString()}*\n`
}

/**
 * Parses markdown task list into structured task plan object.
 * @param {string} markdown
 * @returns {object} Structured plan
 */
export function parseTaskPlanMarkdown(markdown = '') {
  const lines = String(markdown).split('\n')
  let title = 'Project Task Plan'
  const tasks = []

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(?:ACTIVE TASK PLAN:\s*)?(.*)$/i)
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim()
      continue
    }

    const taskMatch = line.match(/^\s*-\s*\[([ xX\-!])\]\s*(.*)$/)
    if (taskMatch) {
      const char = taskMatch[1].toLowerCase()
      let status = 'pending'
      if (char === 'x') status = 'completed'
      else if (char === '-') status = 'in_progress'
      else if (char === '!') status = 'failed'

      tasks.push({
        id: tasks.length + 1,
        description: taskMatch[2].trim(),
        status,
      })
    }
  }

  return {
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tasks,
  }
}
