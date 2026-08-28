/**
 * Async Job Queue & Worker Polling Infrastructure
 *
 * Provides background job scheduling, progress streaming, and polling
 * for long-running workflows (Research Swarm, LaTeX compilation, Codebase Audits).
 */

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Job<TPayload = unknown, TResult = unknown> {
  id: string
  jobType: string
  status: JobStatus
  progress: number
  payload: TPayload
  result?: TResult
  error?: string
  logs: string[]
  createdAt: number
  startedAt?: number
  completedAt?: number
}

class InMemoryJobQueue {
  private jobs: Map<string, Job> = new Map()
  private workers: Map<string, AbortController> = new Map()

  createJob<TPayload, TResult>(jobType: string, payload: TPayload): Job<TPayload, TResult> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: Job<TPayload, TResult> = {
      id,
      jobType,
      status: 'queued',
      progress: 0,
      payload,
      logs: [`[${new Date().toISOString()}] Job created in queue`],
      createdAt: Date.now(),
    }
    this.jobs.set(id, job as Job)
    return job
  }

  getJob(id: string): Job | null {
    return this.jobs.get(id) || null
  }

  async runJob<TPayload, TResult>(
    id: string,
    workerFn: (
      payload: TPayload,
      helpers: {
        signal: AbortSignal
        updateProgress: (percent: number, log?: string) => void
      }
    ) => Promise<TResult>
  ): Promise<Job<TPayload, TResult>> {
    const job = this.jobs.get(id)
    if (!job) throw new Error(`Job ${id} not found`)

    const controller = new AbortController()
    this.workers.set(id, controller)

    job.status = 'running'
    job.startedAt = Date.now()
    job.logs.push(`[${new Date().toISOString()}] Worker started execution`)

    try {
      const result = await workerFn(job.payload as TPayload, {
        signal: controller.signal,
        updateProgress: (percent, log) => {
          job.progress = Math.min(100, Math.max(0, percent))
          if (log) job.logs.push(`[${new Date().toISOString()}] ${log}`)
        },
      })

      job.status = 'completed'
      job.progress = 100
      job.result = result
      job.completedAt = Date.now()
      job.logs.push(`[${new Date().toISOString()}] Job completed successfully`)
    } catch (err: any) {
      if (controller.signal.aborted) {
        job.status = 'cancelled'
        job.logs.push(`[${new Date().toISOString()}] Job cancelled by client`)
      } else {
        job.status = 'failed'
        job.error = err?.message || String(err)
        job.logs.push(`[${new Date().toISOString()}] Job failed: ${job.error}`)
      }
    } finally {
      this.workers.delete(id)
    }

    return job as Job<TPayload, TResult>
  }

  cancelJob(id: string): boolean {
    const controller = this.workers.get(id)
    if (controller) {
      controller.abort()
      return true
    }
    const job = this.jobs.get(id)
    if (job && job.status === 'queued') {
      job.status = 'cancelled'
      return true
    }
    return false
  }

  listJobs(filterType?: string): Job[] {
    const all = Array.from(this.jobs.values())
    if (!filterType) return all
    return all.filter((j) => j.jobType === filterType)
  }
}

export const jobQueue = new InMemoryJobQueue()
