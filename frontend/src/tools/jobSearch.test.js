/**
 * Field report: a "197 Remote Python Jobs" document was generated whose own
 * tables read "2 results (Wikipedia pages)", "0 results" and "Tool returned
 * index pages, not job listings". The document generator was fine — job_search
 * fed it rubbish and reported success.
 *
 * Two causes: site: operators mean nothing to a metasearch that includes
 * Wikipedia, and every result was dressed up as a job with invented company and
 * location fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./webSearch', () => ({ webSearchTool: { execute: vi.fn() } }))

const { webSearchTool } = await import('./webSearch')
const { jobSearchTool } = await import('./jobSearch')

const results = (...rs) => webSearchTool.execute.mockResolvedValue({ results: rs })

const WIKIPEDIA = {
  title: 'Python (programming language) - Wikipedia',
  url: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
  snippet: 'Python is a high-level programming language.',
}
const REAL_JOB = {
  title: 'Senior Python Engineer at Acme - Remote | Indeed.com',
  url: 'https://www.indeed.com/viewjob?jk=abc123',
  snippet: 'Acme is hiring. 5 years experience. Remote.',
}

beforeEach(() => vi.clearAllMocks())

describe('job_search result quality', () => {
  it('drops results that are not from a job portal', async () => {
    results(WIKIPEDIA, REAL_JOB)
    const res = await jobSearchTool.execute({ role: 'Python Engineer' })
    expect(res.jobs).toHaveLength(1)
    expect(res.jobs[0].url).toContain('indeed.com')
  })

  it('does NOT report success when every result was noise', async () => {
    results(WIKIPEDIA)
    const res = await jobSearchTool.execute({ role: 'Python Engineer' })
    expect(res.success).toBe(false)
    expect(res.count).toBe(0)
  })

  it('says WHY it found nothing, so the model does not invent findings', async () => {
    results(WIKIPEDIA)
    const res = await jobSearchTool.execute({ role: 'Python Engineer' })
    expect(res.error || res.note).toMatch(/block|automated|listing/i)
  })

  it('never invents a company or a location', async () => {
    results(REAL_JOB)
    const res = await jobSearchTool.execute({ role: 'Python Engineer' })
    const job = res.jobs[0]
    expect(job.company).not.toBe('Featured Employer')
    expect(job.location).not.toBe('Multiple Locations')
  })

  it('leaves an unknown field out rather than filling it with a placeholder', async () => {
    results({ title: 'Some Role | Naukri.com', url: 'https://www.naukri.com/job-listings-x', snippet: '' })
    const res = await jobSearchTool.execute({ role: 'Developer' })
    const job = res.jobs[0]
    expect(job.company === undefined || typeof job.company === 'string').toBe(true)
    expect(job.company).not.toBe('Featured Employer')
  })

  it('rejects a portal search index page — it is not a listing', async () => {
    results({
      title: '197 Remote Python jobs available | Indeed.com',
      url: 'https://www.indeed.com/q-remote-python-jobs.html',
      snippet: 'Browse 197 jobs',
    })
    const res = await jobSearchTool.execute({ role: 'Python Engineer' })
    expect(res.jobs).toHaveLength(0)
    expect(res.success).toBe(false)
  })

  it('keeps a genuine listing URL', async () => {
    results(REAL_JOB, {
      title: 'Backend Engineer - LinkedIn',
      url: 'https://www.linkedin.com/jobs/view/3812345678',
      snippet: 'Hiring now',
    })
    const res = await jobSearchTool.execute({ role: 'Python Engineer' })
    expect(res.jobs).toHaveLength(2)
    expect(res.success).toBe(true)
  })

  it('still refuses an empty role', async () => {
    const res = await jobSearchTool.execute({})
    expect(res.success).toBe(false)
  })

  it('survives the search engine failing', async () => {
    webSearchTool.execute.mockRejectedValue(new Error('offline'))
    const res = await jobSearchTool.execute({ role: 'Dev' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/offline|failed/i)
  })
})
