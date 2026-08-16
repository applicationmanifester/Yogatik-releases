// Scheduler / Cron Daemon — runs in Electron main process (survives window hide)
// Natural-language scheduling for reports, backups, briefings — running unattended.

const { ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
// fsBridge has never exported getWindow, so this was `undefined` and executeJob
// threw "getWindow is not a function" the moment any scheduled job fired.
// main.cjs now injects the real getter through registerSchedulerIPC.
let getWindow = () => null

let scheduledJobs = []
let jobTimers = new Map()
let schedulerDbPath = null

function getSchedulerDb() {
  if (!schedulerDbPath) {
    schedulerDbPath = path.join(require('electron').app.getPath('userData'), 'scheduler_jobs.json')
  }
  return schedulerDbPath
}

function loadJobs() {
  try {
    const data = fs.readFileSync(getSchedulerDb(), 'utf8')
    scheduledJobs = JSON.parse(data) || []
    console.log(`[Scheduler] Loaded ${scheduledJobs.length} jobs`)
  } catch {
    scheduledJobs = []
  }
  return scheduledJobs
}

function saveJobs() {
  try {
    fs.writeFileSync(getSchedulerDb(), JSON.stringify(scheduledJobs, null, 2), 'utf8')
  } catch (e) {
    console.error('[Scheduler] Failed to save jobs:', e)
  }
}

// Parse natural language to cron expression
// Supports: "every day at 9am", "every monday at 10:30", "daily at 5pm", "weekly on friday at 2pm",
// "monthly on the 1st at 8am", "every 30 minutes", "every hour", "at 3:45pm"
function parseNaturalLanguageToCron(natural) {
  const input = natural.toLowerCase().trim()
  
  // "every X minutes/hours"
  const everyMatch = input.match(/every\s+(\d+)\s*(minute|minutes|hour|hours)/)
  if (everyMatch) {
    const value = parseInt(everyMatch[1])
    const unit = everyMatch[2].startsWith('min') ? 'minute' : 'hour'
    if (unit === 'minute') {
      return `*/${value} * * * *`
    } else {
      return `0 */${value} * * *`
    }
  }
  
  // "every hour" / "hourly"
  if (input.includes('every hour') || input === 'hourly') {
    return '0 * * * *'
  }
  
  // "every day" / "daily" / "every day at HH:MM"
  const dailyMatch = input.match(/(every day|daily)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/)
  if (dailyMatch) {
    let hour = 9, minute = 0
    if (dailyMatch[2]) {
      hour = parseInt(dailyMatch[2])
      minute = dailyMatch[3] ? parseInt(dailyMatch[3]) : 0
      if (dailyMatch[4] === 'pm' && hour < 12) hour += 12
      if (dailyMatch[4] === 'am' && hour === 12) hour = 0
    }
    return `${minute} ${hour} * * *`
  }
  
  // "weekly on DAY at HH:MM" / "every DAY at HH:MM"
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayMatch = input.match(/(weekly|every)\s+on\s+(\w+)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/)
  if (dayMatch) {
    const dayName = dayMatch[2].toLowerCase()
    const dayIndex = days.indexOf(dayName)
    if (dayIndex === -1) throw new Error(`Unknown day: ${dayMatch[2]}`)
    
    let hour = 9, minute = 0
    if (dayMatch[3]) {
      hour = parseInt(dayMatch[3])
      minute = dayMatch[4] ? parseInt(dayMatch[4]) : 0
      if (dayMatch[5] === 'pm' && hour < 12) hour += 12
      if (dayMatch[5] === 'am' && hour === 12) hour = 0
    }
    return `${minute} ${hour} * * ${dayIndex}`
  }
  
  // "monthly on the Nth at HH:MM"
  const monthlyMatch = input.match(/monthly\s+on\s+(?:the\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/)
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1])
    if (day < 1 || day > 31) throw new Error('Day of month must be 1-31')
    
    let hour = 9, minute = 0
    if (monthlyMatch[2]) {
      hour = parseInt(monthlyMatch[2])
      minute = monthlyMatch[3] ? parseInt(monthlyMatch[3]) : 0
      if (monthlyMatch[4] === 'pm' && hour < 12) hour += 12
      if (monthlyMatch[4] === 'am' && hour === 12) hour = 0
    }
    return `${minute} ${hour} ${day} * *`
  }
  
  // "at HH:MM" (assumes daily)
  const atMatch = input.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (atMatch) {
    let hour = parseInt(atMatch[1])
    const minute = atMatch[2] ? parseInt(atMatch[2]) : 0
    if (atMatch[3] === 'pm' && hour < 12) hour += 12
    if (atMatch[3] === 'am' && hour === 12) hour = 0
    return `${minute} ${hour} * * *`
  }
  
  // Try to parse as cron expression directly (5 fields)
  const parts = input.split(/\s+/)
  if (parts.length === 5) {
    // Basic validation
    return input
  }
  
  throw new Error(`Could not parse schedule: "${natural}". Try: "every day at 9am", "weekly on monday at 10:30", "every 30 minutes", "monthly on the 1st at 8am", or a 5-field cron expression.`)
}

// Convert cron to human readable
function cronToHuman(cron) {
  const [min, hour, dom, month, dow] = cron.split(/\s+/)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  const timeStr = `${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  
  if (min.startsWith('*/')) {
    return `Every ${min.slice(2)} minutes`
  }
  if (hour.startsWith('*/')) {
    return `Every ${hour.slice(2)} hours at minute ${min}`
  }
  
  let freq = ''
  if (dow !== '*') {
    const dayNames = dow.split(',').map(d => days[parseInt(d)]).join(', ')
    freq = `Weekly on ${dayNames}`
  } else if (dom !== '*') {
    freq = `Monthly on day ${dom}`
  } else {
    freq = 'Daily'
  }
  
  return `${freq} at ${timeStr}`
}

// Calculate next run time from cron
function getNextRun(cron) {
  // Simple implementation - in production use a proper cron parser like cron-parser
  const now = new Date()
  const [min, hour, dom, month, dow] = cron.split(/\s+/)
  
  // For simple cases, estimate next run
  let next = new Date(now)
  next.setSeconds(0, 0)
  
  const targetHour = parseInt(hour)
  const targetMin = parseInt(min)
  
  if (dow !== '*') {
    // Weekly
    const targetDays = dow.split(',').map(d => parseInt(d))
    const currentDay = now.getDay()
    let daysAhead = 7
    for (const d of targetDays) {
      let diff = d - currentDay
      if (diff < 0 || (diff === 0 && (now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMin)))) {
        diff += 7
      }
      if (diff < daysAhead) daysAhead = diff
    }
    next.setDate(now.getDate() + daysAhead)
  } else if (dom !== '*') {
    // Monthly
    const targetDom = parseInt(dom)
    next.setDate(targetDom)
    if (next <= now) {
      next.setMonth(next.getMonth() + 1)
    }
  } else {
    // Daily or hourly
    next.setHours(targetHour, targetMin)
    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }
  }
  
  return next.toISOString()
}

// Execute a job by sending IPC to renderer
async function executeJob(job) {
  const win = getWindow()
  if (!win || win.isDestroyed()) {
    console.log('[Scheduler] No window available for job:', job.id)
    return { success: false, error: 'No window available' }
  }
  
  console.log('[Scheduler] Executing job:', job.name, job.id)
  
  return new Promise((resolve) => {
    const channel = `scheduler-job-${job.id}-${Date.now()}`
    
    // Listen for result
    const handleResult = (event, result) => {
      if (event.sender !== win.webContents) return
      ipcMain.removeListener(channel, handleResult)
      resolve(result)
    }
    ipcMain.on(channel, handleResult)
    
    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      ipcMain.removeListener(channel, handleResult)
      resolve({ success: false, error: 'Job timeout (5 min)' })
    }, 5 * 60 * 1000)
    
    // Send job to renderer
    win.webContents.send('scheduler:execute-job', {
      jobId: job.id,
      channel,
      type: job.type,
      payload: job.payload
    })
    
    // Clean up timeout on resolve
    const originalResolve = resolve
    resolve = (result) => {
      clearTimeout(timeout)
      originalResolve(result)
    }
  })
}

// Schedule a job
function scheduleJob(job) {
  // Clear existing timer if any
  if (jobTimers.has(job.id)) {
    clearTimeout(jobTimers.get(job.id))
  }
  
  if (!job.enabled) {
    console.log('[Scheduler] Job disabled, not scheduling:', job.id)
    return
  }
  
  try {
    const nextRun = getNextRun(job.cron)
    const now = new Date()
    const delay = new Date(nextRun).getTime() - now.getTime()
    
    if (delay <= 0) {
      console.log('[Scheduler] Next run in past, executing now:', job.id)
      executeJob(job).then(result => {
        job.lastRun = new Date().toISOString()
        job.lastResult = result
        saveJobs()
        scheduleJob(job) // Reschedule
      })
      return
    }
    
    console.log('[Scheduler] Job', job.id, 'scheduled for', nextRun, `(${Math.round(delay/1000/60)} min)`)
    
    const timer = setTimeout(() => {
      jobTimers.delete(job.id)
      executeJob(job).then(result => {
        job.lastRun = new Date().toISOString()
        job.lastResult = result
        saveJobs()
        scheduleJob(job) // Reschedule for next run
      })
    }, delay)
    
    jobTimers.set(job.id, timer)
    job.nextRun = nextRun
    saveJobs()
  } catch (e) {
    console.error('[Scheduler] Failed to schedule job:', job.id, e)
    job.nextRun = null
    job.lastError = e.message
    saveJobs()
  }
}

// Start all jobs
function startScheduler() {
  loadJobs()
  for (const job of scheduledJobs) {
    scheduleJob(job)
  }
  console.log('[Scheduler] Started with', scheduledJobs.length, 'jobs')
}

// Stop all jobs
function stopScheduler() {
  for (const timer of jobTimers.values()) {
    clearTimeout(timer)
  }
  jobTimers.clear()
  console.log('[Scheduler] Stopped')
}

// IPC Handlers
function registerSchedulerIPC(opts = {}) {
  if (typeof opts.getWindow === 'function') getWindow = opts.getWindow

  // Get all jobs
  ipcMain.handle('scheduler:get-jobs', () => {
    return scheduledJobs.map(job => ({
      ...job,
      nextRun: job.nextRun || null,
      humanSchedule: cronToHuman(job.cron)
    }))
  })
  
  // Create job
  ipcMain.handle('scheduler:create-job', async (_e, jobData) => {
    try {
      const cron = parseNaturalLanguageToCron(jobData.schedule)
      const job = {
        id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: jobData.name,
        description: jobData.description || '',
        cron,
        scheduleNatural: jobData.schedule,
        type: jobData.type, // 'workflow', 'skill', 'agent', 'backup', 'briefing', 'custom'
        payload: jobData.payload || {},
        enabled: true,
        createdAt: new Date().toISOString(),
        lastRun: null,
        lastResult: null,
        lastError: null,
        nextRun: null
      }
      scheduledJobs.push(job)
      saveJobs()
      scheduleJob(job)
      return { success: true, job }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  // Update job
  ipcMain.handle('scheduler:update-job', async (_e, { id, updates }) => {
    const idx = scheduledJobs.findIndex(j => j.id === id)
    if (idx === -1) return { success: false, error: 'Job not found' }
    
    const job = scheduledJobs[idx]
    const newJob = { ...job, ...updates }
    
    if (updates.schedule) {
      try {
        newJob.cron = parseNaturalLanguageToCron(updates.schedule)
        newJob.scheduleNatural = updates.schedule
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
    
    scheduledJobs[idx] = newJob
    saveJobs()
    scheduleJob(newJob)
    return { success: true, job: newJob }
  })
  
  // Delete job
  ipcMain.handle('scheduler:delete-job', async (_e, id) => {
    const idx = scheduledJobs.findIndex(j => j.id === id)
    if (idx === -1) return { success: false, error: 'Job not found' }
    
    if (jobTimers.has(id)) {
      clearTimeout(jobTimers.get(id))
      jobTimers.delete(id)
    }
    
    scheduledJobs.splice(idx, 1)
    saveJobs()
    return { success: true }
  })
  
  // Toggle job enabled
  ipcMain.handle('scheduler:toggle-job', async (_e, id) => {
    const job = scheduledJobs.find(j => j.id === id)
    if (!job) return { success: false, error: 'Job not found' }
    
    job.enabled = !job.enabled
    saveJobs()
    scheduleJob(job)
    return { success: true, job }
  })
  
  // Run job now
  ipcMain.handle('scheduler:run-now', async (_e, id) => {
    const job = scheduledJobs.find(j => j.id === id)
    if (!job) return { success: false, error: 'Job not found' }
    
    const result = await executeJob(job)
    job.lastRun = new Date().toISOString()
    job.lastResult = result
    saveJobs()
    scheduleJob(job) // Reschedule
    return { success: true, result }
  })
  
  // Parse natural language to cron (for UI preview)
  ipcMain.handle('scheduler:parse-schedule', (_e, natural) => {
    try {
      const cron = parseNaturalLanguageToCron(natural)
      return { success: true, cron, human: cronToHuman(cron), nextRun: getNextRun(cron) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  // Get job history/logs
  ipcMain.handle('scheduler:get-job-logs', (_e, id) => {
    const job = scheduledJobs.find(j => j.id === id)
    if (!job) return { success: false, error: 'Job not found' }
    return { 
      success: true, 
      logs: job.logs || [],
      lastRun: job.lastRun,
      lastResult: job.lastResult,
      lastError: job.lastError
    }
  })
}

module.exports = { startScheduler, stopScheduler, registerSchedulerIPC, loadJobs, saveJobs, parseNaturalLanguageToCron, cronToHuman }