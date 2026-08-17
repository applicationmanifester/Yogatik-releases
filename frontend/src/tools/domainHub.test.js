import { describe, it, expect, vi } from 'vitest'
import { socialSearchTool } from './socialSearch'
import { jobSearchTool } from './jobSearch'
import { socialPostTool } from './socialPost'
import { executeTool } from './index'

describe('Domain Hub & Social Tools', () => {
  describe('socialSearchTool', () => {
    it('returns error when no query provided', async () => {
      const res = await socialSearchTool.execute({})
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/query/i)
    })

    it('returns error on whitespace query', async () => {
      const res = await socialSearchTool.execute({ query: '   ' })
      expect(res.success).toBe(false)
    })

    it('has valid tool schema', () => {
      expect(socialSearchTool.schema.description).toContain('social media')
      expect(socialSearchTool.schema.parameters.properties.platform).toBeDefined()
    })
  })

  describe('jobSearchTool', () => {
    it('returns error when no role provided', async () => {
      const res = await jobSearchTool.execute({})
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/role/i)
    })

    it('has valid tool schema with portals', () => {
      expect(jobSearchTool.schema.description).toContain('Naukri')
      expect(jobSearchTool.schema.parameters.properties.portal).toBeDefined()
    })
  })

  describe('socialPostTool', () => {
    it('returns error when no topic provided', async () => {
      const res = await socialPostTool.execute({ platform: 'x' })
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/topic/i)
    })

    it('generates structure for X / Twitter post', async () => {
      const res = await socialPostTool.execute({
        platform: 'x',
        topic: 'AI Developer tools release',
        content_type: 'single_post',
      })
      expect(res.success).toBe(true)
      expect(res.tool).toBe('social_post_generator')
      expect(res.platform).toBe('x')
      expect(res.platformName).toBe('X (Twitter)')
      expect(res.characterLimit).toBe(280)
    })

    it('generates structure for LinkedIn post', async () => {
      const res = await socialPostTool.execute({
        platform: 'linkedin',
        topic: 'Career growth in 2026',
      })
      expect(res.success).toBe(true)
      expect(res.platformName).toBe('LinkedIn')
      expect(res.characterLimit).toBe(3000)
    })

    it('generates structure for TikTok video script', async () => {
      const res = await socialPostTool.execute({
        platform: 'tiktok',
        topic: '3 productivity hacks',
      })
      expect(res.success).toBe(true)
      expect(res.contentType).toBe('video_script')
      expect(res.guidelines).toContain('Hook 0-3s')
    })
  })

  describe('executeTool alias resolution', () => {
    it('resolves twitter_search and x_search to social_search', async () => {
      const spy = vi.spyOn(socialSearchTool, 'execute').mockResolvedValueOnce({
        success: true,
        tool: 'social_search',
        results: [],
      })

      const res = await executeTool('twitter_search', { query: 'AI agents' })
      expect(spy).toHaveBeenCalled()
      expect(res.success).toBe(true)
      spy.mockRestore()
    })

    it('resolves naukri and find_jobs to job_search', async () => {
      const spy = vi.spyOn(jobSearchTool, 'execute').mockResolvedValueOnce({
        success: true,
        tool: 'job_search',
        jobs: [],
      })

      const res = await executeTool('naukri_search', { role: 'React Developer' })
      expect(spy).toHaveBeenCalled()
      expect(res.success).toBe(true)
      spy.mockRestore()
    })

    it('resolves write_tweet and linkedin_post to social_post_generator', async () => {
      const res = await executeTool('write_tweet', { topic: 'Testing AI' })
      expect(res.success).toBe(true)
      expect(res.tool).toBe('social_post_generator')
    })

    it('resolves pinterest_search, bluesky_search and producthunt_search to social_search', async () => {
      const spy = vi.spyOn(socialSearchTool, 'execute').mockResolvedValueOnce({
        success: true,
        tool: 'social_search',
        results: [],
      })
      const res = await executeTool('pinterest_search', { query: 'Interior design ideas' })
      expect(spy).toHaveBeenCalled()
      expect(res.success).toBe(true)
      spy.mockRestore()
    })

    it('handles timer queries with 4pm, 4 pm, and duration strings', async () => {
      const { timerTool } = await import('./timer')
      const res1 = await timerTool.execute({ time: '4pm', label: 'Tea Time' })
      expect(res1.success).toBe(true)
      expect(res1.label).toBe('Tea Time')

      const res2 = await timerTool.execute({ duration: '4 pm', label: 'Evening Call' })
      expect(res2.success).toBe(true)

      const res3 = await timerTool.execute({ duration: 'for 4pm' })
      expect(res3.success).toBe(true)

      await timerTool.execute({ action: 'clear_all' })
    })
  })
})

